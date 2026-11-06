const express = require('express');
const jwt = require('jsonwebtoken');
const { z } = require('zod');

module.exports = function (prisma, resend) {
  const router = express.Router();

  // --- JWT Helper (IDOR FIX) ---
  function getUserIdFromToken(req){
    const authHeader = req.headers.authorization;
    if(!authHeader) throw new Error("Unauthorized");
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return decoded.id;
  }

  // --- ZOD VALIDATION (UPDATED FOR BUY NOW) ---
  const checkoutSchema = z.object({
    addressId: z.number().int().positive(),
    customDeliveryDays: z.number().int().min(1).max(15).optional(),
    paymentType: z.enum(['PREPAID', 'COD_ADVANCE', 'COD']).default('PREPAID'),
    
    // Naye fields "Buy Now" feature ke liye
    checkoutMode: z.enum(['CART', 'BUY_NOW']).default('CART'),
    buyNowItem: z.object({
      productId: z.number().int().positive(),
      quantity: z.number().int().positive().default(1),
      size: z.string().optional()
    }).optional()
  });

  // =========================================================================
  // 1. CHECKOUT API - SECURED WITH STOCK LOCK, BUY_NOW MODE + EMAIL
  // =========================================================================
  router.post('/order/checkout', async (req, res) => {
    try {
      const userId = getUserIdFromToken(req);
      const parsed = checkoutSchema.safeParse(req.body);
      if(!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
      
      const { addressId, customDeliveryDays, paymentType, checkoutMode, buyNowItem } = parsed.data;

      // 0. Verify User Profile & Phone Number & Email
      const user = await prisma.user.findUnique({
        where: { id: Number(userId) },
        include: { profile: true }
      });
      
      if (!user || !user.profile || !user.profile.phone) {
        return res.status(400).json({ error: "Phone verification required before placing an order." });
      }

      // 1. Verify Address
      const address = await prisma.address.findFirst({
        where: { id: Number(addressId), userId: Number(userId) }
      });
      if (!address) {
        return res.status(403).json({ error: "Invalid address or not yours" });
      }

      let orderItemsToProcess = [];
      let cartIdToClear = null;

      // 2. CHECKOUT MODE LOGIC (CART vs BUY NOW)
      if (checkoutMode === 'CART') {
        const cart = await prisma.cart.findUnique({
          where: { userId: Number(userId) },
          include: { items: { include: { product: true } } }
        });
        if (!cart || cart.items.length === 0) {
          return res.status(400).json({ error: "Your cart is empty" });
        }
        orderItemsToProcess = cart.items;
        cartIdToClear = cart.id; // Cart mode mein cart delete karne ke liye ID save ki
      } 
      else if (checkoutMode === 'BUY_NOW') {
        if (!buyNowItem || !buyNowItem.productId) {
          return res.status(400).json({ error: "Buy Now item details are missing." });
        }
        const product = await prisma.product.findUnique({ where: { id: Number(buyNowItem.productId) } });
        if (!product) return res.status(404).json({ error: "Product not found" });
        
        // Single item manually array mein daal diya
        orderItemsToProcess = [{
          productId: product.id,
          quantity: Number(buyNowItem.quantity) || 1,
          size: buyNowItem.size || "M",
          product: product
        }];
      }

      // 3. Subtotal calculation
      const subtotal = orderItemsToProcess.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);

      // 4. StoreConfig se GST + Delivery
      const config = await prisma.storeConfig.findFirst({ where: { id: 1 } });
      const gstRate = config?.gstRate || 5.0;
      const deliveryFeeConfig = config?.deliveryFee || 49;
      const freeThreshold = config?.freeDeliveryThreshold || 999;

      const gstAmount = parseFloat(((subtotal * gstRate) / 100).toFixed(2));
      const deliveryFee = subtotal >= freeThreshold ? 0 : deliveryFeeConfig;
      const finalTotal = parseFloat((subtotal + gstAmount + deliveryFee).toFixed(2));

      // --- FAKE ORDER / RTO PREVENTION RULE ---
      const previousOrdersCount = await prisma.order.count({ where: { userId: Number(userId) } });
      if (previousOrdersCount === 0 && paymentType === 'COD') {
        return res.status(400).json({ 
          error: "Security Policy: Your first order must be Prepaid or require ₹99 Advance COD." 
        });
      }

      const deliveryDays = customDeliveryDays ? Number(customDeliveryDays) : 5;
      const expectedDate = new Date();
      expectedDate.setDate(expectedDate.getDate() + deliveryDays);

      // 5. Transaction: STOCK LOCK + Order create + Cart clear (If CART Mode)
      const order = await prisma.$transaction(async (tx) => {
        // Stock check & decrement
        for(const item of orderItemsToProcess){
          const updated = await tx.product.updateMany({
            where: { id: item.productId, stock: { gte: item.quantity } },
            data: { stock: { decrement: item.quantity } }
          });
          if(updated.count === 0){
            throw new Error(`Out of stock: ${item.product?.name || item.productId}`);
          }
        }

        // Create Order record
        const newOrder = await tx.order.create({
          data: {
            userId: Number(userId),
            addressId: Number(addressId),
            shippingName: address.name,
            shippingPhone: address.phone,
            shippingLine: address.addressLine,
            shippingCity: address.city,
            shippingState: address.state,
            shippingPincode: address.pincode,
            subtotal, gstAmount, deliveryFee, totalAmount: finalTotal,
            status: "PENDING",
            expectedDeliveryDate: expectedDate,
            items: {
              create: orderItemsToProcess.map(item => ({
                productId: item.productId,
                size: item.size || "M",
                quantity: item.quantity,
                price: item.product.price
              }))
            }
          },
          include: { items: { include: { product: true } }, address: true }
        });

        // 🚨 Sirf agar checkoutMode 'CART' tha, tabhi cart items clear honge! Buy Now pe cart safe rahega.
        if (checkoutMode === 'CART' && cartIdToClear) {
          await tx.cartItem.deleteMany({ where: { cartId: cartIdToClear } });
        }
        
        return newOrder;
      });

      // 🚀 6. SEND ORDER CONFIRMATION & ADMIN NOTIFICATION EMAILS VIA RESEND
      if (resend) {
        try {
          // A. Admin Email Notification to syvora.official.acc@gmail.com
          const adminEmail = "syvora.official.acc@gmail.com";
          const adminMailRes = await resend.emails.send({
            from: "Syvora <onboarding@resend.dev>",
            replyTo: user.email,
            to: [adminEmail],
            subject: `🚨 NEW ORDER RECEIVED #SYV-${order.id}`,
            html: `
              <div style="font-family: Arial, sans-serif; padding: 20px; color: #3D2B1F; background: #FAF7F2; border-radius: 10px;">
                <h2 style="color: #4A3024;">🎉 New order!</h2>
                <p><b>Order Mode:</b> ${checkoutMode}</p>
                <p><b>Order ID:</b> #SYV-${order.id}</p>
                <p><b>Customer Email:</b> ${user.email}</p>
                <p><b>Customer Name:</b> ${user.profile?.name || 'N/A'}</p>
                <p><b>Customer Phone:</b> ${user.profile?.phone || 'N/A'}</p>
                <div style="background: #FFFFFF; padding: 15px; border-radius: 8px; margin: 15px 0; border: 1px solid #D8C9BA;">
                  <p><strong>Shipping Address:</strong> ${order.shippingLine}, ${order.shippingCity} - ${order.shippingPincode}</p>
                  <p><strong>Total Amount:</strong> ₹${order.totalAmount}</p>
                </div>
                <p style="color: #8B6B4A; font-weight: bold;">Team Syvora System</p>
              </div>
            `
          });
          console.log(`[ORDER EMAIL] Admin notification sent response:`, adminMailRes);

          // B. Customer Confirmation Email
          if (user.email) {
            const userMailRes = await resend.emails.send({
              from: "Syvora <onboarding@resend.dev>",
              replyTo: "syvora.official.acc@gmail.com",
              to: [user.email],
              subject: `🎉 Order Confirmed! #SYV-${order.id} - Syvora`,
              html: `
                <div style="font-family: Arial, sans-serif; padding: 20px; color: #3D2B1F; background: #FAF7F2; border-radius: 10px;">
                  <h2 style="color: #4A3024;">Thank you for your order, ${user.profile?.name || 'Fashionista'}!</h2>
                  <p>Your order has been successfully placed via ${checkoutMode === 'BUY_NOW' ? 'Buy Now' : 'Cart'} and is being prepared.</p>
                  <div style="background: #FFFFFF; padding: 15px; border-radius: 8px; margin: 15px 0; border: 1px solid #D8C9BA;">
                    <p><strong>Order ID:</strong> #SYV-${order.id}</p>
                    <p><strong>Grand Total:</strong> ₹${order.totalAmount}</p>
                    <p><strong>Shipping Address:</strong> ${order.shippingLine}, ${order.shippingCity} - ${order.shippingPincode}</p>
                  </div>
                  <p>We will notify you once your items are shipped.</p>
                  <p style="color: #8B6B4A; font-weight: bold; margin-top: 20px;">Team Syvora</p>
                </div>
              `
            });
            console.log(`[ORDER EMAIL] Customer confirmation sent response:`, userMailRes);
          }

        } catch (mailErr) {
          console.error("❌ Resend Checkout Email Error:", mailErr.message);
        }
      }

      res.status(201).json({ message: "Order placed successfully!", order });
    } catch (error) {
      console.error("Checkout Error:", error);
      if(error.message === "Unauthorized") return res.status(401).json({ error: "Invalid token" });
      if(error.message.includes("Out of stock")) return res.status(400).json({ error: error.message });
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  // =========================================================================
  // 2. ADMIN PENDING ORDERS
  // =========================================================================
  router.get('/admin/orders/pending', async (req, res) => {
    try {
      getUserIdFromToken(req);
      const pendingOrders = await prisma.order.findMany({
        where: { status: { in: ["PENDING", "CONFIRMED"] } },
        include: { user: { include: { profile: true, addresses: true } }, address: true, items: { include: { product: { include: { brand: true, images: true } } } } },
        orderBy: { createdAt: 'desc' }
      });
      res.json({ count: pendingOrders.length, orders: pendingOrders });
    } catch (error) { res.status(500).json({ error: "Internal Server Error" }); }
  });

  // =========================================================================
  // 3. GET USER ORDER HISTORY - IDOR FIX
  // =========================================================================
  router.get('/order/user/:userId', async (req, res) => {
    try {
      const tokenUserId = getUserIdFromToken(req);
      const paramUserId = Number(req.params.userId);
      if(tokenUserId !== paramUserId){
        const user = await prisma.user.findUnique({ where: { id: tokenUserId } });
        if(!user || user.role !== 'ADMIN') return res.status(403).json({ error: "Access denied" });
      }
      const orders = await prisma.order.findMany({
        where: { userId: paramUserId },
        include: { address: true, items: { include: { product: { include: { images: true, brand: true } } } }, payment: true },
        orderBy: { createdAt: 'desc' }
      });
      res.json(orders);
    } catch (error) {
      if(error.message === "Unauthorized") return res.status(401).json({ error: "Invalid token" });
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  // =========================================================================
  // 4. TRACKING - IDOR FIX
  // =========================================================================
  router.get('/order/:id/tracking', async (req, res) => {
    try {
      const userId = getUserIdFromToken(req);
      const order = await prisma.order.findUnique({ where: { id: Number(req.params.id) } });
      if (!order) return res.status(404).json({ error: "Order not found" });
      if(order.userId !== userId){
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if(user.role !== 'ADMIN') return res.status(403).json({ error: "Access denied" });
      }
      const statusSequence = [{ key: "PENDING", label: "Order Placed" }, { key: "CONFIRMED", label: "Order Confirmed" }, { key: "PACKED", label: "Packed" }, { key: "SHIPPED", label: "Shipped" }, { key: "OUT_FOR_DELIVERY", label: "Out for Delivery" }, { key: "DELIVERED", label: "Delivered" }];
      const currentStatusIndex = statusSequence.findIndex(s => s.key === order.status);
      const timeline = statusSequence.map((step, index) => ({ stepName: step.label, statusKey: step.key, isCompleted: index <= currentStatusIndex, isCurrent: index === currentStatusIndex, updatedAt: index <= currentStatusIndex ? order.updatedAt : null }));
      res.json({ orderId: order.id, currentStatus: order.status, trackingId: order.trackingId || "N/A", courierName: order.courierName || "N/A", expectedDeliveryDate: order.expectedDeliveryDate, timeline, shippingAddress: `${order.shippingLine}, ${order.shippingCity}` });
    } catch (error) { res.status(500).json({ error: "Internal Server Error" }); }
  });

  // =========================================================================
  // 5. UPDATE STATUS - ADMIN ONLY
  // =========================================================================
  router.patch('/order/:id/status', async (req, res) => {
    try {
      const userId = getUserIdFromToken(req);
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if(!user || user.role !== 'ADMIN') return res.status(403).json({ error: "Admins only" });
      
      const { id } = req.params;
      const { status, trackingId, courierName, expectedDeliveryDate } = req.body;
      const updateData = {};
      if (status) updateData.status = status;
      if (trackingId) updateData.trackingId = trackingId;
      if (courierName) updateData.courierName = courierName;
      if (expectedDeliveryDate) updateData.expectedDeliveryDate = new Date(expectedDeliveryDate);
      const updatedOrder = await prisma.order.update({ where: { id: Number(id) }, data: updateData });
      res.json({ message: "Order updated successfully!", order: updatedOrder });
    } catch (error) { res.status(500).json({ error: "Internal Server Error" }); }
  });

  return router;
};