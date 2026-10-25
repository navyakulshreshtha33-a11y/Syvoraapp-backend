// const express = require('express');
// const Razorpay = require('razorpay');
// const crypto = require('crypto');
// const jwt = require('jsonwebtoken');

// module.exports = (prisma) => {
//   const router = express.Router();

//   // --- AUTH MIDDLEWARE (User ka, Admin nahi) ---
//   const authenticate = async (req, res, next) => {
//     try {
//       const authHeader = req.headers.authorization;
//       if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ error: "Login required" });
//       const token = authHeader.split(' ')[1];
//       const decoded = jwt.verify(token, process.env.JWT_SECRET);
//       req.user = decoded;
//       next();
//     } catch { return res.status(401).json({ error: "Invalid token" }); }
//   };

//   const razorpay = new Razorpay({
//     key_id: process.env.RAZORPAY_KEY_ID,
//     key_secret: process.env.RAZORPAY_KEY_SECRET
//   });

//   // --- 1. CREATE RAZORPAY ORDER + RESERVE STOCK ---
//   router.post('/create-order', authenticate, async (req, res) => {
//     try {
//       const userId = Number(req.user.id);

//       const cart = await prisma.cart.findUnique({
//         where: { userId },
//         include: { items: { include: { product: true } } }
//       });

//       if (!cart || cart.items.length === 0) return res.status(400).json({ error: "Cart empty" });

//       // Amount DB se calculate, frontend se nahi
//       let subtotal = 0;
//       for (const item of cart.items) {
//         const sizeChart = await prisma.productSizeChart.findUnique({
//           where: { productId_size: { productId: item.productId, size: item.size } }
//         });
//         if (!sizeChart) return res.status(400).json({ error: `${item.product.name} size ${item.size} not found` });
        
//         const available = sizeChart.stock - sizeChart.reservedStock;
//         if (available < item.quantity) {
//           return res.status(400).json({ error: `${item.product.name} (${item.size}) out of stock. Only ${available} left` });
//         }
//         subtotal += item.product.price * item.quantity;
//       }

//       // GST + Delivery tere StoreConfig se le le
//       const config = await prisma.storeConfig.findUnique({ where: { id: 1 } });
//       const gstAmount = subtotal * (config.gstRate / 100);
//       let deliveryFee = config.deliveryFee;
//       if (subtotal >= config.freeDeliveryThreshold) deliveryFee = 0;
//       const totalAmount = subtotal + gstAmount + deliveryFee;

//       const rzpOrder = await razorpay.orders.create({
//         amount: Math.round(totalAmount * 100), // paise me
//         currency: "INR",
//         receipt: `syvora_${userId}_${Date.now()}`
//       });

//       // Stock ko 10 min ke liye RESERVE kar de
//       for (const item of cart.items) {
//         await prisma.productSizeChart.update({
//           where: { productId_size: { productId: item.productId, size: item.size } },
//           data: { reservedStock: { increment: item.quantity } }
//         });
//       }

//       // Ek pending order bana de DB me, taki verify pe update kar sake
//       const order = await prisma.order.create({
//         data: {
//           userId,
//           status: "PAYMENT_PENDING",
//           subtotal,
//           gstAmount,
//           deliveryFee,
//           totalAmount,
//           payment: {
//             create: {
//               gateway: "RAZORPAY",
//               gatewayOrderId: rzpOrder.id,
//               amount: totalAmount,
//               status: "PENDING"
//             }
//           }
//         }
//       });

//       res.json({
//         razorpayOrderId: rzpOrder.id,
//         dbOrderId: order.id,
//         amount: rzpOrder.amount,
//         currency: "INR",
//         key: process.env.RAZORPAY_KEY_ID
//       });

//     } catch (e) {
//       console.error("Create order error:", e);
//       res.status(500).json({ error: "Order creation failed" });
//     }
//   });

//   // --- 2. VERIFY PAYMENT - Sabse Important ---
//   router.post('/verify-payment', authenticate, async (req, res) => {
//     try {
//       const { razorpay_order_id, razorpay_payment_id, razorpay_signature, dbOrderId } = req.body;

//       const body = razorpay_order_id + "|" + razorpay_payment_id;
//       const expectedSignature = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET).update(body).digest('hex');

//       if (expectedSignature !== razorpay_signature) {
//         return res.status(400).json({ success: false, message: "Fake payment detected!" });
//       }

//       // Signature sahi hai, ab transaction me sab update karo
//       await prisma.$transaction(async (tx) => {
//         const order = await tx.order.findUnique({
//           where: { id: Number(dbOrderId) },
//           include: { items: false } // abhi items nahi hai, cart se banayenge
//         });

//         // Cart se OrderItems banao + Stock final cut karo
//         const cart = await tx.cart.findUnique({
//           where: { userId: Number(req.user.id) },
//           include: { items: true }
//         });

//         for (const item of cart.items) {
//           const product = await tx.product.findUnique({ where: { id: item.productId } });
//           await tx.orderItem.create({
//             data: {
//               orderId: order.id,
//               productId: item.productId,
//               size: item.size,
//               quantity: item.quantity,
//               price: product.price
//             }
//           });

//           // Final: stock-- , reservedStock--
//           await tx.productSizeChart.update({
//             where: { productId_size: { productId: item.productId, size: item.size } },
//             data: {
//               stock: { decrement: item.quantity },
//               reservedStock: { decrement: item.quantity }
//             }
//           });
//         }

//         await tx.payment.update({
//           where: { orderId: order.id },
//           data: {
//             gatewayPaymentId: razorpay_payment_id,
//             gatewaySignature: razorpay_signature,
//             status: "SUCCESS"
//           }
//         });

//         await tx.order.update({
//           where: { id: order.id },
//           data: { status: "CONFIRMED" }
//         });

//         // Cart khali kar de
//         await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
//       });

//       res.json({ success: true, message: "Payment verified & Order Confirmed" });

//     } catch (e) {
//       console.error("Verify error:", e);
//       res.status(500).json({ error: "Verification failed" });
//     }
//   });

//   // --- 3. PAYMENT FAILED - Reserve release karna ---
//   router.post('/payment-failed', authenticate, async (req, res) => {
//     try {
//       const userId = Number(req.user.id);
//       const cart = await prisma.cart.findUnique({ where: { userId }, include: { items: true } });
//       if (!cart) return res.json({ success: true });

//       for (const item of cart.items) {
//         await prisma.productSizeChart.update({
//           where: { productId_size: { productId: item.productId, size: item.size } },
//           data: { reservedStock: { decrement: item.quantity } }
//         });
//       }
//       res.json({ success: true, message: "Stock released" });
//     } catch (e) {
//       res.status(500).json({ error: "Release failed" });
//     }
//   });

//   return router;
// };


const express = require('express');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

module.exports = (prisma) => {
  const router = express.Router();

  const authenticate = async (req, res, next) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ error: "Login required" });
      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = decoded;
      next();
    } catch { return res.status(401).json({ error: "Invalid token" }); }
  };

  const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
  });

  // --- 1. CREATE RAZORPAY ORDER + RESERVE STOCK ---
  router.post('/create-order', authenticate, async (req, res) => {
    try {
      const userId = Number(req.user.id || req.user.userId);
      const { addressId } = req.body;
      
      if (!addressId) return res.status(400).json({ error: "Address ID required" });

      // Address check - IDOR fix
      const address = await prisma.address.findFirst({
        where: { id: Number(addressId), userId }
      });
      if (!address) return res.status(403).json({ error: "Invalid address" });

      const cart = await prisma.cart.findUnique({
        where: { userId },
        include: { items: { include: { product: true } } }
      });
      if (!cart || cart.items.length === 0) return res.status(400).json({ error: "Cart empty" });

      let subtotal = 0;
      for (const item of cart.items) {
        const sizeChart = await prisma.productSizeChart.findUnique({
          where: { productId_size: { productId: item.productId, size: item.size } }
        });
        if (!sizeChart) return res.status(400).json({ error: `${item.product.name} size ${item.size} not found` });
        const available = sizeChart.stock - sizeChart.reservedStock;
        if (available < item.quantity) {
          return res.status(400).json({ error: `${item.product.name} (${item.size}) out of stock. Only ${available} left` });
        }
        subtotal += item.product.price * item.quantity;
      }

      const config = await prisma.storeConfig.findUnique({ where: { id: 1 } });
      const gstAmount = subtotal * ((config?.gstRate || 5) / 100);
      let deliveryFee = config?.deliveryFee || 49;
      if (subtotal >= (config?.freeDeliveryThreshold || 999)) deliveryFee = 0;
      const totalAmount = subtotal + gstAmount + deliveryFee;

      const rzpOrder = await razorpay.orders.create({
        amount: Math.round(totalAmount * 100),
        currency: "INR",
        receipt: `syvora_${userId}_${Date.now()}`
      });

      for (const item of cart.items) {
        await prisma.productSizeChart.update({
          where: { productId_size: { productId: item.productId, size: item.size } },
          data: { reservedStock: { increment: item.quantity } }
        });
      }

      const expectedDate = new Date();
      expectedDate.setDate(expectedDate.getDate() + 5);

      const order = await prisma.order.create({
        data: {
          userId,
          addressId: Number(addressId),
          shippingName: address.name,
          shippingPhone: address.phone,
          shippingLine: address.addressLine,
          shippingCity: address.city,
          shippingState: address.state,
          shippingPincode: address.pincode,
          status: "PAYMENT_PENDING",
          subtotal,
          gstAmount,
          deliveryFee,
          totalAmount,
          expectedDeliveryDate: expectedDate,
          payment: {
            create: {
              gateway: "RAZORPAY",
              gatewayOrderId: rzpOrder.id,
              amount: totalAmount,
              status: "PENDING"
            }
          }
        }
      });

      res.json({
        razorpayOrderId: rzpOrder.id,
        dbOrderId: order.id,
        amount: rzpOrder.amount,
        currency: "INR",
        key: process.env.RAZORPAY_KEY_ID
      });

    } catch (e) {
      console.error("Create order error:", e);
      res.status(500).json({ error: "Order creation failed", details: e.message });
    }
  });

  router.post('/verify-payment', authenticate, async (req, res) => {
    try {
      const { razorpay_order_id, razorpay_payment_id, razorpay_signature, dbOrderId } = req.body;
      const body = razorpay_order_id + "|" + razorpay_payment_id;
      const expectedSignature = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET).update(body).digest('hex');
      if (expectedSignature !== razorpay_signature) {
        return res.status(400).json({ success: false, message: "Fake payment!" });
      }

      await prisma.$transaction(async (tx) => {
        const order = await tx.order.findUnique({ where: { id: Number(dbOrderId) } });
        const cart = await tx.cart.findUnique({
          where: { userId: Number(req.user.id || req.user.userId) },
          include: { items: true }
        });

        for (const item of cart.items) {
          const product = await tx.product.findUnique({ where: { id: item.productId } });
          await tx.orderItem.create({
            data: {
              orderId: order.id,
              productId: item.productId,
              size: item.size,
              quantity: item.quantity,
              price: product.price
            }
          });
          await tx.productSizeChart.update({
            where: { productId_size: { productId: item.productId, size: item.size } },
            data: {
              stock: { decrement: item.quantity },
              reservedStock: { decrement: item.quantity }
            }
          });
        }
        await tx.payment.update({
          where: { orderId: order.id },
          data: { gatewayPaymentId: razorpay_payment_id, gatewaySignature: razorpay_signature, status: "SUCCESS" }
        });
        await tx.order.update({ where: { id: order.id }, data: { status: "CONFIRMED" } });
        await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
      });

      res.json({ success: true, message: "Payment verified & Order Confirmed" });
    } catch (e) {
      console.error("Verify error:", e);
      res.status(500).json({ error: "Verification failed" });
    }
  });

  router.post('/payment-failed', authenticate, async (req, res) => {
    try {
      const userId = Number(req.user.id || req.user.userId);
      const cart = await prisma.cart.findUnique({ where: { userId }, include: { items: true } });
      if (!cart) return res.json({ success: true });
      for (const item of cart.items) {
        await prisma.productSizeChart.update({
          where: { productId_size: { productId: item.productId, size: item.size } },
          data: { reservedStock: { decrement: item.quantity } }
        }).catch(()=>{});
      }
      res.json({ success: true, message: "Stock released" });
    } catch (e) {
      res.status(500).json({ error: "Release failed" });
    }
  });

  return router;
};