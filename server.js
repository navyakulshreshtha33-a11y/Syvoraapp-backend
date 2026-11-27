
// require('dotenv').config();

// if (process.env.GOOGLE_CREDENTIALS_JSON) {
//   const fs = require('fs');
//   try {
//     fs.writeFileSync('/tmp/gcp-creds.json', process.env.GOOGLE_CREDENTIALS_JSON);
//     process.env.GOOGLE_APPLICATION_CREDENTIALS = '/tmp/gcp-creds.json';
    
//     const creds = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
//     if (creds.project_id) {
//       process.env.GOOGLE_CLOUD_PROJECT = creds.project_id;
//     }
//     console.log("✅ GCP Credentials configured for project:", process.env.GOOGLE_CLOUD_PROJECT);
//   } catch (err) {
//     console.error("❌ Failed to write GCP credentials file:", err.message);
//   }
// }

// const express = require('express');
// const http = require('http'); 
// const { Server } = require('socket.io'); 
// const cors = require('cors');
// const helmet = require('helmet');
// const rateLimit = require('express-rate-limit');
// const jwt = require('jsonwebtoken');
// const { Pool } = require('pg');
// const { PrismaPg } = require('@prisma/adapter-pg');
// const { PrismaClient } = require('./generated/client');
// const { Resend } = require('resend');

// const app = express();
// const server = http.createServer(app); 

// // ⚡ Socket.io Setup with CORS
// const io = new Server(server, {
//   cors: {
//     origin: '*',
//     methods: ['GET', 'POST']
//   }
// });

// app.set('trust proxy', 1);
// app.use(helmet({ contentSecurityPolicy: false, hsts: { maxAge: 31536000, includeSubDomains: true } }));

// const allowedOrigins = ['https://syvora.in','https://www.syvora.in','http://localhost:3000','http://localhost:5173','http://localhost:8081'];
// app.use(cors({
//   origin: function(origin, callback){
//     if(!origin) return callback(null, true);
//     if(allowedOrigins.includes(origin) || origin.startsWith('exp://') || origin.startsWith('http://localhost:')) {
//       return callback(null, true);
//     }
//     return callback(new Error('CORS blocked'), false);
//   },
//   credentials: true
// }));

// app.use(express.json({ limit: '10mb' }));
// app.use(express.urlencoded({ limit: '10mb', extended: true }));

// const globalLimiter = rateLimit({ 
//   windowMs: 15*60*1000, 
//   max: 200, 
//   standardHeaders: true,
//   legacyHeaders: false,
//   validate: { xForwardedForHeader: false },
//   message: { error: "Too many requests" } 
// });
// app.use('/api/', globalLimiter);

// const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
// const adapter = new PrismaPg(pool);
// const prisma = new PrismaClient({ adapter });

// if(!process.env.JWT_SECRET){ console.error("❌ FATAL: JWT_SECRET missing"); process.exit(1); }
// const JWT_SECRET = process.env.JWT_SECRET;
// const generateToken = (userId, email, role) => jwt.sign({ id: userId, email, role: role || 'USER' }, JWT_SECRET, { expiresIn: '30d' });

// const verifyAdmin = async (req, res, next) => {
//   try {
//     const authHeader = req.headers.authorization;
//     if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ error: "Unauthorized" });
//     const token = authHeader.split(' ')[1];
//     const decoded = jwt.verify(token, JWT_SECRET);
//     const user = await prisma.user.findUnique({ where: { id: Number(decoded.id) } });
//     if (!user || user.role !== 'ADMIN') return res.status(403).json({ error: "Admins only!" });
//     req.user = user;
//     next();
//   } catch { return res.status(401).json({ error: "Invalid token" }); }
// };

// const authLimiter = rateLimit({ windowMs: 15*60*1000, max: 20, message: { error: "Too many auth attempts" } });

// const vtoLimiter = rateLimit({
//   windowMs: 24*60*60*1000, 
//   max: 20,
//   keyGenerator: (req) => {
//     try {
//       const token = req.headers.authorization?.split(' ')[1];
//       if (!token) return req.ip;
//       const d = jwt.verify(token, JWT_SECRET);
//       return `vto_${d.id}`;
//     } catch { 
//       return req.ip; 
//     }
//   },
//   message: { error: "VTO limit reached for today" }
// });

// const resend = new Resend(process.env.RESEND_API_KEY);

// // -------------------------------------------------------------
// // 🔔 DB NOTIFICATION + SAFE FCM PUSH HELPER (NO NEW FILE)
// // -------------------------------------------------------------
// let firebaseMessaging = null;
// try {
//   const admin = require('firebase-admin');
//   if (!admin.apps.length) {
//     if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
//       const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
//       admin.initializeApp({
//         credential: admin.credential.cert(serviceAccount)
//       });
//       firebaseMessaging = admin.messaging();
//       console.log("✅ Firebase Admin initialized for FCM push");
//     }
//   } else {
//     firebaseMessaging = admin.messaging();
//   }
// } catch (fbErr) {
//   console.log("ℹ️ FCM push skipped (firebase-admin or config not active yet):", fbErr.message);
// }

// async function sendUserNotification({ userId, title, message, orderId = null, productId = null }) {
//   try {
//     const cleanUserId = Number(userId);
//     if (!Number.isInteger(cleanUserId) || cleanUserId <= 0) return null;

//     const notification = await prisma.notification.create({
//       data: {
//         userId: cleanUserId,
//         title: String(title).slice(0, 140),
//         message: String(message).slice(0, 500),
//         orderId: orderId ? Number(orderId) : null,
//         productId: productId ? Number(productId) : null,
//       }
//     });

//     const user = await prisma.user.findUnique({
//       where: { id: cleanUserId },
//       select: { fcmToken: true }
//     });

//     if (firebaseMessaging && user?.fcmToken) {
//       try {
//         await firebaseMessaging.send({
//           token: user.fcmToken,
//           notification: {
//             title: String(title).slice(0, 140),
//             body: String(message).slice(0, 500),
//           },
//           data: {
//             notificationId: String(notification.id),
//             ...(orderId ? { orderId: String(orderId) } : {}),
//             ...(productId ? { productId: String(productId) } : {}),
//           }
//         });
//       } catch (pushErr) {
//         const errCode = pushErr?.code || pushErr?.errorInfo?.code || '';
//         if (
//           errCode === 'messaging/registration-token-not-registered' ||
//           errCode === 'messaging/invalid-registration-token'
//         ) {
//           await prisma.user.updateMany({
//             where: { id: cleanUserId },
//             data: { fcmToken: null }
//           }).catch(() => {});
//         } else {
//           console.error("⚠️ FCM send warning:", pushErr.message);
//         }
//       }
//     }

//     return notification;
//   } catch (err) {
//     console.error("❌ Notification helper error:", err.message);
//     return null;
//   }
// }

// // -------------------------------------------------------------
// // ⚡ REAL-TIME SOCKET.IO ENGINE (SHOP TOGETHER ROOMS)
// // -------------------------------------------------------------
// io.on('connection', (socket) => {
//   console.log('⚡ User connected to WebSocket:', socket.id);

//   socket.on('join_room', ({ roomId, userName }) => {
//     socket.join(roomId);
//     console.log(`👤 ${userName} joined room: ${roomId}`);
//     socket.to(roomId).emit('user_joined', { message: `${userName} joined the room` });
//   });

//   socket.on('add_item_to_room', async ({ roomId, productId, addedBy }) => {
//     try {
//       const newItem = await prisma.roomItem.create({
//         data: { roomId, productId: Number(productId), addedBy },
//         include: { product: { include: { images: true, brand: true } } }
//       });
//       io.to(roomId).emit('item_added', newItem);
//     } catch (err) {
//       console.error("❌ Socket Add Item Error:", err);
//     }
//   });

//   socket.on('send_reaction_comment', async ({ roomId, userName, message }) => {
//     try {
//       const comment = await prisma.roomComment.create({
//         data: { roomId, userName, message }
//       });
//       io.to(roomId).emit('new_comment', comment);
//     } catch (err) {
//       console.error("❌ Socket Comment Error:", err);
//     }
//   });

//   socket.on('disconnect', () => {
//     console.log('⚡ User disconnected from WebSocket:', socket.id);
//   });
// });

// // -------------------------------------------------------------
// // 📦 ROUTE IMPORTS & INITIALIZATION
// // -------------------------------------------------------------
// let authRoutes, catalogRoutes, retailerRoutes, cartRoutes, addressRoutes, orderRoutes, 
//     reviewRoutes, vtoRoutes, garmentRoutes, fitRoutes, paymentRoutes, adminRoutes, 
//     couponRoutes, preferenceRoutes, eventRoutes, roomRoutes;

// try {
//   authRoutes = require('./routes/auth.routes')(prisma, resend, generateToken);
//   catalogRoutes = require('./routes/catalog.routes')(prisma, verifyAdmin, resend); 
//   retailerRoutes = require('./routes/retailer.routes')(prisma, verifyAdmin);
//   cartRoutes = require('./routes/cart.routes')(prisma, verifyAdmin);
//   addressRoutes = require('./routes/address.routes')(prisma);
  
//   orderRoutes = require('./routes/order.routes')(prisma, resend, sendUserNotification);
//   console.log("✅ Order Routes Loaded Successfully");

//   reviewRoutes = require('./routes/review.routes')(prisma);
//   garmentRoutes = (() => { const m = require('./routes/garment.routes'); return typeof m === 'function' ? m(prisma) : m; })();
//   fitRoutes = (() => { const m = require('./routes/fit.routes'); return typeof m === 'function' ? m(prisma) : m; })();
  
//   const vtoFn = require('./routes/vto.routes');
//   vtoRoutes = typeof vtoFn === 'function' ? vtoFn(prisma) : vtoFn;
//   console.log("✅ VTO Routes Loaded Successfully");
  
//   // ✅ Payment routes initialized with prisma and resend added!
//   paymentRoutes = require('./routes/payment.routes')(prisma, resend);
//   console.log("✅ Payment Routes Loaded Successfully");
  
//   const couponFn = require('./routes/coupon.routes');
//   couponRoutes = typeof couponFn === 'function' ? couponFn(prisma) : couponFn;
//   console.log("✅ Coupon Routes Loaded Successfully");

//   const adminFn = require('./routes/admin.routes');
//   adminRoutes = typeof adminFn === 'function' ? adminFn(prisma, sendUserNotification) : adminFn;
//   console.log("✅ Admin Routes Loaded Successfully");

//   // 🚀 3 NEW ADVANCED FEATURE ROUTES
//   preferenceRoutes = require('./routes/preference.routes')(prisma);
//   eventRoutes = require('./routes/event.routes')(prisma);
//   roomRoutes = require('./routes/room.routes')(prisma, io);

// } catch(e){ 
//   console.error("❌ Route import error:", e.message, e.stack); 
// }

// // -------------------------------------------------------------
// // 🌐 BASE & HEALTH ENDPOINTS
// // -------------------------------------------------------------
// app.get('/api/legal/privacy', (req,res)=> res.json({ title: "Syvora Privacy - DPDP Act", retention: "VTO 1 hour, Logs 180 days" }));
// app.get('/api/legal/terms', (req,res)=> res.json({ title: "Terms" }));
// app.get('/health', (req,res)=> res.json({ status: "OK" }));
// app.get('/api/health', (req,res)=> res.json({ status: "OK", timestamp: new Date(), secured: "40/40" }));
// app.get('/', (req,res)=> res.send('Syvora API Running Secured 40/40 ✅'));

// // -------------------------------------------------------------
// // 🔀 ROUTE MOUNTING
// // -------------------------------------------------------------
// if(authRoutes) app.use('/api/auth', authLimiter, authRoutes);
// if(catalogRoutes) app.use('/api', catalogRoutes);
// if(retailerRoutes) app.use('/api/retailers', retailerRoutes);
// if(cartRoutes) app.use('/api', cartRoutes);
// if(addressRoutes) app.use('/api', addressRoutes);
// if(orderRoutes) app.use('/api', orderRoutes);
// if(reviewRoutes) app.use('/api/reviews', reviewRoutes);
// if(vtoRoutes) app.use('/api/vto', vtoLimiter, vtoRoutes);
// if(garmentRoutes) app.use('/api/garments', garmentRoutes);
// if(fitRoutes) app.use('/api/fit', fitRoutes);
// if(paymentRoutes) app.use('/api/payment', paymentRoutes);
// if(couponRoutes) app.use('/api/coupon', couponRoutes);
// if(adminRoutes) app.use('/api', adminRoutes);

// // 🚀 MOUNT 3 NEW FEATURE ROUTES
// if(preferenceRoutes) app.use('/api', preferenceRoutes);
// if(eventRoutes) app.use('/api', eventRoutes);
// if(roomRoutes) app.use('/api', roomRoutes);

// app.use((req,res)=> res.status(404).json({ error: "Not found" }));
// app.use((err, req, res, next) => {
//   console.error('Error:', err.message);
//   if (err.message === 'CORS blocked') return res.status(403).json({ error: 'CORS blocked' });
//   res.status(500).json({ error: 'Internal error' });
// });

// // -------------------------------------------------------------
// // 🚀 LISTEN ON HTTP SERVER (REQUIRED FOR SOCKET.IO)
// // -------------------------------------------------------------
// const PORT = process.env.PORT || 5000;
// server.listen(PORT, '0.0.0.0', () => {
//   console.log(`🚀 Syvora Server running on port ${PORT} 40/40 Secured + WebSockets + 3 New Features ✅`);
// });


















// require('dotenv').config();

// if (process.env.GOOGLE_CREDENTIALS_JSON) {
//   const fs = require('fs');
//   try {
//     fs.writeFileSync('/tmp/gcp-creds.json', process.env.GOOGLE_CREDENTIALS_JSON);
//     process.env.GOOGLE_APPLICATION_CREDENTIALS = '/tmp/gcp-creds.json';

//     const creds = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
//     if (creds.project_id) {
//       process.env.GOOGLE_CLOUD_PROJECT = creds.project_id;
//     }
//     console.log("✅ GCP Credentials configured for project:", process.env.GOOGLE_CLOUD_PROJECT);
//   } catch (err) {
//     console.error("❌ Failed to write GCP credentials file:", err.message);
//   }
// }

// const express = require('express');
// const http = require('http');
// const { Server } = require('socket.io');
// const cors = require('cors');
// const helmet = require('helmet');
// const rateLimit = require('express-rate-limit');
// const jwt = require('jsonwebtoken');
// const { Pool } = require('pg');
// const { PrismaPg } = require('@prisma/adapter-pg');
// const { PrismaClient } = require('./generated/client');
// const { Resend } = require('resend');

// const app = express();
// const server = http.createServer(app);

// // ⚡ Socket.io Setup with CORS
// const io = new Server(server, {
//   cors: {
//     origin: '*',
//     methods: ['GET', 'POST']
//   }
// });

// app.set('trust proxy', 1);
// app.use(helmet({ contentSecurityPolicy: false, hsts: { maxAge: 31536000, includeSubDomains: true } }));

// const allowedOrigins = ['https://syvora.in', 'https://www.syvora.in', 'http://localhost:3000', 'http://localhost:5173', 'http://localhost:8081'];
// app.use(cors({
//   origin: function (origin, callback) {
//     if (!origin) return callback(null, true);
//     if (allowedOrigins.includes(origin) || origin.startsWith('exp://') || origin.startsWith('http://localhost:')) {
//       return callback(null, true);
//     }
//     return callback(new Error('CORS blocked'), false);
//   },
//   credentials: true
// }));

// app.use(express.json({ limit: '10mb' }));
// app.use(express.urlencoded({ limit: '10mb', extended: true }));

// const globalLimiter = rateLimit({
//   windowMs: 15 * 60 * 1000,
//   max: 200,
//   standardHeaders: true,
//   legacyHeaders: false,
//   validate: { xForwardedForHeader: false },
//   message: { error: "Too many requests" }
// });
// app.use('/api/', globalLimiter);

// const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
// const adapter = new PrismaPg(pool);
// const prisma = new PrismaClient({ adapter });

// if (!process.env.JWT_SECRET) { console.error("❌ FATAL: JWT_SECRET missing"); process.exit(1); }
// const JWT_SECRET = process.env.JWT_SECRET;
// const generateToken = (userId, email, role) => jwt.sign({ id: userId, email, role: role || 'USER' }, JWT_SECRET, { expiresIn: '30d' });

// const verifyAdmin = async (req, res, next) => {
//   try {
//     const authHeader = req.headers.authorization;
//     if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ error: "Unauthorized" });
//     const token = authHeader.split(' ')[1];
//     const decoded = jwt.verify(token, JWT_SECRET);
//     const user = await prisma.user.findUnique({ where: { id: Number(decoded.id) } });
//     if (!user || user.role !== 'ADMIN') return res.status(403).json({ error: "Admins only!" });
//     req.user = user;
//     next();
//   } catch { return res.status(401).json({ error: "Invalid token" }); }
// };

// const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: { error: "Too many auth attempts" } });

// const vtoLimiter = rateLimit({
//   windowMs: 24 * 60 * 60 * 1000,
//   max: 20,
//   keyGenerator: (req) => {
//     try {
//       const token = req.headers.authorization?.split(' ')[1];
//       if (!token) return req.ip;
//       const d = jwt.verify(token, JWT_SECRET);
//       return `vto_${d.id}`;
//     } catch {
//       return req.ip;
//     }
//   },
//   message: { error: "VTO limit reached for today" }
// });

// const resend = new Resend(process.env.RESEND_API_KEY);

// // -------------------------------------------------------------
// // 🔔 DB NOTIFICATION + SAFE FCM PUSH HELPER (NO NEW FILE)
// // -------------------------------------------------------------
// let firebaseMessaging = null;
// try {
//   const admin = require('firebase-admin');
//   if (!admin.apps.length) {
//     if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
//       const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
//       admin.initializeApp({
//         credential: admin.credential.cert(serviceAccount)
//       });
//       firebaseMessaging = admin.messaging();
//       console.log("✅ Firebase Admin initialized for FCM push");
//     }
//   } else {
//     firebaseMessaging = admin.messaging();
//   }
// } catch (fbErr) {
//   console.log("ℹ️ FCM push skipped (firebase-admin or config not active yet):", fbErr.message);
// }

// async function sendUserNotification({ userId, title, message, orderId = null, productId = null }) {
//   try {
//     const cleanUserId = Number(userId);
//     if (!Number.isInteger(cleanUserId) || cleanUserId <= 0) return null;

//     const notification = await prisma.notification.create({
//       data: {
//         userId: cleanUserId,
//         title: String(title).slice(0, 140),
//         message: String(message).slice(0, 500),
//         orderId: orderId ? Number(orderId) : null,
//         productId: productId ? Number(productId) : null,
//       }
//     });

//     const user = await prisma.user.findUnique({
//       where: { id: cleanUserId },
//       select: { fcmToken: true }
//     });

//     if (firebaseMessaging && user?.fcmToken) {
//       try {
//         await firebaseMessaging.send({
//           token: user.fcmToken,
//           notification: {
//             title: String(title).slice(0, 140),
//             body: String(message).slice(0, 500),
//           },
//           data: {
//             notificationId: String(notification.id),
//             ...(orderId ? { orderId: String(orderId) } : {}),
//             ...(productId ? { productId: String(productId) } : {}),
//           }
//         });
//       } catch (pushErr) {
//         const errCode = pushErr?.code || pushErr?.errorInfo?.code || '';
//         if (
//           errCode === 'messaging/registration-token-not-registered' ||
//           errCode === 'messaging/invalid-registration-token'
//         ) {
//           await prisma.user.updateMany({
//             where: { id: cleanUserId },
//             data: { fcmToken: null }
//           }).catch(() => {});
//         } else {
//           console.error("⚠️ FCM send warning:", pushErr.message);
//         }
//       }
//     }

//     return notification;
//   } catch (err) {
//     console.error("❌ Notification helper error:", err.message);
//     return null;
//   }
// }

// // -------------------------------------------------------------
// // ⚡ REAL-TIME SOCKET.IO ENGINE (SHOP TOGETHER ROOMS)
// // -------------------------------------------------------------
// io.on('connection', (socket) => {
//   console.log('⚡ User connected to WebSocket:', socket.id);

//   socket.on('join_room', ({ roomId, userName }) => {
//     const cleanRoomId = typeof roomId === 'string' ? roomId.trim() : '';
//     if (!cleanRoomId) return;
//     const cleanName = String(userName || 'Guest').slice(0, 60);
//     socket.join(cleanRoomId);
//     console.log(`👤 ${cleanName} joined room: ${cleanRoomId}`);
//     socket.to(cleanRoomId).emit('user_joined', { message: `${cleanName} joined the room` });
//   });

//   socket.on('add_item_to_room', async ({ roomId, productId, addedBy, assignedUserId = null }) => {
//     try {
//       const cleanRoomId = typeof roomId === 'string' ? roomId.trim() : '';
//       const cleanProductId = Number(productId);
//       if (!cleanRoomId || !Number.isInteger(cleanProductId) || cleanProductId <= 0) return;

//       const room = await prisma.shoppingRoom.findUnique({
//         where: { id: cleanRoomId },
//         select: { id: true, isActive: true }
//       });
//       if (!room || !room.isActive) return;

//       const product = await prisma.product.findUnique({
//         where: { id: cleanProductId },
//         select: { id: true }
//       });
//       if (!product) return;

//       const cleanAssigneeId =
//         assignedUserId !== undefined && assignedUserId !== null && assignedUserId !== ''
//           ? Number(assignedUserId)
//           : null;

//       const newItem = await prisma.roomItem.create({
//         data: {
//           roomId: cleanRoomId,
//           productId: cleanProductId,
//           addedBy: String(addedBy || 'Member').slice(0, 60),
//           assignedUserId: cleanAssigneeId && Number.isInteger(cleanAssigneeId) && cleanAssigneeId > 0 ? cleanAssigneeId : null
//         },
//         include: {
//           product: { include: { images: true, brand: true } },
//           assignedUser: {
//             select: {
//               id: true,
//               profile: { select: { name: true } }
//             }
//           }
//         }
//       });
//       io.to(cleanRoomId).emit('item_added', newItem);
//     } catch (err) {
//       console.error("❌ Socket Add Item Error:", err);
//     }
//   });

//   socket.on('send_reaction_comment', async ({ roomId, userName, message }) => {
//     try {
//       const cleanRoomId = typeof roomId === 'string' ? roomId.trim() : '';
//       const cleanMessage = typeof message === 'string' ? message.trim().slice(0, 300) : '';
//       if (!cleanRoomId || !cleanMessage) return;

//       const room = await prisma.shoppingRoom.findUnique({
//         where: { id: cleanRoomId },
//         select: { id: true, isActive: true }
//       });
//       if (!room || !room.isActive) return;

//       const comment = await prisma.roomComment.create({
//         data: {
//           roomId: cleanRoomId,
//           userName: String(userName || 'Member').slice(0, 60),
//           message: cleanMessage
//         }
//       });
//       io.to(cleanRoomId).emit('new_comment', comment);
//     } catch (err) {
//       console.error("❌ Socket Comment Error:", err);
//     }
//   });

//   socket.on('disconnect', () => {
//     console.log('⚡ User disconnected from WebSocket:', socket.id);
//   });
// });

// // -------------------------------------------------------------
// // 📦 ROUTE IMPORTS & INITIALIZATION
// // -------------------------------------------------------------
// let authRoutes, catalogRoutes, retailerRoutes, cartRoutes, addressRoutes, orderRoutes,
//     reviewRoutes, vtoRoutes, garmentRoutes, fitRoutes, paymentRoutes, adminRoutes,
//     couponRoutes, preferenceRoutes, eventRoutes, roomRoutes;

// try {
//   authRoutes = require('./routes/auth.routes')(prisma, resend, generateToken);
//   catalogRoutes = require('./routes/catalog.routes')(prisma, verifyAdmin, resend);
//   retailerRoutes = require('./routes/retailer.routes')(prisma, verifyAdmin);
//   cartRoutes = require('./routes/cart.routes')(prisma, verifyAdmin);
//   addressRoutes = require('./routes/address.routes')(prisma);

//   orderRoutes = require('./routes/order.routes')(prisma, resend, sendUserNotification);
//   console.log("✅ Order Routes Loaded Successfully");

//   reviewRoutes = require('./routes/review.routes')(prisma);
//   garmentRoutes = (() => { const m = require('./routes/garment.routes'); return typeof m === 'function' ? m(prisma) : m; })();
//   fitRoutes = (() => { const m = require('./routes/fit.routes'); return typeof m === 'function' ? m(prisma) : m; })();

//   const vtoFn = require('./routes/vto.routes');
//   vtoRoutes = typeof vtoFn === 'function' ? vtoFn(prisma) : vtoFn;
//   console.log("✅ VTO Routes Loaded Successfully");

//   // ✅ Payment routes initialized with prisma and resend added!
//   paymentRoutes = require('./routes/payment.routes')(prisma, resend);
//   console.log("✅ Payment Routes Loaded Successfully");

//   const couponFn = require('./routes/coupon.routes');
//   couponRoutes = typeof couponFn === 'function' ? couponFn(prisma) : couponFn;
//   console.log("✅ Coupon Routes Loaded Successfully");

//   const adminFn = require('./routes/admin.routes');
//   adminRoutes = typeof adminFn === 'function' ? adminFn(prisma, sendUserNotification) : adminFn;
//   console.log("✅ Admin Routes Loaded Successfully");

//   // 🚀 3 NEW ADVANCED FEATURE ROUTES
//   preferenceRoutes = require('./routes/preference.routes')(prisma);
//   eventRoutes = require('./routes/event.routes')(prisma);
//   roomRoutes = require('./routes/room.routes')(prisma, io);

// } catch (e) {
//   console.error("❌ Route import error:", e.message, e.stack);
// }

// // -------------------------------------------------------------
// // 🌐 BASE & HEALTH ENDPOINTS
// // -------------------------------------------------------------
// app.get('/api/legal/privacy', (req, res) => res.json({ title: "Syvora Privacy - DPDP Act", retention: "VTO 1 hour, Logs 180 days" }));
// app.get('/api/legal/terms', (req, res) => res.json({ title: "Terms" }));
// app.get('/health', (req, res) => res.json({ status: "OK" }));
// app.get('/api/health', (req, res) => res.json({ status: "OK", timestamp: new Date(), secured: "40/40" }));
// app.get('/', (req, res) => res.send('Syvora API Running Secured 40/40 ✅'));

// // -------------------------------------------------------------
// // 🔀 ROUTE MOUNTING
// // -------------------------------------------------------------
// if (authRoutes) app.use('/api/auth', authLimiter, authRoutes);
// if (catalogRoutes) app.use('/api', catalogRoutes);
// if (retailerRoutes) app.use('/api/retailers', retailerRoutes);
// if (cartRoutes) app.use('/api', cartRoutes);
// if (addressRoutes) app.use('/api', addressRoutes);
// if (orderRoutes) app.use('/api', orderRoutes);
// if (reviewRoutes) app.use('/api/reviews', reviewRoutes);
// if (vtoRoutes) app.use('/api/vto', vtoLimiter, vtoRoutes);
// if (garmentRoutes) app.use('/api/garments', garmentRoutes);
// if (fitRoutes) app.use('/api/fit', fitRoutes);
// if (paymentRoutes) app.use('/api/payment', paymentRoutes);
// if (couponRoutes) app.use('/api/coupon', couponRoutes);
// if (adminRoutes) app.use('/api', adminRoutes);

// // 🚀 MOUNT 3 NEW FEATURE ROUTES
// if (preferenceRoutes) app.use('/api', preferenceRoutes);
// if (eventRoutes) app.use('/api', eventRoutes);
// if (roomRoutes) app.use('/api', roomRoutes);

// app.use((req, res) => res.status(404).json({ error: "Not found" }));
// app.use((err, req, res, next) => {
//   console.error('Error:', err.message);
//   if (err.message === 'CORS blocked') return res.status(403).json({ error: 'CORS blocked' });
//   if (err.type === 'entity.too.large' || err?.code === 'LIMIT_FILE_SIZE') {
//     return res.status(400).json({ error: 'Payload or file too large' });
//   }
//   res.status(500).json({ error: 'Internal error' });
// });

// // -------------------------------------------------------------
// // 🚀 LISTEN ON HTTP SERVER (REQUIRED FOR SOCKET.IO)
// // -------------------------------------------------------------
// const PORT = process.env.PORT || 5000;
// server.listen(PORT, '0.0.0.0', () => {
//   console.log(`🚀 Syvora Server running on port ${PORT} 40/40 Secured + WebSockets + 3 New Features ✅`);
// });

// function shutdown(signal) {
//   console.log(`Received ${signal}, shutting down gracefully...`);
//   server.close(async () => {
//     try {
//       await prisma.$disconnect();
//       await pool.end();
//     } catch (_) {}
//     process.exit(0);
//   });
// }

// process.on('SIGTERM', () => shutdown('SIGTERM'));
// process.on('SIGINT', () => shutdown('SIGINT'));















// require('dotenv').config();

// if (process.env.GOOGLE_CREDENTIALS_JSON) {
//   const fs = require('fs');
//   try {
//     fs.writeFileSync('/tmp/gcp-creds.json', process.env.GOOGLE_CREDENTIALS_JSON);
//     process.env.GOOGLE_APPLICATION_CREDENTIALS = '/tmp/gcp-creds.json';

//     const creds = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
//     if (creds.project_id) {
//       process.env.GOOGLE_CLOUD_PROJECT = creds.project_id;
//     }
//     console.log("✅ GCP Credentials configured for project:", process.env.GOOGLE_CLOUD_PROJECT);
//   } catch (err) {
//     console.error("❌ Failed to write GCP credentials file:", err.message);
//   }
// }

// const express = require('express');
// const http = require('http');
// const { Server } = require('socket.io');
// const cors = require('cors');
// const helmet = require('helmet');
// const rateLimit = require('express-rate-limit');
// const jwt = require('jsonwebtoken');
// const { Pool } = require('pg');
// const { PrismaPg } = require('@prisma/adapter-pg');
// const { PrismaClient } = require('./generated/client');
// const { Resend } = require('resend');

// const app = express();
// const server = http.createServer(app);

// // ⚡ Socket.io Setup with CORS
// const io = new Server(server, {
//   cors: {
//     origin: '*',
//     methods: ['GET', 'POST']
//   }
// });

// app.set('trust proxy', 1);
// app.use(helmet({ contentSecurityPolicy: false, hsts: { maxAge: 31536000, includeSubDomains: true } }));

// const allowedOrigins = ['https://syvora.in', 'https://www.syvora.in', 'http://localhost:3000', 'http://localhost:5173', 'http://localhost:8081'];
// app.use(cors({
//   origin: function (origin, callback) {
//     if (!origin) return callback(null, true);
//     if (allowedOrigins.includes(origin) || origin.startsWith('exp://') || origin.startsWith('http://localhost:')) {
//       return callback(null, true);
//     }
//     return callback(new Error('CORS blocked'), false);
//   },
//   credentials: true
// }));

// app.use(express.json({ limit: '10mb' }));
// app.use(express.urlencoded({ limit: '10mb', extended: true }));

// const globalLimiter = rateLimit({
//   windowMs: 15 * 60 * 1000,
//   max: 200,
//   standardHeaders: true,
//   legacyHeaders: false,
//   validate: { xForwardedForHeader: false },
//   message: { error: "Too many requests" }
// });
// app.use('/api/', globalLimiter);

// const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
// const adapter = new PrismaPg(pool);
// const prisma = new PrismaClient({ adapter });

// if (!process.env.JWT_SECRET) { console.error("❌ FATAL: JWT_SECRET missing"); process.exit(1); }
// const JWT_SECRET = process.env.JWT_SECRET;
// const generateToken = (userId, email, role) => jwt.sign({ id: userId, email, role: role || 'USER' }, JWT_SECRET, { expiresIn: '30d' });

// const verifyAdmin = async (req, res, next) => {
//   try {
//     const authHeader = req.headers.authorization;
//     if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ error: "Unauthorized" });
//     const token = authHeader.split(' ')[1];
//     const decoded = jwt.verify(token, JWT_SECRET);
//     const user = await prisma.user.findUnique({ where: { id: Number(decoded.id) } });
//     if (!user || user.role !== 'ADMIN') return res.status(403).json({ error: "Admins only!" });
//     req.user = user;
//     next();
//   } catch { return res.status(401).json({ error: "Invalid token" }); }
// };

// const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: { error: "Too many auth attempts" } });

// const vtoLimiter = rateLimit({
//   windowMs: 24 * 60 * 60 * 1000,
//   max: 20,
//   keyGenerator: (req) => {
//     try {
//       const token = req.headers.authorization?.split(' ')[1];
//       if (!token) return req.ip;
//       const d = jwt.verify(token, JWT_SECRET);
//       return `vto_${d.id}`;
//     } catch {
//       return req.ip;
//     }
//   },
//   message: { error: "VTO limit reached for today" }
// });

// const resend = new Resend(process.env.RESEND_API_KEY);

// // -------------------------------------------------------------
// // 🔔 DB NOTIFICATION + SAFE FCM PUSH HELPER (SINGLE USER & ALL)
// // -------------------------------------------------------------
// let firebaseMessaging = null;
// try {
//   const admin = require('firebase-admin');
//   if (!admin.apps.length) {
//     if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
//       const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
//       admin.initializeApp({
//         credential: admin.credential.cert(serviceAccount)
//       });
//       firebaseMessaging = admin.messaging();
//       console.log("✅ Firebase Admin initialized for FCM push");
//     }
//   } else {
//     firebaseMessaging = admin.messaging();
//   }
// } catch (fbErr) {
//   console.log("ℹ️ FCM push skipped (firebase-admin or config not active yet):", fbErr.message);
// }

// async function deliverPushToToken(uid, token, notificationId, title, message, orderId, productId) {
//   if (!firebaseMessaging || !token) return;
//   try {
//     await firebaseMessaging.send({
//       token,
//       notification: {
//         title: String(title).slice(0, 140),
//         body: String(message).slice(0, 500),
//       },
//       data: {
//         notificationId: String(notificationId),
//         ...(orderId ? { orderId: String(orderId) } : {}),
//         ...(productId ? { productId: String(productId) } : {}),
//       }
//     });
//   } catch (pushErr) {
//     const errCode = pushErr?.code || pushErr?.errorInfo?.code || '';
//     if (
//       errCode === 'messaging/registration-token-not-registered' ||
//       errCode === 'messaging/invalid-registration-token'
//     ) {
//       await prisma.user.updateMany({
//         where: { id: uid },
//         data: { fcmToken: null }
//       }).catch(() => {});
//     } else {
//       console.error("⚠️ FCM send warning:", pushErr.message);
//     }
//   }
// }

// async function sendUserNotification({ userId, audience = 'USER', title, message, orderId = null, productId = null }) {
//   try {
//     const safeTitle = String(title || '').slice(0, 140);
//     const safeMessage = String(message || '').slice(0, 500);
//     if (!safeTitle || !safeMessage) return null;

//     if (audience === 'ALL' && (userId === null || userId === undefined)) {
//       const users = await prisma.user.findMany({
//         select: { id: true, fcmToken: true }
//       });

//       for (const u of users) {
//         const created = await prisma.notification.create({
//           data: {
//             userId: u.id,
//             title: safeTitle,
//             message: safeMessage,
//             orderId: orderId ? Number(orderId) : null,
//             productId: productId ? Number(productId) : null,
//           }
//         });
//         if (u.fcmToken) {
//           await deliverPushToToken(u.id, u.fcmToken, created.id, safeTitle, safeMessage, orderId, productId);
//         }
//       }
//       return { broadcastCount: users.length };
//     }

//     const cleanUserId = Number(userId);
//     if (!Number.isInteger(cleanUserId) || cleanUserId <= 0) return null;

//     const notification = await prisma.notification.create({
//       data: {
//         userId: cleanUserId,
//         title: safeTitle,
//         message: safeMessage,
//         orderId: orderId ? Number(orderId) : null,
//         productId: productId ? Number(productId) : null,
//       }
//     });

//     const user = await prisma.user.findUnique({
//       where: { id: cleanUserId },
//       select: { fcmToken: true }
//     });

//     if (user?.fcmToken) {
//       await deliverPushToToken(cleanUserId, user.fcmToken, notification.id, safeTitle, safeMessage, orderId, productId);
//     }

//     return notification;
//   } catch (err) {
//     console.error("❌ Notification helper error:", err.message);
//     return null;
//   }
// }

// // -------------------------------------------------------------
// // ⚡ REAL-TIME SOCKET.IO ENGINE (SHOP TOGETHER ROOMS)
// // -------------------------------------------------------------
// io.on('connection', (socket) => {
//   console.log('⚡ User connected to WebSocket:', socket.id);

//   socket.on('join_room', ({ roomId, userName }) => {
//     const cleanRoomId = typeof roomId === 'string' ? roomId.trim() : '';
//     if (!cleanRoomId) return;
//     const cleanName = String(userName || 'Guest').slice(0, 60);
//     socket.join(cleanRoomId);
//     console.log(`👤 ${cleanName} joined room: ${cleanRoomId}`);
//     socket.to(cleanRoomId).emit('user_joined', { message: `${cleanName} joined the room` });
//   });

//   socket.on('add_item_to_room', async ({ roomId, productId, addedBy, assignedUserId = null }) => {
//     try {
//       const cleanRoomId = typeof roomId === 'string' ? roomId.trim() : '';
//       const cleanProductId = Number(productId);
//       if (!cleanRoomId || !Number.isInteger(cleanProductId) || cleanProductId <= 0) return;

//       const room = await prisma.shoppingRoom.findUnique({
//         where: { id: cleanRoomId },
//         select: { id: true, isActive: true }
//       });
//       if (!room || !room.isActive) return;

//       const product = await prisma.product.findUnique({
//         where: { id: cleanProductId },
//         select: { id: true }
//       });
//       if (!product) return;

//       const cleanAssigneeId =
//         assignedUserId !== undefined && assignedUserId !== null && assignedUserId !== ''
//           ? Number(assignedUserId)
//           : null;

//       const newItem = await prisma.roomItem.create({
//         data: {
//           roomId: cleanRoomId,
//           productId: cleanProductId,
//           addedBy: String(addedBy || 'Member').slice(0, 60),
//           assignedUserId: cleanAssigneeId && Number.isInteger(cleanAssigneeId) && cleanAssigneeId > 0 ? cleanAssigneeId : null
//         },
//         include: {
//           product: { include: { images: true, brand: true } },
//           assignedUser: {
//             select: {
//               id: true,
//               profile: { select: { name: true } }
//             }
//           }
//         }
//       });
//       io.to(cleanRoomId).emit('item_added', newItem);
//     } catch (err) {
//       console.error("❌ Socket Add Item Error:", err);
//     }
//   });

//   socket.on('send_reaction_comment', async ({ roomId, userName, message }) => {
//     try {
//       const cleanRoomId = typeof roomId === 'string' ? roomId.trim() : '';
//       const cleanMessage = typeof message === 'string' ? message.trim().slice(0, 300) : '';
//       if (!cleanRoomId || !cleanMessage) return;

//       const room = await prisma.shoppingRoom.findUnique({
//         where: { id: cleanRoomId },
//         select: { id: true, isActive: true }
//       });
//       if (!room || !room.isActive) return;

//       const comment = await prisma.roomComment.create({
//         data: {
//           roomId: cleanRoomId,
//           userName: String(userName || 'Member').slice(0, 60),
//           message: cleanMessage
//         }
//       });
//       io.to(cleanRoomId).emit('new_comment', comment);
//     } catch (err) {
//       console.error("❌ Socket Comment Error:", err);
//     }
//   });

//   socket.on('disconnect', () => {
//     console.log('⚡ User disconnected from WebSocket:', socket.id);
//   });
// });

// // -------------------------------------------------------------
// // 📦 ROUTE IMPORTS & INITIALIZATION
// // -------------------------------------------------------------
// let authRoutes, catalogRoutes, retailerRoutes, cartRoutes, addressRoutes, orderRoutes,
//     reviewRoutes, vtoRoutes, garmentRoutes, fitRoutes, paymentRoutes, adminRoutes,
//     couponRoutes, preferenceRoutes, eventRoutes, roomRoutes;

// try {
//   authRoutes = require('./routes/auth.routes')(prisma, resend, generateToken);
//   catalogRoutes = require('./routes/catalog.routes')(prisma, verifyAdmin, resend);
//   retailerRoutes = require('./routes/retailer.routes')(prisma, verifyAdmin);
//   cartRoutes = require('./routes/cart.routes')(prisma, verifyAdmin);
//   addressRoutes = require('./routes/address.routes')(prisma);

//   orderRoutes = require('./routes/order.routes')(prisma, resend, sendUserNotification);
//   console.log("✅ Order Routes Loaded Successfully");

//   reviewRoutes = require('./routes/review.routes')(prisma);
//   garmentRoutes = (() => { const m = require('./routes/garment.routes'); return typeof m === 'function' ? m(prisma) : m; })();
//   fitRoutes = (() => { const m = require('./routes/fit.routes'); return typeof m === 'function' ? m(prisma) : m; })();

//   const vtoFn = require('./routes/vto.routes');
//   vtoRoutes = typeof vtoFn === 'function' ? vtoFn(prisma) : vtoFn;
//   console.log("✅ VTO Routes Loaded Successfully");

//   paymentRoutes = require('./routes/payment.routes')(prisma, resend);
//   console.log("✅ Payment Routes Loaded Successfully");

//   const couponFn = require('./routes/coupon.routes');
//   couponRoutes = typeof couponFn === 'function' ? couponFn(prisma) : couponFn;
//   console.log("✅ Coupon Routes Loaded Successfully");

//   const adminFn = require('./routes/admin.routes');
//   adminRoutes = typeof adminFn === 'function' ? adminFn(prisma, sendUserNotification) : adminFn;
//   console.log("✅ Admin Routes Loaded Successfully");

//   preferenceRoutes = require('./routes/preference.routes')(prisma);
//   eventRoutes = require('./routes/event.routes')(prisma);
//   roomRoutes = require('./routes/room.routes')(prisma, io);

// } catch (e) {
//   console.error("❌ Route import error:", e.message, e.stack);
// }

// // -------------------------------------------------------------
// // 🌐 BASE & HEALTH ENDPOINTS
// // -------------------------------------------------------------
// app.get('/api/legal/privacy', (req, res) => res.json({ title: "Syvora Privacy - DPDP Act", retention: "VTO 1 hour, Logs 180 days" }));
// app.get('/api/legal/terms', (req, res) => res.json({ title: "Terms" }));
// app.get('/health', (req, res) => res.json({ status: "OK" }));
// app.get('/api/health', (req, res) => res.json({ status: "OK", timestamp: new Date(), secured: "40/40" }));
// app.get('/', (req, res) => res.send('Syvora API Running Secured 40/40 ✅'));

// // -------------------------------------------------------------
// // 🔀 ROUTE MOUNTING
// // -------------------------------------------------------------
// if (authRoutes) app.use('/api/auth', authLimiter, authRoutes);
// if (catalogRoutes) app.use('/api', catalogRoutes);
// if (retailerRoutes) app.use('/api/retailers', retailerRoutes);
// if (cartRoutes) app.use('/api', cartRoutes);
// if (addressRoutes) app.use('/api', addressRoutes);
// if (orderRoutes) app.use('/api', orderRoutes);
// if (reviewRoutes) app.use('/api/reviews', reviewRoutes);
// if (vtoRoutes) app.use('/api/vto', vtoLimiter, vtoRoutes);
// if (garmentRoutes) app.use('/api/garments', garmentRoutes);
// if (fitRoutes) app.use('/api/fit', fitRoutes);
// if (paymentRoutes) app.use('/api/payment', paymentRoutes);
// if (couponRoutes) app.use('/api/coupon', couponRoutes);
// if (adminRoutes) app.use('/api', adminRoutes);

// if (preferenceRoutes) app.use('/api', preferenceRoutes);
// if (eventRoutes) app.use('/api', eventRoutes);
// if (roomRoutes) app.use('/api', roomRoutes);

// app.use((req, res) => res.status(404).json({ error: "Not found" }));
// app.use((err, req, res, next) => {
//   console.error('Error:', err.message);
//   if (err.message === 'CORS blocked') return res.status(403).json({ error: 'CORS blocked' });
//   if (err.type === 'entity.too.large' || err?.code === 'LIMIT_FILE_SIZE') {
//     return res.status(400).json({ error: 'Payload or file too large' });
//   }
//   res.status(500).json({ error: 'Internal error' });
// });

// // -------------------------------------------------------------
// // 🚀 LISTEN ON HTTP SERVER (REQUIRED FOR SOCKET.IO)
// // -------------------------------------------------------------
// const PORT = process.env.PORT || 5000;
// server.listen(PORT, '0.0.0.0', () => {
//   console.log(`🚀 Syvora Server running on port ${PORT} 40/40 Secured + WebSockets + 3 New Features ✅`);
// });

// function shutdown(signal) {
//   console.log(`Received ${signal}, shutting down gracefully...`);
//   server.close(async () => {
//     try {
//       await prisma.$disconnect();
//       await pool.end();
//     } catch (_) {}
//     process.exit(0);
//   });
// }

// process.on('SIGTERM', () => shutdown('SIGTERM'));
// process.on('SIGINT', () => shutdown('SIGINT'));

















require('dotenv').config();

if (process.env.GOOGLE_CREDENTIALS_JSON) {
  const fs = require('fs');
  try {
    fs.writeFileSync('/tmp/gcp-creds.json', process.env.GOOGLE_CREDENTIALS_JSON);
    process.env.GOOGLE_APPLICATION_CREDENTIALS = '/tmp/gcp-creds.json';

    const creds = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
    if (creds.project_id) {
      process.env.GOOGLE_CLOUD_PROJECT = creds.project_id;
    }
    console.log("✅ GCP Credentials configured for project:", process.env.GOOGLE_CLOUD_PROJECT);
  } catch (err) {
    console.error("❌ Failed to write GCP credentials file:", err.message);
  }
}

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('./generated/client');
const { Resend } = require('resend');

const app = express();
const server = http.createServer(app);

// ⚡ Socket.io Setup with CORS
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false, hsts: { maxAge: 31536000, includeSubDomains: true } }));

const allowedOrigins = ['https://syvora.in', 'https://www.syvora.in', 'http://localhost:3000', 'http://localhost:5173', 'http://localhost:8081'];
app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin) || origin.startsWith('exp://') || origin.startsWith('http://localhost:')) {
      return callback(null, true);
    }
    return callback(new Error('CORS blocked'), false);
  },
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  message: { error: "Too many requests" }
});
app.use('/api/', globalLimiter);

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

if (!process.env.JWT_SECRET) { console.error("❌ FATAL: JWT_SECRET missing"); process.exit(1); }
const JWT_SECRET = process.env.JWT_SECRET;
const generateToken = (userId, email, role) => jwt.sign({ id: userId, email, role: role || 'USER' }, JWT_SECRET, { expiresIn: '30d' });

const verifyAdmin = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ error: "Unauthorized" });
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await prisma.user.findUnique({ where: { id: Number(decoded.id) } });
    if (!user || user.role !== 'ADMIN') return res.status(403).json({ error: "Admins only!" });
    req.user = user;
    next();
  } catch { return res.status(401).json({ error: "Invalid token" }); }
};

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: { error: "Too many auth attempts" } });

const vtoLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: 20,
  keyGenerator: (req) => {
    try {
      const token = req.headers.authorization?.split(' ')[1];
      if (token) {
        const d = jwt.verify(token, JWT_SECRET);
        return `vto_${d.id}`;
      }
    } catch {}
    return ipKeyGenerator(req.ip);
  },
  message: { error: "VTO limit reached for today" }
});

const resend = new Resend(process.env.RESEND_API_KEY);

// -------------------------------------------------------------
// 🔔 DB NOTIFICATION + SAFE FCM PUSH HELPER (SINGLE USER & ALL)
// -------------------------------------------------------------
let firebaseMessaging = null;
try {
  const { initializeApp, cert, getApps } = require('firebase-admin/app');
  const { getMessaging } = require('firebase-admin/messaging');

  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    let rawJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON.trim();
    if (
      (rawJson.startsWith("'") && rawJson.endsWith("'")) ||
      (rawJson.startsWith('"') && rawJson.endsWith('"'))
    ) {
      rawJson = rawJson.slice(1, -1);
    }
    const serviceAccount = JSON.parse(rawJson);
    const appInstance = getApps().length
      ? getApps()[0]
      : initializeApp({
          credential: cert(serviceAccount),
        });
    firebaseMessaging = getMessaging(appInstance);
    console.log("✅ Firebase Admin initialized for FCM push");
  } else {
    console.log("ℹ️ FIREBASE_SERVICE_ACCOUNT_JSON not found in env");
  }
} catch (fbErr) {
  console.log("ℹ️ FCM push skipped (firebase-admin or config not active yet):", fbErr.message);
}

function stripEventMetaTag(text) {
  return String(text || '').replace(/\s*\[EVT:[^\]]*\]\s*$/g, '').trim();
}

function extractEventMetaFromMessage(text) {
  const match = String(text || '').match(/\[EVT:([^|\]]*)\|([^\]]*)\]\s*$/);
  if (!match) return null;
  const vibeTag = decodeURIComponent(match[1] || '').trim();
  const eventName = decodeURIComponent(match[2] || '').trim();
  if (!vibeTag && !eventName) return null;
  return { vibeTag, eventName };
}

async function deliverPushToToken(uid, token, notificationId, title, message, orderId, productId, imageUrl = null, eventMeta = null) {
  if (!firebaseMessaging) {
    console.log(`ℹ️ FCM skipped for user=${uid}: firebaseMessaging not initialized`);
    return;
  }
  if (!token) {
    console.log(`ℹ️ FCM skipped for user=${uid}: no fcmToken in DB`);
    return;
  }

  const cleanTitle = stripEventMetaTag(title).slice(0, 140);
  const cleanBody = stripEventMetaTag(message).slice(0, 500);
  try {
    const messageId = await firebaseMessaging.send({
      token,
      notification: {
        title: cleanTitle,
        body: cleanBody,
        ...(imageUrl ? { imageUrl: String(imageUrl) } : {}),
      },
      android: {
        priority: 'high',
        notification: {
          channelId: 'default',
          sound: 'default',
          ...(imageUrl ? { imageUrl: String(imageUrl) } : {}),
        },
      },
      data: {
        notificationId: String(notificationId),
        ...(orderId ? { orderId: String(orderId) } : {}),
        ...(productId ? { productId: String(productId) } : {}),
        ...(eventMeta?.vibeTag ? { eventVibeTag: String(eventMeta.vibeTag) } : {}),
        ...(eventMeta?.eventName ? { eventName: String(eventMeta.eventName) } : {}),
      }
    });
    console.log(`✅ FCM sent to user=${uid}, notifId=${notificationId}, msgId=${messageId}`);
  } catch (pushErr) {
    const errCode = pushErr?.code || pushErr?.errorInfo?.code || '';
    if (
      errCode === 'messaging/registration-token-not-registered' ||
      errCode === 'messaging/invalid-registration-token'
    ) {
      await prisma.user.updateMany({
        where: { id: uid },
        data: { fcmToken: null }
      }).catch(() => {});
      console.log(`⚠️ Cleared invalid FCM token for user=${uid} (${errCode})`);
    } else {
      console.error("⚠️ FCM send warning:", errCode, pushErr.message);
    }
  }
}

async function sendUserNotification({ userId, audience = 'USER', title, message, orderId = null, productId = null }) {
  try {
    const safeTitle = String(title || '').slice(0, 140);
    const safeMessage = String(message || '').slice(0, 500);
    if (!safeTitle || !safeMessage) return null;

    const cleanProductId = productId ? Number(productId) : null;
    const cleanOrderId = orderId ? Number(orderId) : null;
    const eventMeta = extractEventMetaFromMessage(safeMessage);

    let productImageUrl = null;
    if (cleanProductId && Number.isInteger(cleanProductId) && cleanProductId > 0) {
      const prod = await prisma.product.findUnique({
        where: { id: cleanProductId },
        select: {
          images: { orderBy: { sortOrder: 'asc' }, take: 1, select: { imageUrl: true } }
        }
      });
      productImageUrl = prod?.images?.[0]?.imageUrl || null;
    }

    if (audience === 'ALL' && (userId === null || userId === undefined)) {
      const users = await prisma.user.findMany({
        select: { id: true, fcmToken: true }
      });

      for (const u of users) {
        const created = await prisma.notification.create({
          data: {
            userId: u.id,
            title: safeTitle,
            message: safeMessage,
            orderId: cleanOrderId,
            productId: cleanProductId,
          }
        });
        if (u.fcmToken) {
          await deliverPushToToken(
            u.id,
            u.fcmToken,
            created.id,
            safeTitle,
            safeMessage,
            cleanOrderId,
            cleanProductId,
            productImageUrl,
            eventMeta
          );
        }
      }
      return { broadcastCount: users.length };
    }

    const cleanUserId = Number(userId);
    if (!Number.isInteger(cleanUserId) || cleanUserId <= 0) return null;

    const notification = await prisma.notification.create({
      data: {
        userId: cleanUserId,
        title: safeTitle,
        message: safeMessage,
        orderId: cleanOrderId,
        productId: cleanProductId,
      }
    });

    const user = await prisma.user.findUnique({
      where: { id: cleanUserId },
      select: { fcmToken: true }
    });

    if (user?.fcmToken) {
      await deliverPushToToken(
        cleanUserId,
        user.fcmToken,
        notification.id,
        safeTitle,
        safeMessage,
        cleanOrderId,
        cleanProductId,
        productImageUrl,
        eventMeta
      );
    }

    return notification;
  } catch (err) {
    console.error("❌ Notification helper error:", err.message);
    return null;
  }
}

// -------------------------------------------------------------
// ⚡ REAL-TIME SOCKET.IO ENGINE (SHOP TOGETHER ROOMS)
// -------------------------------------------------------------
io.on('connection', (socket) => {
  console.log('⚡ User connected to WebSocket:', socket.id);

  socket.on('join_room', ({ roomId, userName }) => {
    const cleanRoomId = typeof roomId === 'string' ? roomId.trim() : '';
    if (!cleanRoomId) return;
    const cleanName = String(userName || 'Guest').slice(0, 60);
    socket.join(cleanRoomId);
    console.log(`👤 ${cleanName} joined room: ${cleanRoomId}`);
    socket.to(cleanRoomId).emit('user_joined', { message: `${cleanName} joined the room` });
  });

  socket.on('add_item_to_room', async ({ roomId, productId, addedBy, assignedUserId = null }) => {
    try {
      const cleanRoomId = typeof roomId === 'string' ? roomId.trim() : '';
      const cleanProductId = Number(productId);
      if (!cleanRoomId || !Number.isInteger(cleanProductId) || cleanProductId <= 0) return;

      const room = await prisma.shoppingRoom.findUnique({
        where: { id: cleanRoomId },
        select: { id: true, isActive: true }
      });
      if (!room || !room.isActive) return;

      const product = await prisma.product.findUnique({
        where: { id: cleanProductId },
        select: { id: true }
      });
      if (!product) return;

      const cleanAssigneeId =
        assignedUserId !== undefined && assignedUserId !== null && assignedUserId !== ''
          ? Number(assignedUserId)
          : null;

      const newItem = await prisma.roomItem.create({
        data: {
          roomId: cleanRoomId,
          productId: cleanProductId,
          addedBy: String(addedBy || 'Member').slice(0, 60),
          assignedUserId: cleanAssigneeId && Number.isInteger(cleanAssigneeId) && cleanAssigneeId > 0 ? cleanAssigneeId : null
        },
        include: {
          product: { include: { images: true, brand: true } },
          assignedUser: {
            select: {
              id: true,
              profile: { select: { name: true } }
            }
          }
        }
      });
      io.to(cleanRoomId).emit('item_added', newItem);
    } catch (err) {
      console.error("❌ Socket Add Item Error:", err);
    }
  });

  socket.on('send_reaction_comment', async ({ roomId, userName, message }) => {
    try {
      const cleanRoomId = typeof roomId === 'string' ? roomId.trim() : '';
      const cleanMessage = typeof message === 'string' ? message.trim().slice(0, 300) : '';
      if (!cleanRoomId || !cleanMessage) return;

      const room = await prisma.shoppingRoom.findUnique({
        where: { id: cleanRoomId },
        select: { id: true, isActive: true }
      });
      if (!room || !room.isActive) return;

      const comment = await prisma.roomComment.create({
        data: {
          roomId: cleanRoomId,
          userName: String(userName || 'Member').slice(0, 60),
          message: cleanMessage
        }
      });
      io.to(cleanRoomId).emit('new_comment', comment);
    } catch (err) {
      console.error("❌ Socket Comment Error:", err);
    }
  });

  socket.on('disconnect', () => {
    console.log('⚡ User disconnected from WebSocket:', socket.id);
  });
});

// -------------------------------------------------------------
// 📦 ROUTE IMPORTS & INITIALIZATION
// -------------------------------------------------------------
let authRoutes, catalogRoutes, retailerRoutes, cartRoutes, addressRoutes, orderRoutes,
    reviewRoutes, vtoRoutes, garmentRoutes, fitRoutes, paymentRoutes, adminRoutes,
    couponRoutes, preferenceRoutes, eventRoutes, roomRoutes;

try {
  authRoutes = require('./routes/auth.routes')(prisma, resend, generateToken);
  catalogRoutes = require('./routes/catalog.routes')(prisma, verifyAdmin, resend);
  retailerRoutes = require('./routes/retailer.routes')(prisma, verifyAdmin);
  cartRoutes = require('./routes/cart.routes')(prisma, verifyAdmin);
  addressRoutes = require('./routes/address.routes')(prisma);

  orderRoutes = require('./routes/order.routes')(prisma, resend, sendUserNotification);
  console.log("✅ Order Routes Loaded Successfully");

  reviewRoutes = require('./routes/review.routes')(prisma);
  garmentRoutes = (() => { const m = require('./routes/garment.routes'); return typeof m === 'function' ? m(prisma) : m; })();
  fitRoutes = (() => { const m = require('./routes/fit.routes'); return typeof m === 'function' ? m(prisma) : m; })();

  const vtoFn = require('./routes/vto.routes');
  vtoRoutes = typeof vtoFn === 'function' ? vtoFn(prisma) : vtoFn;
  console.log("✅ VTO Routes Loaded Successfully");

  paymentRoutes = require('./routes/payment.routes')(prisma, resend);
  console.log("✅ Payment Routes Loaded Successfully");

  const couponFn = require('./routes/coupon.routes');
  couponRoutes = typeof couponFn === 'function' ? couponFn(prisma) : couponFn;
  console.log("✅ Coupon Routes Loaded Successfully");

  const adminFn = require('./routes/admin.routes');
  adminRoutes = typeof adminFn === 'function' ? adminFn(prisma, sendUserNotification) : adminFn;
  console.log("✅ Admin Routes Loaded Successfully");

  // 🚀 3 NEW ADVANCED FEATURE ROUTES
  preferenceRoutes = require('./routes/preference.routes')(prisma);
  eventRoutes = require('./routes/event.routes')(prisma, sendUserNotification);
  roomRoutes = require('./routes/room.routes')(prisma, io);

} catch (e) {
  console.error("❌ Route import error:", e.message, e.stack);
}

// -------------------------------------------------------------
// 🌐 BASE & HEALTH ENDPOINTS
// -------------------------------------------------------------
app.get('/api/legal/privacy', (req, res) => res.json({ title: "Syvora Privacy - DPDP Act", retention: "VTO 1 hour, Logs 180 days" }));
app.get('/api/legal/terms', (req, res) => res.json({ title: "Terms" }));
app.get('/health', (req, res) => res.json({ status: "OK" }));
app.get('/api/health', (req, res) => res.json({ status: "OK", timestamp: new Date(), secured: "40/40" }));
app.get('/', (req, res) => res.send('Syvora API Running Secured 40/40 ✅'));

// -------------------------------------------------------------
// 🔀 ROUTE MOUNTING
// -------------------------------------------------------------
if (authRoutes) app.use('/api/auth', authLimiter, authRoutes);
if (catalogRoutes) app.use('/api', catalogRoutes);
if (retailerRoutes) app.use('/api/retailers', retailerRoutes);
if (cartRoutes) app.use('/api', cartRoutes);
if (addressRoutes) app.use('/api', addressRoutes);
if (orderRoutes) app.use('/api', orderRoutes);
if (reviewRoutes) app.use('/api/reviews', reviewRoutes);
if (vtoRoutes) app.use('/api/vto', vtoLimiter, vtoRoutes);
if (garmentRoutes) app.use('/api/garments', garmentRoutes);
if (fitRoutes) app.use('/api/fit', fitRoutes);
if (paymentRoutes) app.use('/api/payment', paymentRoutes);
if (couponRoutes) app.use('/api/coupon', couponRoutes);
if (adminRoutes) app.use('/api', adminRoutes);

// 🚀 MOUNT 3 NEW FEATURE ROUTES
if (preferenceRoutes) app.use('/api', preferenceRoutes);
if (eventRoutes) app.use('/api', eventRoutes);
if (roomRoutes) app.use('/api', roomRoutes);

app.use((req, res) => res.status(404).json({ error: "Not found" }));
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  if (err.message === 'CORS blocked') return res.status(403).json({ error: 'CORS blocked' });
  if (err.type === 'entity.too.large' || err?.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'Payload or file too large' });
  }
  res.status(500).json({ error: 'Internal error' });
});

// -------------------------------------------------------------
// ⏰ SMART UPCOMING EVENT REMINDER SCHEDULER
// - > 5 days away: every ~36 hrs (har 1.5 din mein 1 baar)
// - <= 5 days away: up to 2 times in that window (min 48 hrs apart)
// -------------------------------------------------------------
async function getMatchedInStockProduct(vibeTag) {
  const cleanTag = String(vibeTag || '').trim();
  const candidates = await prisma.product.findMany({
    where: {
      status: 'ACTIVE',
      isOutOfStock: false,
      stock: { gt: 0 },
      ...(cleanTag
        ? {
            OR: [
              { vibeTag: { equals: cleanTag, mode: 'insensitive' } },
              { occasion: { contains: cleanTag, mode: 'insensitive' } },
              { tags: { has: cleanTag } },
            ],
          }
        : {}),
    },
    include: {
      images: { orderBy: { sortOrder: 'asc' }, take: 1 },
      sizeCharts: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 15,
  });

  return (
    candidates.find((p) => {
      if (!Array.isArray(p.sizeCharts) || p.sizeCharts.length === 0) return true;
      return p.sizeCharts.some((s) => s.inStock !== false && Number(s.stock ?? 0) > 0);
    }) || null
  );
}

function shouldSendEventReminder(ev, now) {
  const eventTime = new Date(ev.eventDate).getTime();
  const nowTime = now.getTime();
  if (Number.isNaN(eventTime) || eventTime <= nowTime) return { send: false };

  const msPerDay = 24 * 60 * 60 * 1000;
  const daysLeft = (eventTime - nowTime) / msPerDay;
  const lastSentTime = ev.lastReminderAt ? new Date(ev.lastReminderAt).getTime() : 0;
  const hoursSinceLast = lastSentTime ? (nowTime - lastSentTime) / (60 * 60 * 1000) : Infinity;

  // 5 din se zyada dur -> har 36 hrs (~1.5 din) mein ek baar
  if (daysLeft > 5) {
    if (hoursSinceLast >= 36) {
      return { send: true, daysLeftCeil: Math.ceil(daysLeft), isUrgent: false };
    }
    return { send: false };
  }

  // 5 din ya usse kam bache -> is duration mein max 2 baar, kam se kam 48 hrs gap ke saath
  const urgentCount = Number(ev.urgentReminderCount || 0);
  if (urgentCount < 2 && hoursSinceLast >= 48) {
    return { send: true, daysLeftCeil: Math.max(1, Math.ceil(daysLeft)), isUrgent: true };
  }

  return { send: false };
}

async function processEventReminders() {
  try {
    const now = new Date();
    const upcomingEvents = await prisma.eventPlanner.findMany({
      where: {
        eventDate: { gt: now },
      },
      take: 100,
    });

    for (const ev of upcomingEvents) {
      const decision = shouldSendEventReminder(ev, now);
      if (!decision.send) continue;

      const matchedProduct = await getMatchedInStockProduct(ev.vibeTag);
      if (!matchedProduct) continue;

      const encodedTag = encodeURIComponent(ev.vibeTag || '');
      const encodedEvent = encodeURIComponent(ev.eventName || '');

      await sendUserNotification({
        userId: ev.userId,
        productId: matchedProduct.id,
        title: matchedProduct.name,
        message: `${decision.daysLeftCeil} ${
          decision.daysLeftCeil === 1 ? 'Day' : 'Days'
        } left for ${ev.eventName}! Check this ${ev.vibeTag} look now. [EVT:${encodedTag}|${encodedEvent}]`,
      });

      const baseUpdate = {
        reminderSent: true,
        lastReminderAt: now,
      };
      if (decision.isUrgent) {
        baseUpdate.urgentReminderCount = Number(ev.urgentReminderCount || 0) + 1;
      }

      try {
        await prisma.eventPlanner.update({
          where: { id: ev.id },
          data: baseUpdate,
        });
      } catch (updateErr) {
        await prisma.eventPlanner.update({
          where: { id: ev.id },
          data: { reminderSent: true },
        }).catch(() => {});
      }
    }
  } catch (err) {
    console.error("⚠️ Event reminder job error:", err.message);
  }
}

// -------------------------------------------------------------
// 🚀 LISTEN ON HTTP SERVER (REQUIRED FOR SOCKET.IO)
// -------------------------------------------------------------
const PORT = process.env.PORT || 5000;
setTimeout(processEventReminders, 30 * 1000);
const eventReminderInterval = setInterval(processEventReminders, 60 * 60 * 1000);
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Syvora Server running on port ${PORT} 40/40 Secured + WebSockets + 3 New Features ✅`);
});

function shutdown(signal) {
  console.log(`Received ${signal}, shutting down gracefully...`);
  clearInterval(eventReminderInterval);
  server.close(async () => {
    try {
      await prisma.$disconnect();
      await pool.end();
    } catch (_) {}
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));