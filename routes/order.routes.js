const express = require('express');

module.exports = function (prisma, transporter) {
  const router = express.Router();

  // =========================================================================
  // 1. CHECKOUT API (Cart se Order Banana, Expected Date Set Karna & Email Alert)
  // =========================================================================
  router.post('/order/checkout', async (req, res) => {
    try {
      const { userId, customDeliveryDays } = req.body;

      if (!userId) {
        return res.status(400).json({ error: "userId is required" });
      }

      // User ka Cart aur uske items Products ke saath fetch karo
      const cart = await prisma.cart.findUnique({
        where: { userId: Number(userId) },
        include: {
          items: {
            include: { product: { include: { brand: true } } }
          }
        }
      });

      if (!cart || cart.items.length === 0) {
        return res.status(400).json({ error: "Your cart is empty" });
      }

      // Total Order Amount Calculate karo
      const totalAmount = cart.items.reduce((sum, item) => {
        return sum + (item.product.price * item.quantity);
      }, 0);

      // 📅 EXPECTED DELIVERY DATE CALCULATION (By default order place hone ke 5 din baad)
      const deliveryDays = customDeliveryDays ? Number(customDeliveryDays) : 5;
      const expectedDate = new Date();
      expectedDate.setDate(expectedDate.getDate() + deliveryDays);

      // Database Transaction: Order create hoga + Cart clear hoga (Dono ek saath)
      const order = await prisma.$transaction(async (tx) => {
        // A. Create New Order & Order Items
        const newOrder = await tx.order.create({
          data: {
            userId: Number(userId),
            totalAmount: parseFloat(totalAmount.toFixed(2)),
            status: "PENDING",
            expectedDeliveryDate: expectedDate, // 👈 Expected Delivery Date saved!
            items: {
              create: cart.items.map(item => ({
                productId: item.productId,
                size: item.size || "M",
                quantity: item.quantity,
                price: item.product.price
              }))
            }
          },
          include: {
            items: { include: { product: true } },
            user: { include: { profile: true, addresses: true } }
          }
        });

        // B. Clear User's Cart
        await tx.cartItem.deleteMany({
          where: { cartId: cart.id }
        });

        return newOrder;
      });

      // 🔔 INSTANT EMAIL NOTIFICATION TO ADMIN
      if (transporter && process.env.EMAIL_USER) {
        const mailOptions = {
          from: process.env.EMAIL_USER,
          to: process.env.ADMIN_EMAIL || process.env.EMAIL_USER,
          subject: `🚨 NEW SYVORA ORDER RECEIVED! #SYV-${order.id}`,
          html: `
            <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
              <h2 style="color: #e63946;">🎉 Naya Order Aaya Hai!</h2>
              <p><b>Order ID:</b> #${order.id}</p>
              <p><b>Total Amount:</b> ₹${order.totalAmount}</p>
              <p><b>Expected Delivery:</b> ${new Date(order.expectedDeliveryDate).toDateString()}</p>
              <p><b>Customer Name:</b> ${order.user?.profile?.name || 'Customer'}</p>
              <p><b>Phone:</b> ${order.user?.profile?.phone || 'N/A'}</p>
              <hr />
              <h3>Ordered Items:</h3>
              <ul>
                ${order.items.map(item => `
                  <li><b>${item.product.name}</b> - Qty:${item.quantity} | Size: ${item.size} \vert{} ₹${item.price}</li>
                `).join('')}
              </ul>
            </div>
          `
        };

        transporter.sendMail(mailOptions, (err, info) => {
          if (err) console.error("❌ Email Alert Error:", err);
          else console.log("📧 Admin Order Email Alert Sent:", info.response);
        });
      }

      res.status(201).json({
        message: "Order placed successfully!",
        order
      });
    } catch (error) {
      console.error("Checkout Error:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  // =========================================================================
  // 2. ADMIN DASHBOARD: PENDING / UNFULFILLED ORDERS LIST
  // =========================================================================
  router.get('/admin/orders/pending', async (req, res) => {
    try {
      const pendingOrders = await prisma.order.findMany({
        where: {
          status: { in: ["PENDING", "CONFIRMED"] }
        },
        include: {
          user: { include: { profile: true, addresses: true } },
          items: {
            include: {
              product: { include: { brand: true, images: true } }
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      res.json({
        count: pendingOrders.length,
        orders: pendingOrders
      });
    } catch (error) {
      console.error("Get Admin Pending Orders Error:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  // =========================================================================
  // 3. GET USER's ORDER HISTORY (My Orders Screen ke liye)
  // =========================================================================
  router.get('/order/user/:userId', async (req, res) => {
    try {
      const { userId } = req.params;

      const orders = await prisma.order.findMany({
        where: { userId: Number(userId) },
        include: {
          items: {
            include: {
              product: { include: { images: true, brand: true } }
            }
          },
          payment: true
        },
        orderBy: { createdAt: 'desc' }
      });

      res.json(orders);
    } catch (error) {
      console.error("Get Order History Error:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  // =========================================================================
  // 4. GET ORDER TRACKING TIMELINE (Expected Delivery Date ke sath)
  // =========================================================================
  router.get('/order/:id/tracking', async (req, res) => {
    try {
      const { id } = req.params;

      const order = await prisma.order.findUnique({
        where: { id: Number(id) }
      });

      if (!order) {
        return res.status(404).json({ error: "Order not found" });
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

      // Date Formatting for Frontend Display
      const formattedExpectedDate = order.expectedDeliveryDate
        ? new Date(order.expectedDeliveryDate).toLocaleDateString('en-IN', {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
            year: 'numeric'
          })
        : "N/A";

      res.json({
        orderId: order.id,
        currentStatus: order.status,
        trackingId: order.trackingId || "N/A",
        courierName: order.courierName || "N/A",
        expectedDeliveryDate: order.expectedDeliveryDate,
        expectedDeliveryFormatted: `Expected by ${formattedExpectedDate}`, // 👈 Direct readable text for UI
        timeline
      });
    } catch (error) {
      console.error("Get Tracking Error:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  // =========================================================================
  // 5. UPDATE TRACKING ID, STATUS & EXPECTED DATE (Admin Update)
  // =========================================================================
  router.patch('/order/:id/status', async (req, res) => {
    try {
      const { id } = req.params;
      const { status, trackingId, courierName, expectedDeliveryDate } = req.body;

      const updateData = {};
      if (status) updateData.status = status;
      if (trackingId) updateData.trackingId = trackingId;
      if (courierName) updateData.courierName = courierName;
      if (expectedDeliveryDate) updateData.expectedDeliveryDate = new Date(expectedDeliveryDate);

      const updatedOrder = await prisma.order.update({
        where: { id: Number(id) },
        data: updateData
      });

      res.json({
        message: "Order updated successfully!",
        order: updatedOrder
      });
    } catch (error) {
      console.error("Update Status Error:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  return router;
};