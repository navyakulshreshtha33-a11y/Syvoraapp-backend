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

  // --- ZOD VALIDATION ---
  const checkoutSchema = z.object({
    addressId: z.number().int().positive(),
    customDeliveryDays: z.number().int().min(1).max(15).optional(),
    paymentType: z.enum(['PREPAID', 'COD_ADVANCE', 'COD']).default('PREPAID'),
    checkoutMode: z.enum(['CART', 'BUY_NOW']).default('CART'),
    buyNowItem: z.object({
      productId: z.number().int().positive(),
      quantity: z.number().int().positive().default(1),
      size: z.string().optional()
    }).optional()
  });

  // =========================================================================
  // 1. CHECKOUT API - FULL DETAILS EMAIL TO ADMIN & CUSTOMER
  // =========================================================================
  router.post('/order/checkout', async (req, res) => {
    try {
      const userId = getUserIdFromToken(req);
      const parsed = checkoutSchema.safeParse(req.body);
      if(!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
      
      const { addressId, customDeliveryDays, paymentType, checkoutMode, buyNowItem } = parsed.data;

      // 0. Verify User Profile & Phone
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

      // 2. Checkout Mode Logic
      if (checkoutMode === 'BUY_NOW') {
        if (!buyNowItem || !buyNowItem.productId) {
          return res.status(400).json({ error: "Buy Now item details are missing." });
        }
        const product = await prisma.product.findUnique({ where: { id: Number(buyNowItem.productId) } });
        if (!product) return res.status(404).json({ error: "Product not found" });
        
        orderItemsToProcess = [{
          productId: product.id,
          quantity: Number(buyNowItem.quantity) || 1,
          size: buyNowItem.size || "M",
          product: product
        }];
      } else {
        const cart = await prisma.cart.findUnique({
          where: { userId: Number(userId) },
          include: { items: { include: { product: true } } }
        });
        if (!cart || cart.items.length === 0) {
          return res.status(400).json({ error: "Your cart is empty" });
        }
        orderItemsToProcess = cart.items;
        cartIdToClear = cart.id;
      }

      // 3. Subtotal & Totals calculation
      const subtotal = orderItemsToProcess.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);

      const config = await prisma.storeConfig.findFirst({ where: { id: 1 } });
      const gstRate = config?.gstRate || 5.0;
      const deliveryFeeConfig = config?.deliveryFee || 49;
      const freeThreshold = config?.freeDeliveryThreshold || 999;

      const gstAmount = parseFloat(((subtotal * gstRate) / 100).toFixed(2));
      const deliveryFee = subtotal >= freeThreshold ? 0 : deliveryFeeConfig;
      const finalTotal = parseFloat((subtotal + gstAmount + deliveryFee).toFixed(2));

      const previousOrdersCount = await prisma.order.count({ where: { userId: Number(userId) } });
      if (previousOrdersCount === 0 && paymentType === 'COD') {
        return res.status(400).json({ error: "Security Policy: Your first order must be Prepaid or require ₹99 Advance COD." });
      }

      const deliveryDays = customDeliveryDays ? Number(customDeliveryDays) : 5;
      const expectedDate = new Date();
      expectedDate.setDate(expectedDate.getDate() + deliveryDays);

      // 4. Transaction: Stock Lock + Order Create
      const order = await prisma.$transaction(async (tx) => {
        for(const item of orderItemsToProcess){
          const updated = await tx.product.updateMany({
            where: { id: item.productId, stock: { gte: item.quantity } },
            data: { stock: { decrement: item.quantity } }
          });
          if(updated.count === 0){
            throw new Error(`Out of stock: ${item.product?.name || item.productId}`);
          }
        }

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

        if (checkoutMode === 'CART' && cartIdToClear) {
          await tx.cartItem.deleteMany({ where: { cartId: cartIdToClear } });
        }
        
        return newOrder;
      });

      // 🚀 5. SEND DETAILED EMAILS VIA RESEND (Using your verified domain)
      if (resend) {
        try {
          const adminEmail = "syvora.official.acc@gmail.com";
          
          // HTML items list generate karne ke liye
          const itemsHtml = order.items.map(i => `
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #eee;">${i.product.name} (Size: ${i.size})</td>
              <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: center;">${i.quantity}</td>
              <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">₹${i.price * i.quantity}</td>
            </tr>
          `).join('');

          // A. Admin Notification Email (Poori detail ke sath)
          await resend.emails.send({
            from: "Syvora Orders <orders@syvora.in>",
            replyTo: user.email,
            to: [adminEmail],
            subject: `🚨 NEW ORDER #SYV-${order.id} Received!`,
            html: `
              <div style="font-family: Arial, sans-serif; padding: 20px; color: #3D2B1F; background: #FAF7F2; border-radius: 10px;">
                <h2 style="color: #4A3024;">🎉 New Order Placed! (#SYV-${order.id})</h2>
                <p><b>Customer Name:</b> ${address.name}</p>
                <p><b>Customer Phone:</b> ${address.phone}</p>
                <p><b>Customer Email:</b> ${user.email}</p>
                
                <h3 style="margin-top: 15px; color: #4A3024;">Shipping Address:</h3>
                <p style="background: #FFF; padding: 10px; border-radius: 5px;">
                  ${address.addressLine}, ${address.city}, ${address.state} - ${address.pincode}
                </p>

                <h3 style="margin-top: 15px; color: #4A3024;">Ordered Items:</h3>
                <table style="width: 100%; background: #FFF; border-collapse: collapse; border-radius: 5px; overflow: hidden;">
                  <tr style="background: #EEDFD2; text-align: left;">
                    <th style="padding: 8px;">Item</th>
                    <th style="padding: 8px; text-align: center;">Qty</th>
                    <th style="padding: 8px; text-align: right;">Price</th>
                  </tr>
                  ${itemsHtml}
                </table>

                <p style="margin-top: 15px;"><b>Subtotal:</b> ₹${order.subtotal}</p>
                <p><b>GST (5%):</b> ₹${order.gstAmount}</p>
                <p><b>Delivery Fee:</b> ₹${order.deliveryFee}</p>
                <h3 style="color: #4A3024;">Grand Total: ₹${order.totalAmount}</h3>
                
                <p style="color: #8B6B4A; font-weight: bold; margin-top: 20px;">Team Syvora System</p>
              </div>
            `
          });

          // B. Customer Confirmation Email
          if (user.email) {
            await resend.emails.send({
              from: "Syvora Orders <orders@syvora.in>",
              replyTo: "syvora.official.acc@gmail.com",
              to: [user.email],
              subject: `🎉 Order Confirmed! #SYV-${order.id} - Syvora`,
              html: `
                <div style="font-family: Arial, sans-serif; padding: 20px; color: #3D2B1F; background: #FAF7F2; border-radius: 10px;">
                  <h2 style="color: #4A3024;">Thank you for shopping with Syvora, ${address.name}!</h2>
                  <p>Your order <b>#SYV-${order.id}</b> has been successfully placed and is being prepared.</p>
                  
                  <h3 style="margin-top: 15px; color: #4A3024;">Order Summary:</h3>
                  <table style="width: 100%; background: #FFF; border-collapse: collapse; border-radius: 5px; overflow: hidden;">
                    <tr style="background: #EEDFD2; text-align: left;">
                      <th style="padding: 8px;">Item</th>
                      <th style="padding: 8px; text-align: center;">Qty</th>
                      <th style="padding: 8px; text-align: right;">Price</th>
                    </tr>
                    ${itemsHtml}
                  </table>

                  <p style="margin-top: 15px;"><b>Grand Total:</b> ₹${order.totalAmount}</p>
                  <p><b>Delivery Address:</b> ${address.addressLine}, ${address.city} - ${address.pincode}</p>
                  
                  <p>We will notify you with tracking details once your order ships.</p>
                  <p style="color: #8B6B4A; font-weight: bold; margin-top: 20px;">Team Syvora</p>
                </div>
              `
            });
          }
          console.log(`[ORDER EMAIL] Successfully sent detailed emails for Order #${order.id}`);
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
  // 3. GET USER ORDER HISTORY
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
  // 4. TRACKING API (User dekh payega order kahan pahucha hai)
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
      const statusSequence = [
        { key: "PENDING", label: "Order Placed" }, 
        { key: "CONFIRMED", label: "Order Confirmed" }, 
        { key: "PACKED", label: "Packed" }, 
        { key: "SHIPPED", label: "Shipped" }, 
        { key: "OUT_FOR_DELIVERY", label: "Out for Delivery" }, 
        { key: "DELIVERED", label: "Delivered" }
      ];
      const currentStatusIndex = statusSequence.findIndex(s => s.key === order.status);
      const timeline = statusSequence.map((step, index) => ({ 
        stepName: step.label, 
        statusKey: step.key, 
        isCompleted: index <= currentStatusIndex, 
        isCurrent: index === currentStatusIndex, 
        updatedAt: index <= currentStatusIndex ? order.updatedAt : null 
      }));

      res.json({ 
        orderId: order.id, 
        currentStatus: order.status, 
        trackingId: order.trackingId || "N/A", // 👈 AWB / Tracking number yahan show hoga
        courierName: order.courierName || "N/A", // 👈 Courier partner name
        expectedDeliveryDate: order.expectedDeliveryDate, 
        timeline, 
        shippingAddress: `${order.shippingLine}, ${order.shippingCity}` 
      });
    } catch (error) { res.status(500).json({ error: "Internal Server Error" }); }
  });

  // =========================================================================
  // 5. UPDATE STATUS & AWB NUMBER (Admin ke liye)
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
      if (trackingId) updateData.trackingId = trackingId; // 👈 Admin yahan AWB number dalega
      if (courierName) updateData.courierName = courierName; // 👈 Jaise 'Delhivery', 'BlueDart'
      if (expectedDeliveryDate) updateData.expectedDeliveryDate = new Date(expectedDeliveryDate);

      const updatedOrder = await prisma.order.update({ 
        where: { id: Number(id) }, 
        data: updateData 
      });

      res.json({ message: "Order updated successfully!", order: updatedOrder });
    } catch (error) { res.status(500).json({ error: "Internal Server Error" }); }
  });

  return router;
};