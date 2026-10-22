// const express = require('express');

// module.exports = function (prisma, transporter) {
//   const router = express.Router();

//   // =========================================================================
//   // 1. CHECKOUT API (Cart se Order Banana, Expected Date Set Karna & Email Alert)
//   // =========================================================================
//   router.post('/order/checkout', async (req, res) => {
//     try {
//       const { userId, customDeliveryDays } = req.body;

//       if (!userId) {
//         return res.status(400).json({ error: "userId is required" });
//       }

//       // User ka Cart aur uske items Products ke saath fetch karo
//       const cart = await prisma.cart.findUnique({
//         where: { userId: Number(userId) },
//         include: {
//           items: {
//             include: { product: { include: { brand: true } } }
//           }
//         }
//       });

//       if (!cart || cart.items.length === 0) {
//         return res.status(400).json({ error: "Your cart is empty" });
//       }

//       // Total Order Amount Calculate karo
//       const totalAmount = cart.items.reduce((sum, item) => {
//         return sum + (item.product.price * item.quantity);
//       }, 0);

//       // 📅 EXPECTED DELIVERY DATE CALCULATION (By default order place hone ke 5 din baad)
//       const deliveryDays = customDeliveryDays ? Number(customDeliveryDays) : 5;
//       const expectedDate = new Date();
//       expectedDate.setDate(expectedDate.getDate() + deliveryDays);

//       // Database Transaction: Order create hoga + Cart clear hoga (Dono ek saath)
//       const order = await prisma.$transaction(async (tx) => {
//         // A. Create New Order & Order Items
//         const newOrder = await tx.order.create({
//           data: {
//             userId: Number(userId),
//             totalAmount: parseFloat(totalAmount.toFixed(2)),
//             status: "PENDING",
//             expectedDeliveryDate: expectedDate, // 👈 Expected Delivery Date saved!
//             items: {
//               create: cart.items.map(item => ({
//                 productId: item.productId,
//                 size: item.size || "M",
//                 quantity: item.quantity,
//                 price: item.product.price
//               }))
//             }
//           },
//           include: {
//             items: { include: { product: true } },
//             user: { include: { profile: true, addresses: true } }
//           }
//         });

//         // B. Clear User's Cart
//         await tx.cartItem.deleteMany({
//           where: { cartId: cart.id }
//         });

//         return newOrder;
//       });

//       // 🔔 INSTANT EMAIL NOTIFICATION TO ADMIN
//       if (transporter && process.env.EMAIL_USER) {
//         const mailOptions = {
//           from: process.env.EMAIL_USER,
//           to: process.env.ADMIN_EMAIL || process.env.EMAIL_USER,
//           subject: `🚨 NEW SYVORA ORDER RECEIVED! #SYV-${order.id}`,
//           html: `
//             <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
//               <h2 style="color: #e63946;">🎉 Naya Order Aaya Hai!</h2>
//               <p><b>Order ID:</b> #${order.id}</p>
//               <p><b>Total Amount:</b> ₹${order.totalAmount}</p>
//               <p><b>Expected Delivery:</b> ${new Date(order.expectedDeliveryDate).toDateString()}</p>
//               <p><b>Customer Name:</b> ${order.user?.profile?.name || 'Customer'}</p>
//               <p><b>Phone:</b> ${order.user?.profile?.phone || 'N/A'}</p>
//               <hr />
//               <h3>Ordered Items:</h3>
//               <ul>
//                 ${order.items.map(item => `
//                   <li><b>${item.product.name}</b> - Qty:${item.quantity} | Size: ${item.size} \vert{} ₹${item.price}</li>
//                 `).join('')}
//               </ul>
//             </div>
//           `
//         };

//         transporter.sendMail(mailOptions, (err, info) => {
//           if (err) console.error("❌ Email Alert Error:", err);
//           else console.log("📧 Admin Order Email Alert Sent:", info.response);
//         });
//       }

//       res.status(201).json({
//         message: "Order placed successfully!",
//         order
//       });
//     } catch (error) {
//       console.error("Checkout Error:", error);
//       res.status(500).json({ error: "Internal Server Error" });
//     }
//   });

//   // =========================================================================
//   // 2. ADMIN DASHBOARD: PENDING / UNFULFILLED ORDERS LIST
//   // =========================================================================
//   router.get('/admin/orders/pending', async (req, res) => {
//     try {
//       const pendingOrders = await prisma.order.findMany({
//         where: {
//           status: { in: ["PENDING", "CONFIRMED"] }
//         },
//         include: {
//           user: { include: { profile: true, addresses: true } },
//           items: {
//             include: {
//               product: { include: { brand: true, images: true } }
//             }
//           }
//         },
//         orderBy: { createdAt: 'desc' }
//       });

//       res.json({
//         count: pendingOrders.length,
//         orders: pendingOrders
//       });
//     } catch (error) {
//       console.error("Get Admin Pending Orders Error:", error);
//       res.status(500).json({ error: "Internal Server Error" });
//     }
//   });

//   // =========================================================================
//   // 3. GET USER's ORDER HISTORY (My Orders Screen ke liye)
//   // =========================================================================
//   router.get('/order/user/:userId', async (req, res) => {
//     try {
//       const { userId } = req.params;

//       const orders = await prisma.order.findMany({
//         where: { userId: Number(userId) },
//         include: {
//           items: {
//             include: {
//               product: { include: { images: true, brand: true } }
//             }
//           },
//           payment: true
//         },
//         orderBy: { createdAt: 'desc' }
//       });

//       res.json(orders);
//     } catch (error) {
//       console.error("Get Order History Error:", error);
//       res.status(500).json({ error: "Internal Server Error" });
//     }
//   });

//   // =========================================================================
//   // 4. GET ORDER TRACKING TIMELINE (Expected Delivery Date ke sath)
//   // =========================================================================
//   router.get('/order/:id/tracking', async (req, res) => {
//     try {
//       const { id } = req.params;

//       const order = await prisma.order.findUnique({
//         where: { id: Number(id) }
//       });

//       if (!order) {
//         return res.status(404).json({ error: "Order not found" });
//       }

//       const statusSequence = [
//         { key: "PENDING", label: "Order Placed" },
//         { key: "CONFIRMED", label: "Order Confirmed" },
//         { key: "PACKED", label: "Packed" },
//         { key: "SHIPPED", label: "Shipped" },
//         { key: "OUT_FOR_DELIVERY", label: "Out for Delivery" },
//         { key: "DELIVERED", label: "Delivered" }
//       ];

//       const currentStatusIndex = statusSequence.findIndex(s => s.key === order.status);

//       const timeline = statusSequence.map((step, index) => ({
//         stepName: step.label,
//         statusKey: step.key,
//         isCompleted: index <= currentStatusIndex,
//         isCurrent: index === currentStatusIndex,
//         updatedAt: index <= currentStatusIndex ? order.updatedAt : null
//       }));

//       // Date Formatting for Frontend Display
//       const formattedExpectedDate = order.expectedDeliveryDate
//         ? new Date(order.expectedDeliveryDate).toLocaleDateString('en-IN', {
//             weekday: 'short',
//             day: 'numeric',
//             month: 'short',
//             year: 'numeric'
//           })
//         : "N/A";

//       res.json({
//         orderId: order.id,
//         currentStatus: order.status,
//         trackingId: order.trackingId || "N/A",
//         courierName: order.courierName || "N/A",
//         expectedDeliveryDate: order.expectedDeliveryDate,
//         expectedDeliveryFormatted: `Expected by ${formattedExpectedDate}`, // 👈 Direct readable text for UI
//         timeline
//       });
//     } catch (error) {
//       console.error("Get Tracking Error:", error);
//       res.status(500).json({ error: "Internal Server Error" });
//     }
//   });

//   // =========================================================================
//   // 5. UPDATE TRACKING ID, STATUS & EXPECTED DATE (Admin Update)
//   // =========================================================================
//   router.patch('/order/:id/status', async (req, res) => {
//     try {
//       const { id } = req.params;
//       const { status, trackingId, courierName, expectedDeliveryDate } = req.body;

//       const updateData = {};
//       if (status) updateData.status = status;
//       if (trackingId) updateData.trackingId = trackingId;
//       if (courierName) updateData.courierName = courierName;
//       if (expectedDeliveryDate) updateData.expectedDeliveryDate = new Date(expectedDeliveryDate);

//       const updatedOrder = await prisma.order.update({
//         where: { id: Number(id) },
//         data: updateData
//       });

//       res.json({
//         message: "Order updated successfully!",
//         order: updatedOrder
//       });
//     } catch (error) {
//       console.error("Update Status Error:", error);
//       res.status(500).json({ error: "Internal Server Error" });
//     }
//   });

//   return router;
// };





const express = require('express');
const jwt = require('jsonwebtoken');
const { z } = require('zod');

module.exports = function (prisma, transporter) {
  const router = express.Router();

  // --- JWT Helper (IDOR FIX) ---
  function getUserIdFromToken(req){
    const authHeader = req.headers.authorization;
    if(!authHeader) throw new Error("Unauthorized");
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return decoded.id;
  }

  // --- ZOD VALIDATION (Point 15 & 16) ---
  const checkoutSchema = z.object({
    addressId: z.number().int().positive(),
    customDeliveryDays: z.number().int().min(1).max(15).optional()
  });

  // =========================================================================
  // 1. CHECKOUT API - SECURED WITH STOCK LOCK + JWT + ADDRESS CHECK
  // =========================================================================
  router.post('/order/checkout', async (req, res) => {
    try {
      const userId = getUserIdFromToken(req); // body se nahi, token se
      const parsed = checkoutSchema.safeParse(req.body);
      if(!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
      const { addressId, customDeliveryDays } = parsed.data;

      // 1. Verify Address - isi user ka hai ya nahi (IDOR)
      const address = await prisma.address.findFirst({
        where: { id: Number(addressId), userId: Number(userId) }
      });
      if (!address) {
        return res.status(403).json({ error: "Invalid address or not yours" });
      }

      // 2. Cart fetch
      const cart = await prisma.cart.findUnique({
        where: { userId: Number(userId) },
        include: { items: { include: { product: true } } }
      });

      if (!cart || cart.items.length === 0) {
        return res.status(400).json({ error: "Your cart is empty" });
      }

      // 3. Subtotal - DB se (Price tampering safe)
      const subtotal = cart.items.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);

      // 4. StoreConfig se GST + Delivery
      const config = await prisma.storeConfig.findFirst({ where: { id: 1 } });
      const gstRate = config?.gstRate || 5.0;
      const deliveryFeeConfig = config?.deliveryFee || 49;
      const freeThreshold = config?.freeDeliveryThreshold || 999;

      const gstAmount = parseFloat(((subtotal * gstRate) / 100).toFixed(2));
      const deliveryFee = subtotal >= freeThreshold ? 0 : deliveryFeeConfig;
      const finalTotal = parseFloat((subtotal + gstAmount + deliveryFee).toFixed(2));

      const deliveryDays = customDeliveryDays ? Number(customDeliveryDays) : 5;
      const expectedDate = new Date();
      expectedDate.setDate(expectedDate.getDate() + deliveryDays);

      // 5. Transaction: STOCK LOCK + Order create + Cart clear
      const order = await prisma.$transaction(async (tx) => {
        // Stock check with atomic decrement - Race condition fix
        for(const item of cart.items){
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
              create: cart.items.map(item => ({
                productId: item.productId,
                size: item.size || "M",
                quantity: item.quantity,
                price: item.product.price // DB price
              }))
            }
          },
          include: { items: { include: { product: true } }, user: { include: { profile: true } }, address: true }
        });

        await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
        return newOrder;
      });

      // Email Alert
      if (transporter && process.env.EMAIL_USER) {
        const mailOptions = {
          from: process.env.EMAIL_USER,
          to: process.env.ADMIN_EMAIL || process.env.EMAIL_USER,
          subject: `🚨 NEW SYVORA ORDER #SYV-${order.id}`,
          html: `<div style="font-family: Arial; padding:20px;"><h2>🎉 Naya Order!</h2><p><b>Order ID:</b> #${order.id}</p><p><b>Address:</b> ${order.shippingLine}, ${order.shippingCity} - ${order.shippingPincode}</p><p><b>Total:</b> ₹${order.totalAmount}</p></div>`
        };
        transporter.sendMail(mailOptions, (err) => { if (err) console.error("Email Error:", err); });
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
  // 2. ADMIN PENDING ORDERS - verifyAdmin lagana hai server.js me
  // =========================================================================
  router.get('/admin/orders/pending', async (req, res) => {
    try {
      getUserIdFromToken(req); // token check
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