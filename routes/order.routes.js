// const express = require('express');
// const jwt = require('jsonwebtoken');
// const { z } = require('zod');

// module.exports = function (prisma, resend) {
//   const router = express.Router();

//   // --- JWT Helper (IDOR FIX) ---
//   function getUserIdFromToken(req){
//     const authHeader = req.headers.authorization;
//     if(!authHeader) throw new Error("Unauthorized");
//     const token = authHeader.split(' ')[1];
//     const decoded = jwt.verify(token, process.env.JWT_SECRET);
//     return decoded.id;
//   }

//   // --- ZOD VALIDATION ---
//   const checkoutSchema = z.object({
//     addressId: z.number().int().positive(),
//     customDeliveryDays: z.number().int().min(1).max(15).optional(),
//     paymentType: z.enum(['PREPAID', 'COD_ADVANCE', 'COD']).default('PREPAID'),
//     checkoutMode: z.enum(['CART', 'BUY_NOW']).default('CART'),
//     buyNowItem: z.object({
//       productId: z.number().int().positive(),
//       quantity: z.number().int().positive().default(1),
//       size: z.string().optional()
//     }).optional()
//   });

//   // =========================================================================
//   // 1. CHECKOUT API - FULL DETAILS EMAIL TO ADMIN & CUSTOMER
//   // =========================================================================
//   router.post('/order/checkout', async (req, res) => {
//     try {
//       const userId = getUserIdFromToken(req);
//       const parsed = checkoutSchema.safeParse(req.body);
//       if(!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
      
//       const { addressId, customDeliveryDays, paymentType, checkoutMode, buyNowItem } = parsed.data;

//       // 0. Verify User Profile & Phone
//       const user = await prisma.user.findUnique({
//         where: { id: Number(userId) },
//         include: { profile: true }
//       });
      
//       if (!user || !user.profile || !user.profile.phone) {
//         return res.status(400).json({ error: "Phone verification required before placing an order." });
//       }

//       // 1. Verify Address
//       const address = await prisma.address.findFirst({
//         where: { id: Number(addressId), userId: Number(userId) }
//       });
//       if (!address) {
//         return res.status(403).json({ error: "Invalid address or not yours" });
//       }

//       let orderItemsToProcess = [];
//       let cartIdToClear = null;

//       // 2. Checkout Mode Logic
//       if (checkoutMode === 'BUY_NOW') {
//         if (!buyNowItem || !buyNowItem.productId) {
//           return res.status(400).json({ error: "Buy Now item details are missing." });
//         }
//         const product = await prisma.product.findUnique({ where: { id: Number(buyNowItem.productId) } });
//         if (!product) return res.status(404).json({ error: "Product not found" });
        
//         orderItemsToProcess = [{
//           productId: product.id,
//           quantity: Number(buyNowItem.quantity) || 1,
//           size: buyNowItem.size || "M",
//           product: product
//         }];
//       } else {
//         const cart = await prisma.cart.findUnique({
//           where: { userId: Number(userId) },
//           include: { items: { include: { product: true } } }
//         });
//         if (!cart || cart.items.length === 0) {
//           return res.status(400).json({ error: "Your cart is empty" });
//         }
//         orderItemsToProcess = cart.items;
//         cartIdToClear = cart.id;
//       }

//       // 3. Subtotal & Totals calculation
//       const subtotal = orderItemsToProcess.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);

//       const config = await prisma.storeConfig.findFirst({ where: { id: 1 } });
//       const gstRate = config?.gstRate || 5.0;
//       const deliveryFeeConfig = config?.deliveryFee || 49;
//       const freeThreshold = config?.freeDeliveryThreshold || 999;

//       const gstAmount = parseFloat(((subtotal * gstRate) / 100).toFixed(2));
//       const deliveryFee = subtotal >= freeThreshold ? 0 : deliveryFeeConfig;
//       const finalTotal = parseFloat((subtotal + gstAmount + deliveryFee).toFixed(2));

//       const previousOrdersCount = await prisma.order.count({ where: { userId: Number(userId) } });
//       if (previousOrdersCount === 0 && paymentType === 'COD') {
//         return res.status(400).json({ error: "Security Policy: Your first order must be Prepaid or require ₹99 Advance COD." });
//       }

//       const deliveryDays = customDeliveryDays ? Number(customDeliveryDays) : 5;
//       const expectedDate = new Date();
//       expectedDate.setDate(expectedDate.getDate() + deliveryDays);

//       // 4. Transaction: Stock Lock + Order Create
//       const order = await prisma.$transaction(async (tx) => {
//         for(const item of orderItemsToProcess){
//           const updated = await tx.product.updateMany({
//             where: { id: item.productId, stock: { gte: item.quantity } },
//             data: { stock: { decrement: item.quantity } }
//           });
//           if(updated.count === 0){
//             throw new Error(`Out of stock: ${item.product?.name || item.productId}`);
//           }
//         }

//         const newOrder = await tx.order.create({
//           data: {
//             userId: Number(userId),
//             addressId: Number(addressId),
//             shippingName: address.name,
//             shippingPhone: address.phone,
//             shippingLine: address.addressLine,
//             shippingCity: address.city,
//             shippingState: address.state,
//             shippingPincode: address.pincode,
//             subtotal, gstAmount, deliveryFee, totalAmount: finalTotal,
//             status: "PENDING",
//             expectedDeliveryDate: expectedDate,
//             items: {
//               create: orderItemsToProcess.map(item => ({
//                 productId: item.productId,
//                 size: item.size || "M",
//                 quantity: item.quantity,
//                 price: item.product.price
//               }))
//             }
//           },
//           include: { items: { include: { product: true } }, address: true }
//         });

//         if (checkoutMode === 'CART' && cartIdToClear) {
//           await tx.cartItem.deleteMany({ where: { cartId: cartIdToClear } });
//         }
        
//         return newOrder;
//       });

//       // 🚀 5. SEND DETAILED EMAILS VIA RESEND (Using your verified domain)
//       if (resend) {
//         try {
//           const adminEmail = "syvora.official.acc@gmail.com";
          
//           // HTML items list generate karne ke liye (Syntax fixed here!)
//           const itemsHtml = order.items.map(i => `
//             <tr>
//               <td style="padding: 8px; border-bottom: 1px solid #eee;">${i.product.name} (Size: ${i.size})</td>
//               <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: center;">${i.quantity}</td>
//               <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">₹${i.price * i.quantity}</td>
//             </tr>
//           `).join('');

//           // A. Admin Notification Email (Poori detail ke sath)
//           await resend.emails.send({
//             from: "Syvora Orders <orders@syvora.in>",
//             replyTo: user.email,
//             to: [adminEmail],
//             subject: `🚨 NEW ORDER #SYV-${order.id} Received!`,
//             html: `
//               <div style="font-family: Arial, sans-serif; padding: 20px; color: #3D2B1F; background: #FAF7F2; border-radius: 10px;">
//                 <h2 style="color: #4A3024;">🎉 New Order Placed! (#SYV-${order.id})</h2>
//                 <p><b>Customer Name:</b> ${address.name}</p>
//                 <p><b>Customer Phone:</b> ${address.phone}</p>
//                 <p><b>Customer Email:</b> ${user.email}</p>
                
//                 <h3 style="margin-top: 15px; color: #4A3024;">Shipping Address:</h3>
//                 <p style="background: #FFF; padding: 10px; border-radius: 5px;">
//                   ${address.addressLine}, ${address.city}, ${address.state} - ${address.pincode}
//                 </p>

//                 <h3 style="margin-top: 15px; color: #4A3024;">Ordered Items:</h3>
//                 <table style="width: 100%; background: #FFF; border-collapse: collapse; border-radius: 5px; overflow: hidden;">
//                   <tr style="background: #EEDFD2; text-align: left;">
//                     <th style="padding: 8px;">Item</th>
//                     <th style="padding: 8px; text-align: center;">Qty</th>
//                     <th style="padding: 8px; text-align: right;">Price</th>
//                   </tr>
//                   ${itemsHtml}
//                 </table>

//                 <p style="margin-top: 15px;"><b>Subtotal:</b> ₹${order.subtotal}</p>
//                 <p><b>GST (5%):</b> ₹${order.gstAmount}</p>
//                 <p><b>Delivery Fee:</b> ₹${order.deliveryFee}</p>
//                 <h3 style="color: #4A3024;">Grand Total: ₹${order.totalAmount}</h3>
                
//                 <p style="color: #8B6B4A; font-weight: bold; margin-top: 20px;">Team Syvora System</p>
//               </div>
//             `
//           });

//           // B. Customer Confirmation Email
//           if (user.email) {
//             await resend.emails.send({
//               from: "Syvora Orders <orders@syvora.in>",
//               replyTo: "syvora.official.acc@gmail.com",
//               to: [user.email],
//               subject: `🎉 Order Confirmed! #SYV-${order.id} - Syvora`,
//               html: `
//                 <div style="font-family: Arial, sans-serif; padding: 20px; color: #3D2B1F; background: #FAF7F2; border-radius: 10px;">
//                   <h2 style="color: #4A3024;">Thank you for shopping with Syvora, ${address.name}!</h2>
//                   <p>Your order <b>#SYV-${order.id}</b> has been successfully placed and is being prepared.</p>
                  
//                   <h3 style="margin-top: 15px; color: #4A3024;">Order Summary:</h3>
//                   <table style="width: 100%; background: #FFF; border-collapse: collapse; border-radius: 5px; overflow: hidden;">
//                     <tr style="background: #EEDFD2; text-align: left;">
//                       <th style="padding: 8px;">Item</th>
//                       <th style="padding: 8px; text-align: center;">Qty</th>
//                       <th style="padding: 8px; text-align: right;">Price</th>
//                     </tr>
//                     ${itemsHtml}
//                   </table>

//                   <p style="margin-top: 15px;"><b>Grand Total:</b> ₹${order.totalAmount}</p>
//                   <p><b>Delivery Address:</b> ${address.addressLine}, ${address.city} - ${address.pincode}</p>
                  
//                   <p>We will notify you with tracking details once your order ships.</p>
//                   <p style="color: #8B6B4A; font-weight: bold; margin-top: 20px;">Team Syvora</p>
//                 </div>
//               `
//             });
//           }
//           console.log(`[ORDER EMAIL] Successfully sent detailed emails for Order #${order.id}`);
//         } catch (mailErr) {
//           console.error("❌ Resend Checkout Email Error:", mailErr.message);
//         }
//       }

//       res.status(201).json({ message: "Order placed successfully!", order });
//     } catch (error) {
//       console.error("Checkout Error:", error);
//       if(error.message === "Unauthorized") return res.status(401).json({ error: "Invalid token" });
//       if(error.message.includes("Out of stock")) return res.status(400).json({ error: error.message });
//       res.status(500).json({ error: "Internal Server Error" });
//     }
//   });

//   // =========================================================================
//   // 2. ADMIN PENDING ORDERS
//   // =========================================================================
//   router.get('/admin/orders/pending', async (req, res) => {
//     try {
//       getUserIdFromToken(req);
//       const pendingOrders = await prisma.order.findMany({
//         where: { status: { in: ["PENDING", "CONFIRMED"] } },
//         include: { user: { include: { profile: true, addresses: true } }, address: true, items: { include: { product: { include: { brand: true, images: true } } } } },
//         orderBy: { createdAt: 'desc' }
//       });
//       res.json({ count: pendingOrders.length, orders: pendingOrders });
//     } catch (error) { res.status(500).json({ error: "Internal Server Error" }); }
//   });

//   // =========================================================================
//   // 3. GET USER ORDER HISTORY
//   // =========================================================================
//   router.get('/order/user/:userId', async (req, res) => {
//     try {
//       const tokenUserId = getUserIdFromToken(req);
//       const paramUserId = Number(req.params.userId);
//       if(tokenUserId !== paramUserId){
//         const user = await prisma.user.findUnique({ where: { id: tokenUserId } });
//         if(!user || user.role !== 'ADMIN') return res.status(403).json({ error: "Access denied" });
//       }
//       const orders = await prisma.order.findMany({
//         where: { userId: paramUserId },
//         include: { address: true, items: { include: { product: { include: { images: true, brand: true } } } }, payment: true },
//         orderBy: { createdAt: 'desc' }
//       });
//       res.json(orders);
//     } catch (error) {
//       if(error.message === "Unauthorized") return res.status(401).json({ error: "Invalid token" });
//       res.status(500).json({ error: "Internal Server Error" });
//     }
//   });

//   // =========================================================================
//   // 4. TRACKING API
//   // =========================================================================
//   router.get('/order/:id/tracking', async (req, res) => {
//     try {
//       const userId = getUserIdFromToken(req);
//       const order = await prisma.order.findUnique({ where: { id: Number(req.params.id) } });
//       if (!order) return res.status(404).json({ error: "Order not found" });
//       if(order.userId !== userId){
//         const user = await prisma.user.findUnique({ where: { id: userId } });
//         if(user.role !== 'ADMIN') return res.status(403).json({ error: "Access denied" });
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

//       res.json({ 
//         orderId: order.id, 
//         currentStatus: order.status, 
//         trackingId: order.trackingId || "N/A", 
//         courierName: order.courierName || "N/A", 
//         expectedDeliveryDate: order.expectedDeliveryDate, 
//         timeline, 
//         shippingAddress: `${order.shippingLine}, ${order.shippingCity}` 
//       });
//     } catch (error) { res.status(500).json({ error: "Internal Server Error" }); }
//   });

//   // =========================================================================
//   // 5. UPDATE STATUS & AWB NUMBER (Admin)
//   // =========================================================================
//   router.patch('/order/:id/status', async (req, res) => {
//     try {
//       const userId = getUserIdFromToken(req);
//       const user = await prisma.user.findUnique({ where: { id: userId } });
//       if(!user || user.role !== 'ADMIN') return res.status(403).json({ error: "Admins only" });
      
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

//       res.json({ message: "Order updated successfully!", order: updatedOrder });
//     } catch (error) { res.status(500).json({ error: "Internal Server Error" }); }
//   });

//   return router;
// };


















// const express = require('express');
// const jwt = require('jsonwebtoken');
// const { z } = require('zod');

// module.exports = function (prisma, resend) {
//   const router = express.Router();

//   // --- JWT Helper (IDOR FIX) ---
//   function getUserIdFromToken(req) {
//     const authHeader = req.headers.authorization;
//     if (!authHeader || !authHeader.startsWith('Bearer ')) throw new Error("Unauthorized");
//     const token = authHeader.split(' ')[1];
//     const decoded = jwt.verify(token, process.env.JWT_SECRET);
//     return decoded.id;
//   }

//   function handleAuthOrServerError(res, error, logLabel) {
//     if (logLabel) console.error(logLabel, error);
//     if (
//       error.message === "Unauthorized" ||
//       error.name === "JsonWebTokenError" ||
//       error.name === "TokenExpiredError"
//     ) {
//       return res.status(401).json({ error: "Invalid token" });
//     }
//     return res.status(500).json({ error: "Internal Server Error" });
//   }

//   // --- ZOD VALIDATION ---
//   const checkoutSchema = z.object({
//     addressId: z.number().int().positive(),
//     customDeliveryDays: z.number().int().min(1).max(15).optional(),
//     paymentType: z.enum(['PREPAID', 'COD_ADVANCE', 'COD']).default('PREPAID'),
//     checkoutMode: z.enum(['CART', 'BUY_NOW']).default('CART'),
//     buyNowItem: z.object({
//       productId: z.number().int().positive(),
//       quantity: z.number().int().positive().default(1),
//       size: z.string().optional()
//     }).optional()
//   });

//   // =========================================================================
//   // 1. CHECKOUT API - FULL DETAILS EMAIL TO ADMIN & CUSTOMER
//   // =========================================================================
//   router.post('/order/checkout', async (req, res) => {
//     try {
//       const userId = getUserIdFromToken(req);
//       const parsed = checkoutSchema.safeParse(req.body);
//       if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

//       const { addressId, customDeliveryDays, paymentType, checkoutMode, buyNowItem } = parsed.data;

//       // 0. Verify User Profile & Phone
//       const user = await prisma.user.findUnique({
//         where: { id: Number(userId) },
//         include: { profile: true }
//       });

//       if (!user || !user.profile || !user.profile.phone) {
//         return res.status(400).json({ error: "Phone verification required before placing an order." });
//       }

//       // 1. Verify Address
//       const address = await prisma.address.findFirst({
//         where: { id: Number(addressId), userId: Number(userId) }
//       });
//       if (!address) {
//         return res.status(403).json({ error: "Invalid address or not yours" });
//       }

//       let orderItemsToProcess = [];
//       let cartIdToClear = null;

//       // 2. Checkout Mode Logic
//       if (checkoutMode === 'BUY_NOW') {
//         if (!buyNowItem || !buyNowItem.productId) {
//           return res.status(400).json({ error: "Buy Now item details are missing." });
//         }
//         const product = await prisma.product.findUnique({ where: { id: Number(buyNowItem.productId) } });
//         if (!product) return res.status(404).json({ error: "Product not found" });

//         orderItemsToProcess = [{
//           productId: product.id,
//           quantity: Number(buyNowItem.quantity) || 1,
//           size: buyNowItem.size || "M",
//           product: product
//         }];
//       } else {
//         const cart = await prisma.cart.findUnique({
//           where: { userId: Number(userId) },
//           include: { items: { include: { product: true } } }
//         });
//         if (!cart || cart.items.length === 0) {
//           return res.status(400).json({ error: "Your cart is empty" });
//         }
//         orderItemsToProcess = cart.items;
//         cartIdToClear = cart.id;
//       }

//       // 3. Subtotal & Totals calculation
//       const subtotal = orderItemsToProcess.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);

//       const config = await prisma.storeConfig.findFirst({ where: { id: 1 } });
//       const gstRate = config?.gstRate || 5.0;
//       const deliveryFeeConfig = config?.deliveryFee || 49;
//       const freeThreshold = config?.freeDeliveryThreshold || 999;

//       const gstAmount = parseFloat(((subtotal * gstRate) / 100).toFixed(2));
//       const deliveryFee = subtotal >= freeThreshold ? 0 : deliveryFeeConfig;
//       const finalTotal = parseFloat((subtotal + gstAmount + deliveryFee).toFixed(2));

//       const previousOrdersCount = await prisma.order.count({ where: { userId: Number(userId) } });
//       if (previousOrdersCount === 0 && paymentType === 'COD') {
//         return res.status(400).json({ error: "Security Policy: Your first order must be Prepaid or require ₹99 Advance COD." });
//       }

//       const deliveryDays = customDeliveryDays ? Number(customDeliveryDays) : 5;
//       const expectedDate = new Date();
//       expectedDate.setDate(expectedDate.getDate() + deliveryDays);

//       // 4. Transaction: Stock Lock + Order Create
//       const order = await prisma.$transaction(async (tx) => {
//         for (const item of orderItemsToProcess) {
//           const updated = await tx.product.updateMany({
//             where: { id: item.productId, stock: { gte: item.quantity } },
//             data: { stock: { decrement: item.quantity } }
//           });
//           if (updated.count === 0) {
//             throw new Error(`Out of stock: ${item.product?.name || item.productId}`);
//           }
//         }

//         const newOrder = await tx.order.create({
//           data: {
//             userId: Number(userId),
//             addressId: Number(addressId),
//             shippingName: address.name,
//             shippingPhone: address.phone,
//             shippingLine: address.addressLine,
//             shippingCity: address.city,
//             shippingState: address.state,
//             shippingPincode: address.pincode,
//             subtotal, gstAmount, deliveryFee, totalAmount: finalTotal,
//             status: "PENDING",
//             expectedDeliveryDate: expectedDate,
//             items: {
//               create: orderItemsToProcess.map(item => ({
//                 productId: item.productId,
//                 size: item.size || "M",
//                 quantity: item.quantity,
//                 price: item.product.price
//               }))
//             }
//           },
//           include: { items: { include: { product: true } }, address: true }
//         });

//         if (checkoutMode === 'CART' && cartIdToClear) {
//           await tx.cartItem.deleteMany({ where: { cartId: cartIdToClear } });
//         }

//         return newOrder;
//       });

//       // 🚀 5. SEND DETAILED EMAILS VIA RESEND (Using your verified domain)
//       if (resend) {
//         try {
//           const adminEmail = "syvora.official.acc@gmail.com";

//           const itemsHtml = order.items.map(i => `
//             <tr>
//               <td style="padding: 8px; border-bottom: 1px solid #eee;">${i.product.name} (Size: ${i.size})</td>
//               <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: center;">${i.quantity}</td>
//               <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">₹${i.price * i.quantity}</td>
//             </tr>
//           `).join('');

//           // A. Admin Notification Email (Poori detail ke sath)
//           await resend.emails.send({
//             from: "Syvora Orders <orders@syvora.in>",
//             replyTo: user.email,
//             to: [adminEmail],
//             subject: `🚨 NEW ORDER #SYV-${order.id} Received!`,
//             html: `
//               <div style="font-family: Arial, sans-serif; padding: 20px; color: #3D2B1F; background: #FAF7F2; border-radius: 10px;">
//                 <h2 style="color: #4A3024;">🎉 New Order Placed! (#SYV-${order.id})</h2>
//                 <p><b>Customer Name:</b> ${address.name}</p>
//                 <p><b>Customer Phone:</b> ${address.phone}</p>
//                 <p><b>Customer Email:</b> ${user.email}</p>
                
//                 <h3 style="margin-top: 15px; color: #4A3024;">Shipping Address:</h3>
//                 <p style="background: #FFF; padding: 10px; border-radius: 5px;">
//                   ${address.addressLine}, ${address.city}, ${address.state} - ${address.pincode}
//                 </p>

//                 <h3 style="margin-top: 15px; color: #4A3024;">Ordered Items:</h3>
//                 <table style="width: 100%; background: #FFF; border-collapse: collapse; border-radius: 5px; overflow: hidden;">
//                   <tr style="background: #EEDFD2; text-align: left;">
//                     <th style="padding: 8px;">Item</th>
//                     <th style="padding: 8px; text-align: center;">Qty</th>
//                     <th style="padding: 8px; text-align: right;">Price</th>
//                   </tr>
//                   ${itemsHtml}
//                 </table>

//                 <p style="margin-top: 15px;"><b>Subtotal:</b> ₹${order.subtotal}</p>
//                 <p><b>GST (5%):</b> ₹${order.gstAmount}</p>
//                 <p><b>Delivery Fee:</b> ₹${order.deliveryFee}</p>
//                 <h3 style="color: #4A3024;">Grand Total: ₹${order.totalAmount}</h3>
                
//                 <p style="color: #8B6B4A; font-weight: bold; margin-top: 20px;">Team Syvora System</p>
//               </div>
//             `
//           });

//           // B. Customer Confirmation Email
//           if (user.email) {
//             await resend.emails.send({
//               from: "Syvora Orders <orders@syvora.in>",
//               replyTo: "syvora.official.acc@gmail.com",
//               to: [user.email],
//               subject: `🎉 Order Confirmed! #SYV-${order.id} - Syvora`,
//               html: `
//                 <div style="font-family: Arial, sans-serif; padding: 20px; color: #3D2B1F; background: #FAF7F2; border-radius: 10px;">
//                   <h2 style="color: #4A3024;">Thank you for shopping with Syvora, ${address.name}!</h2>
//                   <p>Your order <b>#SYV-${order.id}</b> has been successfully placed and is being prepared.</p>
                  
//                   <h3 style="margin-top: 15px; color: #4A3024;">Order Summary:</h3>
//                   <table style="width: 100%; background: #FFF; border-collapse: collapse; border-radius: 5px; overflow: hidden;">
//                     <tr style="background: #EEDFD2; text-align: left;">
//                       <th style="padding: 8px;">Item</th>
//                       <th style="padding: 8px; text-align: center;">Qty</th>
//                       <th style="padding: 8px; text-align: right;">Price</th>
//                     </tr>
//                     ${itemsHtml}
//                   </table>

//                   <p style="margin-top: 15px;"><b>Grand Total:</b> ₹${order.totalAmount}</p>
//                   <p><b>Delivery Address:</b> ${address.addressLine}, ${address.city} - ${address.pincode}</p>
                  
//                   <p>We will notify you with tracking details once your order ships.</p>
//                   <p style="color: #8B6B4A; font-weight: bold; margin-top: 20px;">Team Syvora</p>
//                 </div>
//               `
//             });
//           }
//           console.log(`[ORDER EMAIL] Successfully sent detailed emails for Order #${order.id}`);
//         } catch (mailErr) {
//           console.error("❌ Resend Checkout Email Error:", mailErr.message);
//         }
//       }

//       res.status(201).json({ message: "Order placed successfully!", order });
//     } catch (error) {
//       if (error.message && error.message.includes("Out of stock")) {
//         return res.status(400).json({ error: error.message });
//       }
//       return handleAuthOrServerError(res, error, "Checkout Error:");
//     }
//   });

//   // =========================================================================
//   // 2. ADMIN ORDERS (ALL + FILTER/SEARCH & PENDING COMPATIBILITY)
//   // =========================================================================
//   router.get('/admin/orders', async (req, res) => {
//     try {
//       const userId = getUserIdFromToken(req);
//       const user = await prisma.user.findUnique({ where: { id: Number(userId) } });
//       if (!user || user.role !== 'ADMIN') {
//         return res.status(403).json({ error: "Admins only" });
//       }

//       const { status, search } = req.query;
//       const whereClause = {};

//       if (status && String(status).toUpperCase() !== 'ALL') {
//         whereClause.status = String(status).toUpperCase();
//       }

//       if (search && String(search).trim()) {
//         const q = String(search).trim();
//         const numericId = Number(q.replace(/^#?SYV-/i, ''));
//         const orConditions = [
//           { shippingName: { contains: q, mode: 'insensitive' } },
//           { shippingPhone: { contains: q, mode: 'insensitive' } },
//           { trackingId: { contains: q, mode: 'insensitive' } },
//           { courierName: { contains: q, mode: 'insensitive' } }
//         ];
//         if (Number.isInteger(numericId) && numericId > 0) {
//           orConditions.push({ id: numericId });
//         }
//         whereClause.OR = orConditions;
//       }

//       const orders = await prisma.order.findMany({
//         where: whereClause,
//         include: {
//           user: { include: { profile: true, addresses: true } },
//           address: true,
//           items: { include: { product: { include: { brand: true, images: true } } } },
//           payment: true
//         },
//         orderBy: { createdAt: 'desc' }
//       });

//       res.json({ count: orders.length, orders });
//     } catch (error) {
//       return handleAuthOrServerError(res, error, "Admin Orders Error:");
//     }
//   });

//   router.get('/admin/orders/pending', async (req, res) => {
//     try {
//       const userId = getUserIdFromToken(req);
//       const user = await prisma.user.findUnique({ where: { id: Number(userId) } });
//       if (!user || user.role !== 'ADMIN') {
//         return res.status(403).json({ error: "Admins only" });
//       }

//       const pendingOrders = await prisma.order.findMany({
//         where: { status: { in: ["PENDING", "CONFIRMED"] } },
//         include: {
//           user: { include: { profile: true, addresses: true } },
//           address: true,
//           items: { include: { product: { include: { brand: true, images: true } } } }
//         },
//         orderBy: { createdAt: 'desc' }
//       });
//       res.json({ count: pendingOrders.length, orders: pendingOrders });
//     } catch (error) {
//       return handleAuthOrServerError(res, error, "Pending Orders Error:");
//     }
//   });

//   // =========================================================================
//   // 3. GET USER ORDER HISTORY
//   // =========================================================================
//   router.get('/order/user/:userId', async (req, res) => {
//     try {
//       const tokenUserId = getUserIdFromToken(req);
//       const paramUserId = Number(req.params.userId);
//       if (!Number.isInteger(paramUserId) || paramUserId <= 0) {
//         return res.status(400).json({ error: "Invalid user ID" });
//       }

//       if (tokenUserId !== paramUserId) {
//         const user = await prisma.user.findUnique({ where: { id: Number(tokenUserId) } });
//         if (!user || user.role !== 'ADMIN') return res.status(403).json({ error: "Access denied" });
//       }
//       const orders = await prisma.order.findMany({
//         where: { userId: paramUserId },
//         include: {
//           address: true,
//           items: { include: { product: { include: { images: true, brand: true } } } },
//           payment: true
//         },
//         orderBy: { createdAt: 'desc' }
//       });
//       res.json(orders);
//     } catch (error) {
//       return handleAuthOrServerError(res, error, "User Orders Error:");
//     }
//   });

//   // =========================================================================
//   // 4. TRACKING API
//   // =========================================================================
//   router.get('/order/:id/tracking', async (req, res) => {
//     try {
//       const userId = getUserIdFromToken(req);
//       const orderId = Number(req.params.id);
//       if (!Number.isInteger(orderId) || orderId <= 0) {
//         return res.status(400).json({ error: "Invalid order ID" });
//       }

//       const order = await prisma.order.findUnique({ where: { id: orderId } });
//       if (!order) return res.status(404).json({ error: "Order not found" });

//       if (order.userId !== userId) {
//         const user = await prisma.user.findUnique({ where: { id: Number(userId) } });
//         if (!user || user.role !== 'ADMIN') return res.status(403).json({ error: "Access denied" });
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

//       res.json({
//         orderId: order.id,
//         currentStatus: order.status,
//         trackingId: order.trackingId || "N/A",
//         courierName: order.courierName || "N/A",
//         expectedDeliveryDate: order.expectedDeliveryDate,
//         timeline,
//         shippingAddress: `${order.shippingLine}, ${order.shippingCity}`
//       });
//     } catch (error) {
//       return handleAuthOrServerError(res, error, "Tracking Error:");
//     }
//   });

//   // =========================================================================
//   // 5. UPDATE STATUS & AWB NUMBER (Admin)
//   // =========================================================================
//   router.patch('/order/:id/status', async (req, res) => {
//     try {
//       const userId = getUserIdFromToken(req);
//       const user = await prisma.user.findUnique({ where: { id: Number(userId) } });
//       if (!user || user.role !== 'ADMIN') return res.status(403).json({ error: "Admins only" });

//       const orderId = Number(req.params.id);
//       if (!Number.isInteger(orderId) || orderId <= 0) {
//         return res.status(400).json({ error: "Invalid order ID" });
//       }

//       const existingOrder = await prisma.order.findUnique({
//         where: { id: orderId },
//         include: { items: true }
//       });
//       if (!existingOrder) {
//         return res.status(404).json({ error: "Order not found" });
//       }

//       const { status, trackingId, courierName, expectedDeliveryDate } = req.body || {};
//       const updateData = {};

//       const cleanTrackingId = typeof trackingId === 'string' ? (trackingId.trim() || null) : undefined;
//       const cleanCourierName = typeof courierName === 'string' ? (courierName.trim() || null) : undefined;

//       if (cleanTrackingId) {
//         const duplicate = await prisma.order.findFirst({
//           where: {
//             trackingId: cleanTrackingId,
//             id: { not: orderId }
//           },
//           select: { id: true }
//         });
//         if (duplicate) {
//           return res.status(409).json({ error: "Tracking ID already assigned to another order" });
//         }
//       }

//       if (cleanTrackingId !== undefined) updateData.trackingId = cleanTrackingId;
//       if (cleanCourierName !== undefined) updateData.courierName = cleanCourierName;

//       const allowedStatuses = ["PENDING", "CONFIRMED", "PACKED", "SHIPPED", "OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED", "RTO"];
//       if (status !== undefined) {
//         const normalizedStatus = String(status).toUpperCase();
//         if (!allowedStatuses.includes(normalizedStatus)) {
//           return res.status(400).json({ error: "Invalid order status" });
//         }
//         updateData.status = normalizedStatus;
//       } else if (cleanTrackingId && !["CANCELLED", "DELIVERED", "RTO"].includes(existingOrder.status)) {
//         updateData.status = "SHIPPED";
//       }

//       if (expectedDeliveryDate !== undefined) {
//         if (expectedDeliveryDate === null || expectedDeliveryDate === "") {
//           updateData.expectedDeliveryDate = null;
//         } else {
//           const parsedDate = new Date(expectedDeliveryDate);
//           if (Number.isNaN(parsedDate.getTime())) {
//             return res.status(400).json({ error: "Invalid expectedDeliveryDate" });
//           }
//           updateData.expectedDeliveryDate = parsedDate;
//         }
//       }

//       const shouldRestoreStock =
//         updateData.status === "CANCELLED" && existingOrder.status !== "CANCELLED";

//       const updatedOrder = await prisma.$transaction(async (tx) => {
//         if (shouldRestoreStock && existingOrder.items?.length) {
//           for (const item of existingOrder.items) {
//             await tx.product.updateMany({
//               where: { id: item.productId },
//               data: { stock: { increment: item.quantity } }
//             });
//           }
//         }

//         return tx.order.update({
//           where: { id: orderId },
//           data: updateData
//         });
//       });

//       res.json({ message: "Order updated successfully!", order: updatedOrder });
//     } catch (error) {
//       return handleAuthOrServerError(res, error, "Update Order Status Error:");
//     }
//   });

//   return router;
// };














const express = require('express');
const jwt = require('jsonwebtoken');
const { z } = require('zod');

module.exports = function (prisma, resend, sendNotification) {
  const router = express.Router();

  const MAX_ITEM_QTY = 10;

  // --- JWT Helper (IDOR FIX) ---
  function getUserIdFromToken(req) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) throw new Error("Unauthorized");
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return Number(decoded.id || decoded.userId);
  }

  function handleAuthOrServerError(res, error, logLabel) {
    if (logLabel) console.error(logLabel, error);
    if (
      error.message === "Unauthorized" ||
      error.name === "JsonWebTokenError" ||
      error.name === "TokenExpiredError"
    ) {
      return res.status(401).json({ error: "Invalid token" });
    }
    return res.status(500).json({ error: "Internal Server Error" });
  }

  async function notifyUserSafe(payload) {
    if (typeof sendNotification !== 'function') return;
    try {
      await sendNotification(payload);
    } catch (err) {
      console.error("⚠️ Order notification error:", err.message);
    }
  }

  function isSafeProofUrl(val) {
    if (typeof val !== 'string') return false;
    const trimmed = val.trim();
    if (!trimmed) return false;
    try {
      const parsed = new URL(trimmed);
      return parsed.protocol === 'https:' || parsed.protocol === 'http:';
    } catch {
      return false;
    }
  }

  // --- ZOD VALIDATION ---
  const roomItemInputSchema = z.object({
    productId: z.number().int().positive(),
    quantity: z.number().int().min(1).max(MAX_ITEM_QTY).default(1),
    size: z.string().trim().min(1).max(20).optional(),
    price: z.number().nonnegative().optional()
  });

  const checkoutSchema = z.object({
    addressId: z.number().int().positive(),
    customDeliveryDays: z.number().int().min(1).max(15).optional(),
    paymentType: z.enum(['PREPAID', 'COD_ADVANCE', 'COD']).default('PREPAID'),
    checkoutMode: z.enum(['CART', 'BUY_NOW', 'SHARED_ROOM']).default('CART'),
    couponCode: z.string().trim().min(1).max(40).optional(),
    buyNowItem: z.object({
      productId: z.number().int().positive(),
      quantity: z.number().int().min(1).max(MAX_ITEM_QTY).default(1),
      size: z.string().trim().min(1).max(20).optional()
    }).optional(),
    roomId: z.string().trim().min(1).optional(),
    roomItems: z.array(roomItemInputSchema).optional()
  });

  // =========================================================================
  // 0. PUBLIC STORE / ORDER CONFIG (COD FEE & ₹1000 FREE DELIVERY)
  // =========================================================================
  router.get('/order/config', async (req, res) => {
    try {
      const config = await prisma.storeConfig.findFirst({ where: { id: 1 } });
      return res.json({
        gstRate: config?.gstRate ?? 5.0,
        deliveryFee: config?.deliveryFee ?? 49,
        freeDeliveryThreshold: config?.freeDeliveryThreshold ?? 1000,
        codFee: config?.codFee ?? 10,
      });
    } catch (error) {
      return handleAuthOrServerError(res, error, "Order Config Error:");
    }
  });

  // =========================================================================
  // 1. CHECKOUT API - FULL DETAILS EMAIL TO ADMIN & CUSTOMER
  // =========================================================================
  router.post('/order/checkout', async (req, res) => {
    try {
      const userId = getUserIdFromToken(req);
      const parsed = checkoutSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

      const { addressId, customDeliveryDays, paymentType, checkoutMode, couponCode, buyNowItem, roomId, roomItems } = parsed.data;

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
      let linkedRoomId = null;

      // 2. Checkout Mode Logic (CART / BUY_NOW / SHARED_ROOM)
      if (checkoutMode === 'SHARED_ROOM') {
        if (!roomId) {
          return res.status(400).json({ error: "Room ID is required for shared room checkout." });
        }

        const room = await prisma.shoppingRoom.findUnique({
          where: { id: roomId },
          include: {
            items: {
              include: { product: true }
            }
          }
        });

        if (!room || !room.isActive) {
          return res.status(404).json({ error: "Shopping room not found or expired." });
        }

        if (Number(room.creatorId) !== Number(userId)) {
          return res.status(403).json({ error: "Only the room creator can checkout room items." });
        }

        linkedRoomId = room.id;
        const sourceList = Array.isArray(roomItems) && roomItems.length > 0 ? roomItems : room.items;

        if (!sourceList || sourceList.length === 0) {
          return res.status(400).json({ error: "No items found in room to checkout." });
        }

        for (const rawItem of sourceList) {
          const product = await prisma.product.findUnique({ where: { id: Number(rawItem.productId) } });

          if (!product) {
            return res.status(404).json({ error: `Product not found (ID: ${rawItem.productId})` });
          }

          const qty = Math.min(MAX_ITEM_QTY, Math.max(1, Number(rawItem.quantity) || 1));

          orderItemsToProcess.push({
            productId: product.id,
            quantity: qty,
            size: rawItem.size || "M",
            product
          });
        }
      } else if (checkoutMode === 'BUY_NOW') {
        if (!buyNowItem || !buyNowItem.productId) {
          return res.status(400).json({ error: "Buy Now item details are missing." });
        }
        const product = await prisma.product.findUnique({ where: { id: Number(buyNowItem.productId) } });
        if (!product) return res.status(404).json({ error: "Product not found" });

        const qty = Math.min(MAX_ITEM_QTY, Math.max(1, Number(buyNowItem.quantity) || 1));

        orderItemsToProcess = [{
          productId: product.id,
          quantity: qty,
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
        for (const cItem of cart.items) {
          if (Number(cItem.quantity) > MAX_ITEM_QTY) {
            return res.status(400).json({
              error: `Maximum ${MAX_ITEM_QTY} units allowed per item (${cItem.product?.name || cItem.productId}).`
            });
          }
        }
        orderItemsToProcess = cart.items;
        cartIdToClear = cart.id;
      }

      // 3. Subtotal, Coupon & Totals calculation (DB price trusted, never client price)
      const subtotal = orderItemsToProcess.reduce(
        (sum, item) => sum + (Number(item.product.price) * Number(item.quantity)),
        0
      );

      let matchedCoupon = null;
      let discountAmount = 0;
      const normalizedCouponCode = couponCode ? String(couponCode).trim().toUpperCase() : null;

      if (normalizedCouponCode && prisma.coupon) {
        const coupon = await prisma.coupon.findUnique({ where: { code: normalizedCouponCode } });
        const now = new Date();
        const isExpired = coupon?.expiresAt && new Date(coupon.expiresAt) < now;
        const limitReached = coupon?.usageLimit != null && Number(coupon.usedCount || 0) >= Number(coupon.usageLimit);

        if (!coupon || coupon.isActive === false || isExpired) {
          return res.status(400).json({ error: "Invalid or expired coupon code." });
        }
        if (limitReached) {
          return res.status(400).json({ error: "Coupon usage limit reached." });
        }
        if (coupon.minOrderAmount != null && subtotal < Number(coupon.minOrderAmount)) {
          return res.status(400).json({
            error: `Minimum order value of ₹${Number(coupon.minOrderAmount)} required for this coupon.`
          });
        }
        if (prisma.couponRedemption) {
          const alreadyRedeemed = await prisma.couponRedemption.findFirst({
            where: { couponId: coupon.id, userId: Number(userId) }
          });
          if (alreadyRedeemed) {
            return res.status(400).json({ error: "You have already used this coupon code." });
          }
        }

        matchedCoupon = coupon;
        const pct = Number(coupon.discountPct || 0);
        discountAmount = pct > 0 ? parseFloat(((subtotal * pct) / 100).toFixed(2)) : 0;
      }

      const discountedSubtotal = Math.max(0, parseFloat((subtotal - discountAmount).toFixed(2)));

      const config = await prisma.storeConfig.findFirst({ where: { id: 1 } });
      const gstRate = config?.gstRate ?? 5.0;
      const deliveryFeeConfig = config?.deliveryFee ?? 49;
      const freeThreshold = config?.freeDeliveryThreshold ?? 1000;
      const codFeeConfig = config?.codFee ?? 10;

      const gstAmount = parseFloat(((discountedSubtotal * gstRate) / 100).toFixed(2));
      const deliveryFee = discountedSubtotal >= freeThreshold ? 0 : deliveryFeeConfig;
      const codFee = paymentType === 'COD'
        ? parseFloat(Number(codFeeConfig || 0).toFixed(2))
        : 0;
      const finalTotal = parseFloat((discountedSubtotal + gstAmount + deliveryFee + codFee).toFixed(2));

      const previousOrdersCount = await prisma.order.count({ where: { userId: Number(userId) } });
      if (previousOrdersCount === 0 && paymentType === 'COD') {
        return res.status(400).json({ error: "Security Policy: Your first order must be Prepaid or require ₹99 Advance COD." });
      }

      const deliveryDays = customDeliveryDays ? Number(customDeliveryDays) : 5;
      const expectedDate = new Date();
      expectedDate.setDate(expectedDate.getDate() + deliveryDays);

      // 4. Transaction: Stock Lock + Order Create + Coupon Redemption
      const order = await prisma.$transaction(async (tx) => {
        for (const item of orderItemsToProcess) {
          const updated = await tx.product.updateMany({
            where: { id: item.productId, stock: { gte: item.quantity } },
            data: { stock: { decrement: item.quantity } }
          });
          if (updated.count === 0) {
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
            subtotal,
            gstAmount,
            deliveryFee,
            codFee,
            totalAmount: finalTotal,
            roomId: linkedRoomId,
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

        if (matchedCoupon && tx.coupon) {
          const updatedCoupon = await tx.coupon.updateMany({
            where: {
              id: matchedCoupon.id,
              ...(matchedCoupon.usageLimit != null
                ? { usedCount: { lt: Number(matchedCoupon.usageLimit) } }
                : {})
            },
            data: { usedCount: { increment: 1 } }
          });
          if (updatedCoupon.count === 0) {
            throw new Error("Coupon usage limit reached.");
          }
          if (tx.couponRedemption) {
            await tx.couponRedemption.create({
              data: {
                couponId: matchedCoupon.id,
                userId: Number(userId),
                orderId: newOrder.id
              }
            });
          }
        }

        if (checkoutMode === 'CART' && cartIdToClear) {
          await tx.cartItem.deleteMany({ where: { cartId: cartIdToClear } });
        }

        return newOrder;
      });

      // 🔔 In-app + FCM push notification on order placement
      await notifyUserSafe({
        userId: Number(userId),
        title: `Order #SYV-${order.id} Placed`,
        message: `Your order of ₹${order.totalAmount} has been placed successfully.`,
        orderId: order.id
      });

      // 🚀 5. SEND DETAILED EMAILS VIA RESEND (Using your verified domain)
      if (resend) {
        try {
          const adminEmail = "syvora.official.acc@gmail.com";

          const itemsHtml = order.items.map(i => `
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #eee;">${i.product.name} (Size: ${i.size})</td>
              <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: center;">${i.quantity}</td>
              <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">₹${(Number(i.price) * Number(i.quantity)).toLocaleString('en-IN')}</td>
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
                ${discountAmount > 0 ? `<p><b>Coupon Discount (${matchedCoupon?.code}):</b> -₹${discountAmount}</p>` : ''}
                <p><b>GST (${gstRate}%):</b> ₹${order.gstAmount}</p>
                <p><b>Delivery Fee:</b> ₹${order.deliveryFee}</p>
                ${order.codFee > 0 ? `<p><b>COD Fee:</b> ₹${order.codFee}</p>` : ''}
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
              subject: `🎉 Order Confirmed! #SYV-${order.id} • Syvora`,
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

                  ${discountAmount > 0 ? `<p style="margin-top: 12px;"><b>Coupon Discount:</b> -₹${discountAmount}</p>` : ''}
                  ${order.codFee > 0 ? `<p style="margin-top: 12px;"><b>COD Fee:</b> ₹${order.codFee}</p>` : ''}
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
      if (
        error.message &&
        (error.message.includes("Out of stock") || error.message.includes("Coupon usage limit reached"))
      ) {
        return res.status(400).json({ error: error.message });
      }
      return handleAuthOrServerError(res, error, "Checkout Error:");
    }
  });

  // =========================================================================
  // 2. ADMIN ORDERS (ALL + FILTER/SEARCH & PENDING COMPATIBILITY)
  // =========================================================================
  router.get('/admin/orders', async (req, res) => {
    try {
      const userId = getUserIdFromToken(req);
      const user = await prisma.user.findUnique({ where: { id: Number(userId) } });
      if (!user || user.role !== 'ADMIN') {
        return res.status(403).json({ error: "Admins only" });
      }

      const { status, search } = req.query;
      const whereClause = {};

      if (status && String(status).toUpperCase() !== 'ALL') {
        whereClause.status = String(status).toUpperCase();
      }

      if (search && String(search).trim()) {
        const q = String(search).trim();
        const numericId = Number(q.replace(/^#?SYV-/i, ''));
        const orConditions = [
          { shippingName: { contains: q, mode: 'insensitive' } },
          { shippingPhone: { contains: q, mode: 'insensitive' } },
          { trackingId: { contains: q, mode: 'insensitive' } },
          { courierName: { contains: q, mode: 'insensitive' } }
        ];
        if (Number.isInteger(numericId) && numericId > 0) {
          orConditions.push({ id: numericId });
        }
        whereClause.OR = orConditions;
      }

      const orders = await prisma.order.findMany({
        where: whereClause,
        include: {
          user: { include: { profile: true, addresses: true } },
          address: true,
          items: { include: { product: { include: { brand: true, images: true } } } },
          payment: true
        },
        orderBy: { createdAt: 'desc' }
      });

      res.json({ count: orders.length, orders });
    } catch (error) {
      return handleAuthOrServerError(res, error, "Admin Orders Error:");
    }
  });

  router.get('/admin/orders/pending', async (req, res) => {
    try {
      const userId = getUserIdFromToken(req);
      const user = await prisma.user.findUnique({ where: { id: Number(userId) } });
      if (!user || user.role !== 'ADMIN') {
        return res.status(403).json({ error: "Admins only" });
      }

      const pendingOrders = await prisma.order.findMany({
        where: { status: { in: ["PENDING", "CONFIRMED"] } },
        include: {
          user: { include: { profile: true, addresses: true } },
          address: true,
          items: { include: { product: { include: { brand: true, images: true } } } }
        },
        orderBy: { createdAt: 'desc' }
      });
      res.json({ count: pendingOrders.length, orders: pendingOrders });
    } catch (error) {
      return handleAuthOrServerError(res, error, "Pending Orders Error:");
    }
  });

  // =========================================================================
  // 3. GET USER ORDER HISTORY
  // =========================================================================
  router.get('/order/user/:userId', async (req, res) => {
    try {
      const tokenUserId = getUserIdFromToken(req);
      const paramUserId = Number(req.params.userId);
      if (!Number.isInteger(paramUserId) || paramUserId <= 0) {
        return res.status(400).json({ error: "Invalid user ID" });
      }

      if (tokenUserId !== paramUserId) {
        const user = await prisma.user.findUnique({ where: { id: Number(tokenUserId) } });
        if (!user || user.role !== 'ADMIN') return res.status(403).json({ error: "Access denied" });
      }
      const orders = await prisma.order.findMany({
        where: { userId: paramUserId },
        include: {
          address: true,
          room: { select: { id: true, creatorId: true } },
          items: { include: { product: { include: { images: true, brand: true } } } },
          payment: true
        },
        orderBy: { createdAt: 'desc' }
      });
      res.json(orders);
    } catch (error) {
      return handleAuthOrServerError(res, error, "User Orders Error:");
    }
  });

  // =========================================================================
  // 4. TRACKING API
  // =========================================================================
  router.get('/order/:id/tracking', async (req, res) => {
    try {
      const userId = getUserIdFromToken(req);
      const orderId = Number(req.params.id);
      if (!Number.isInteger(orderId) || orderId <= 0) {
        return res.status(400).json({ error: "Invalid order ID" });
      }

      const order = await prisma.order.findUnique({ where: { id: orderId } });
      if (!order) return res.status(404).json({ error: "Order not found" });

      if (order.userId !== userId) {
        const user = await prisma.user.findUnique({ where: { id: Number(userId) } });
        if (!user || user.role !== 'ADMIN') return res.status(403).json({ error: "Access denied" });
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
        trackingId: order.trackingId || "N/A",
        courierName: order.courierName || "N/A",
        expectedDeliveryDate: order.expectedDeliveryDate,
        deliveredAt: order.deliveredAt || null,
        timeline,
        shippingAddress: `${order.shippingLine}, ${order.shippingCity}`
      });
    } catch (error) {
      return handleAuthOrServerError(res, error, "Tracking Error:");
    }
  });

  // =========================================================================
  // 5. UPDATE STATUS & AWB NUMBER (Admin)
  // =========================================================================
  router.patch('/order/:id/status', async (req, res) => {
    try {
      const userId = getUserIdFromToken(req);
      const user = await prisma.user.findUnique({ where: { id: Number(userId) } });
      if (!user || user.role !== 'ADMIN') return res.status(403).json({ error: "Admins only" });

      const orderId = Number(req.params.id);
      if (!Number.isInteger(orderId) || orderId <= 0) {
        return res.status(400).json({ error: "Invalid order ID" });
      }

      const existingOrder = await prisma.order.findUnique({
        where: { id: orderId },
        include: {
          items: true,
          user: { include: { profile: true } }
        }
      });
      if (!existingOrder) {
        return res.status(404).json({ error: "Order not found" });
      }

      const { status, trackingId, courierName, expectedDeliveryDate } = req.body || {};
      const updateData = {};

      const cleanTrackingId = typeof trackingId === 'string' ? (trackingId.trim() || null) : undefined;
      const cleanCourierName = typeof courierName === 'string' ? (courierName.trim() || null) : undefined;

      if (cleanTrackingId) {
        const duplicate = await prisma.order.findFirst({
          where: {
            trackingId: cleanTrackingId,
            id: { not: orderId }
          },
          select: { id: true }
        });
        if (duplicate) {
          return res.status(409).json({ error: "Tracking ID already assigned to another order" });
        }
      }

      if (cleanTrackingId !== undefined) updateData.trackingId = cleanTrackingId;
      if (cleanCourierName !== undefined) updateData.courierName = cleanCourierName;

      const allowedStatuses = ["PENDING", "CONFIRMED", "PACKED", "SHIPPED", "OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED", "RTO"];
      if (status !== undefined) {
        const normalizedStatus = String(status).toUpperCase();
        if (!allowedStatuses.includes(normalizedStatus)) {
          return res.status(400).json({ error: "Invalid order status" });
        }
        updateData.status = normalizedStatus;
        if (normalizedStatus === "DELIVERED") {
          updateData.deliveredAt = existingOrder.deliveredAt || new Date();
        } else if (existingOrder.status === "DELIVERED") {
          updateData.deliveredAt = null;
        }
      } else if (cleanTrackingId && !["CANCELLED", "DELIVERED", "RTO"].includes(existingOrder.status)) {
        updateData.status = "SHIPPED";
      }

      if (expectedDeliveryDate !== undefined) {
        if (expectedDeliveryDate === null || expectedDeliveryDate === "") {
          updateData.expectedDeliveryDate = null;
        } else {
          const parsedDate = new Date(expectedDeliveryDate);
          if (Number.isNaN(parsedDate.getTime())) {
            return res.status(400).json({ error: "Invalid expectedDeliveryDate" });
          }
          updateData.expectedDeliveryDate = parsedDate;
        }
      }

      const shouldRestoreStock =
        updateData.status === "CANCELLED" && existingOrder.status !== "CANCELLED";

      const updatedOrder = await prisma.$transaction(async (tx) => {
        if (shouldRestoreStock && existingOrder.items?.length) {
          for (const item of existingOrder.items) {
            await tx.product.updateMany({
              where: { id: item.productId },
              data: { stock: { increment: item.quantity } }
            });
          }
        }

        return tx.order.update({
          where: { id: orderId },
          data: updateData
        });
      });

      const finalTrackingId = updatedOrder.trackingId;
      const finalCourierName = updatedOrder.courierName || "Assigned Courier";
      const customerEmail = existingOrder.user?.email;
      const customerName = existingOrder.shippingName || existingOrder.user?.profile?.name || "Customer";

      // 🔔 In-app + FCM push notification on tracking assign or status change
      const statusChanged = updatedOrder.status !== existingOrder.status;
      const trackingAdded = Boolean(finalTrackingId) && finalTrackingId !== existingOrder.trackingId;

      if (statusChanged || trackingAdded) {
        const notifTitle = trackingAdded
          ? `Tracking Assigned for #SYV-${updatedOrder.id}`
          : `Order #SYV-${updatedOrder.id} ${updatedOrder.status}`;
        const notifMessage = trackingAdded
          ? `Shipped via ${finalCourierName} (AWB: ${finalTrackingId}).`
          : updatedOrder.status === "DELIVERED"
            ? `Your order #SYV-${updatedOrder.id} has been delivered.`
            : `Your order #SYV-${updatedOrder.id} status is now ${updatedOrder.status}.`;

        await notifyUserSafe({
          userId: existingOrder.userId,
          title: notifTitle,
          message: notifMessage,
          orderId: updatedOrder.id
        });
      }

      const shouldSendTrackingEmail =
        Boolean(finalTrackingId) &&
        finalTrackingId !== existingOrder.trackingId &&
        Boolean(customerEmail) &&
        Boolean(resend);

      if (shouldSendTrackingEmail) {
        try {
          const etaText = updatedOrder.expectedDeliveryDate
            ? new Date(updatedOrder.expectedDeliveryDate).toLocaleDateString('en-IN', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })
            : null;

          await resend.emails.send({
            from: "Syvora Orders <orders@syvora.in>",
            replyTo: "syvora.official.acc@gmail.com",
            to: [customerEmail],
            subject: `📦 Tracking ID Assigned for Order #SYV-${updatedOrder.id} • Syvora`,
            html: `
              <div style="font-family: Arial, sans-serif; padding: 20px; color: #3D2B1F; background: #FAF7F2; border-radius: 10px;">
                <h2 style="color: #4A3024;">Your Order #SYV-${updatedOrder.id} Tracking Details</h2>
                <p>Hi ${customerName}, your shipment tracking details have been updated.</p>

                <div style="background: #FFFFFF; padding: 14px; border-radius: 8px; border: 1px solid #E2D3C4; margin: 14px 0;">
                  <p style="margin: 6px 0;"><b>Order ID:</b> #SYV-${updatedOrder.id}</p>
                  <p style="margin: 6px 0;"><b>Status:</b> ${updatedOrder.status}</p>
                  <p style="margin: 6px 0;"><b>Courier Partner:</b> ${finalCourierName}</p>
                  <p style="margin: 6px 0;"><b>Tracking ID / AWB:</b> <b>${finalTrackingId}</b></p>
                  ${etaText ? `<p style="margin: 6px 0;"><b>Expected Delivery:</b> ${etaText}</p>` : ''}
                </div>

                <p style="font-size: 13px; color: #555;">
                  You can track this shipment with <b>${finalCourierName}</b> or view updates inside the Syvora app under <b>My Orders</b>.
                </p>

                <p style="color: #8B6B4A; font-weight: bold; margin-top: 20px;">Team Syvora</p>
              </div>
            `
          });
          console.log(`[TRACKING EMAIL] Sent tracking ID ${finalTrackingId} to ${customerEmail} for Order #${updatedOrder.id}`);
        } catch (mailErr) {
          console.error("❌ Resend Tracking Email Error:", mailErr.message);
        }
      }

      res.json({ message: "Order updated successfully!", order: updatedOrder });
    } catch (error) {
      return handleAuthOrServerError(res, error, "Update Order Status Error:");
    }
  });

  // =========================================================================
  // 6. ITEM-LEVEL RETURN / EXCHANGE / DAMAGED-REFUND REQUESTS
  // =========================================================================
  const returnRequestSchema = z.object({
    type: z.enum(['EXCHANGE', 'REFUND']).optional(),
    reason: z.enum(['SIZE_FIT', 'STYLE_FIT', 'DAMAGED', 'OTHER']).default('SIZE_FIT'),
    exchangeSize: z.string().trim().min(1).max(20).optional(),
    note: z.string().trim().max(500).optional(),
    proofImages: z.array(z.string().trim().min(1)).max(6).optional()
  });

  const RETURN_WINDOW_DAYS = 7;
  const ACTIVE_RETURN_STATUSES = [
    'REQUESTED',
    'APPROVED',
    'PICKUP_SCHEDULED',
    'RECEIVED',
    'INSPECTED',
    'EXCHANGE_DISPATCHED',
    'REFUND_INITIATED',
    'COMPLETED'
  ];

  router.post('/order/:id/items/:orderItemId/return', async (req, res) => {
    try {
      const userId = Number(getUserIdFromToken(req));
      const orderId = Number(req.params.id);
      const orderItemId = Number(req.params.orderItemId);

      if (!Number.isInteger(orderId) || orderId <= 0 || !Number.isInteger(orderItemId) || orderItemId <= 0) {
        return res.status(400).json({ error: "Invalid order ID or item ID" });
      }

      const parsed = returnRequestSchema.safeParse(req.body || {});
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0].message });
      }

      const { reason, exchangeSize, note, proofImages } = parsed.data;
      const requestedType = parsed.data.type || (reason === 'DAMAGED' ? 'REFUND' : 'EXCHANGE');

      if (proofImages && proofImages.some((url) => !isSafeProofUrl(url))) {
        return res.status(400).json({ error: "Invalid proof image URL format." });
      }

      if (requestedType === 'REFUND' && reason !== 'DAMAGED') {
        return res.status(400).json({
          error: "Refunds are allowed only for damaged/defective items. Select Exchange for size or fit changes."
        });
      }

      if (requestedType === 'EXCHANGE' && reason === 'DAMAGED') {
        return res.status(400).json({
          error: "Damaged items must be submitted as a Refund request with proof."
        });
      }

      if (reason === 'DAMAGED' && (!proofImages || proofImages.length === 0) && !note) {
        return res.status(400).json({
          error: "Please provide damage proof photo or description for a damaged item refund."
        });
      }

      if (requestedType === 'EXCHANGE' && !exchangeSize) {
        return res.status(400).json({
          error: "Please select an exchange size."
        });
      }

      const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: {
          items: {
            include: {
              product: {
                include: { sizeChart: true }
              }
            }
          }
        }
      });

      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }

      if (Number(order.userId) !== userId) {
        return res.status(403).json({ error: "Access denied: not your order" });
      }

      if (order.status !== 'DELIVERED') {
        return res.status(400).json({
          error: "Return or exchange can only be requested after the order is delivered."
        });
      }

      const baseDeliveredTime = order.deliveredAt ? new Date(order.deliveredAt).getTime() : new Date(order.updatedAt).getTime();
      const daysSinceDelivery = (Date.now() - baseDeliveredTime) / (1000 * 60 * 60 * 24);
      if (daysSinceDelivery > RETURN_WINDOW_DAYS) {
        return res.status(400).json({
          error: `Return/exchange window of ${RETURN_WINDOW_DAYS} days has expired.`
        });
      }

      const targetItem = order.items.find((i) => Number(i.id) === orderItemId);
      if (!targetItem) {
        return res.status(404).json({ error: "Order item not found in this order" });
      }

      if (requestedType === 'EXCHANGE' && exchangeSize && targetItem.product?.sizeChart?.length) {
        const matchedSize = targetItem.product.sizeChart.find(
          (s) => String(s.size).toLowerCase() === String(exchangeSize).toLowerCase()
        );
        if (!matchedSize) {
          return res.status(400).json({ error: `Size ${exchangeSize} is not available for this product.` });
        }
        if (matchedSize.stock <= 0) {
          return res.status(400).json({ error: `Size ${exchangeSize} is currently out of stock.` });
        }
      }

      const existingRequest = await prisma.returnRequest.findFirst({
        where: {
          orderItemId: targetItem.id,
          status: { in: ACTIVE_RETURN_STATUSES }
        }
      });
      if (existingRequest) {
        return res.status(409).json({
          error: "A return/exchange request already exists for this item.",
          returnRequest: existingRequest
        });
      }

      const createdRequest = await prisma.returnRequest.create({
        data: {
          orderId: order.id,
          orderItemId: targetItem.id,
          userId,
          type: requestedType,
          reason,
          exchangeSize: requestedType === 'EXCHANGE' ? exchangeSize : null,
          note: note || null,
          proofImages: proofImages || [],
          status: 'REQUESTED'
        },
        include: {
          orderItem: {
            include: {
              product: { include: { images: true, brand: true } }
            }
          }
        }
      });

      await notifyUserSafe({
        userId,
        title: `${requestedType === 'REFUND' ? 'Refund' : 'Exchange'} Requested for #SYV-${order.id}`,
        message: `Your ${requestedType.toLowerCase()} request for ${targetItem.product?.name || 'item'} is received and under review.`,
        orderId: order.id,
        productId: targetItem.productId
      });

      return res.status(201).json({
        message: `${requestedType === 'REFUND' ? 'Refund' : 'Exchange'} request submitted successfully.`,
        returnRequest: createdRequest
      });
    } catch (error) {
      return handleAuthOrServerError(res, error, "Create Return/Exchange Error:");
    }
  });

  router.get('/order/:id/returns', async (req, res) => {
    try {
      const userId = Number(getUserIdFromToken(req));
      const orderId = Number(req.params.id);
      if (!Number.isInteger(orderId) || orderId <= 0) {
        return res.status(400).json({ error: "Invalid order ID" });
      }

      const order = await prisma.order.findUnique({
        where: { id: orderId },
        select: { id: true, userId: true }
      });
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }

      if (Number(order.userId) !== userId) {
        const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
        if (!user || user.role !== 'ADMIN') {
          return res.status(403).json({ error: "Access denied" });
        }
      }

      const returnRequests = await prisma.returnRequest.findMany({
        where: { orderId },
        include: {
          orderItem: {
            include: {
              product: { include: { images: true, brand: true } }
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      return res.json({ count: returnRequests.length, returnRequests });
    } catch (error) {
      return handleAuthOrServerError(res, error, "Get Order Returns Error:");
    }
  });

  return router;
};