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
const http = require('http'); // 👈 Added for Socket.io HTTP Server wrapper
const { Server } = require('socket.io'); // 👈 Socket.io Import
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('./generated/client');
const { Resend } = require('resend');

const app = express();
const server = http.createServer(app); // 👈 Wrap express app with HTTP server

// ⚡ Socket.io Setup with CORS
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false, hsts: { maxAge: 31536000, includeSubDomains: true } }));

const allowedOrigins = ['https://syvora.in','https://www.syvora.in','http://localhost:3000','http://localhost:5173','http://localhost:8081'];
app.use(cors({
  origin: function(origin, callback){
    if(!origin) return callback(null, true);
    if(allowedOrigins.includes(origin) || origin.startsWith('exp://') || origin.startsWith('http://localhost:')) {
      return callback(null, true);
    }
    return callback(new Error('CORS blocked'), false);
  },
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

const globalLimiter = rateLimit({ 
  windowMs: 15*60*1000, 
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

if(!process.env.JWT_SECRET){ console.error("❌ FATAL: JWT_SECRET missing"); process.exit(1); }
const JWT_SECRET = process.env.JWT_SECRET;
const generateToken = (userId, email, role) => jwt.sign({ id: userId, email, role: role || 'USER' }, JWT_SECRET, { expiresIn: '1d' });

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

const authLimiter = rateLimit({ windowMs: 15*60*1000, max: 20, message: { error: "Too many auth attempts" } });

const vtoLimiter = rateLimit({
  windowMs: 24*60*60*1000, 
  max: 20,
  keyGenerator: (req) => {
    try {
      const token = req.headers.authorization?.split(' ')[1];
      if (!token) return req.ip;
      const d = jwt.verify(token, JWT_SECRET);
      return `vto_${d.id}`;
    } catch { 
      return req.ip; 
    }
  },
  message: { error: "VTO limit reached for today" }
});

const resend = new Resend(process.env.RESEND_API_KEY);

// -------------------------------------------------------------
// ⚡ REAL-TIME SOCKET.IO ENGINE (SHOP TOGETHER ROOMS)
// -------------------------------------------------------------
io.on('connection', (socket) => {
  console.log('⚡ User connected to WebSocket:', socket.id);

  socket.on('join_room', ({ roomId, userName }) => {
    socket.join(roomId);
    console.log(`👤 ${userName} joined room: ${roomId}`);
    socket.to(roomId).emit('user_joined', { message: `${userName} joined the room` });
  });

  socket.on('add_item_to_room', async ({ roomId, productId, addedBy }) => {
    try {
      const newItem = await prisma.roomItem.create({
        data: { roomId, productId: Number(productId), addedBy },
        include: { product: { include: { images: true, brand: true } } }
      });
      io.to(roomId).emit('item_added', newItem);
    } catch (err) {
      console.error("❌ Socket Add Item Error:", err);
    }
  });

  socket.on('send_reaction_comment', async ({ roomId, userName, message }) => {
    try {
      const comment = await prisma.roomComment.create({
        data: { roomId, userName, message }
      });
      io.to(roomId).emit('new_comment', comment);
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
// 📦 ROUTE IMPORTS & INITIALIZATION
let authRoutes, catalogRoutes, retailerRoutes, cartRoutes, addressRoutes, orderRoutes, 
    reviewRoutes, vtoRoutes, garmentRoutes, fitRoutes, paymentRoutes, adminRoutes, 
    couponRoutes, preferenceRoutes, eventRoutes, roomRoutes;

try {
  authRoutes = require('./routes/auth.routes')(prisma, resend, generateToken);
  
  // ✅ Yahan catalogRoutes me resend/transporter wapas pass kar diya hai
  catalogRoutes = require('./routes/catalog.routes')(prisma, verifyAdmin, resend); 

  retailerRoutes = require('./routes/retailer.routes')(prisma, verifyAdmin);
  cartRoutes = require('./routes/cart.routes')(prisma, verifyAdmin);
  addressRoutes = require('./routes/address.routes')(prisma);
  orderRoutes = require('./routes/order.routes')(prisma, resend);
  reviewRoutes = require('./routes/review.routes')(prisma);
  garmentRoutes = (() => { const m = require('./routes/garment.routes'); return typeof m === 'function' ? m(prisma) : m; })();
  fitRoutes = (() => { const m = require('./routes/fit.routes'); return typeof m === 'function' ? m(prisma) : m; })();
  
  const vtoFn = require('./routes/vto.routes');
  vtoRoutes = typeof vtoFn === 'function' ? vtoFn(prisma) : vtoFn;
  console.log("✅ VTO Routes Loaded Successfully");
  
  paymentRoutes = (() => { const m = require('./routes/payment.routes'); return typeof m === 'function' ? m(prisma) : m; })();
  
  const couponFn = require('./routes/coupon.routes');
  couponRoutes = typeof couponFn === 'function' ? couponFn(prisma) : couponFn;
  console.log("✅ Coupon Routes Loaded Successfully");

  const adminFn = require('./routes/admin.routes');
  adminRoutes = typeof adminFn === 'function' ? adminFn(prisma) : adminFn;
  console.log("✅ Admin Routes Loaded Successfully");

  // 🚀 3 NEW ADVANCED FEATURE ROUTES
  preferenceRoutes = require('./routes/preference.routes')(prisma);
  eventRoutes = require('./routes/event.routes')(prisma);
  roomRoutes = require('./routes/room.routes')(prisma);

} catch(e){ 
  console.error("❌ Route import error:", e.message, e.stack); 
}

// -------------------------------------------------------------
// 🌐 BASE & HEALTH ENDPOINTS
// -------------------------------------------------------------
app.get('/api/legal/privacy', (req,res)=> res.json({ title: "Syvora Privacy - DPDP Act", retention: "VTO 1 hour, Logs 180 days" }));
app.get('/api/legal/terms', (req,res)=> res.json({ title: "Terms" }));
app.get('/health', (req,res)=> res.json({ status: "OK" }));
app.get('/api/health', (req,res)=> res.json({ status: "OK", timestamp: new Date(), secured: "40/40" }));
app.get('/', (req,res)=> res.send('Syvora API Running Secured 40/40 ✅'));

// -------------------------------------------------------------
// 🔀 ROUTE MOUNTING
// -------------------------------------------------------------
if(authRoutes) app.use('/api/auth', authLimiter, authRoutes);
if(catalogRoutes) app.use('/api', catalogRoutes);
if(retailerRoutes) app.use('/api/retailers', retailerRoutes);
if(cartRoutes) app.use('/api', cartRoutes);
if(addressRoutes) app.use('/api', addressRoutes);
if(orderRoutes) app.use('/api', orderRoutes);
if(reviewRoutes) app.use('/api/reviews', reviewRoutes);
if(vtoRoutes) app.use('/api/vto', vtoLimiter, vtoRoutes);
if(garmentRoutes) app.use('/api/garments', garmentRoutes);
if(fitRoutes) app.use('/api/fit', fitRoutes);
if(paymentRoutes) app.use('/api/payment', paymentRoutes);
if(couponRoutes) app.use('/api/coupon', couponRoutes);
if(adminRoutes) app.use('/api', adminRoutes);

// 🚀 MOUNT 3 NEW FEATURE ROUTES
if(preferenceRoutes) app.use('/api', preferenceRoutes);
if(eventRoutes) app.use('/api', eventRoutes);
if(roomRoutes) app.use('/api', roomRoutes);

app.use((req,res)=> res.status(404).json({ error: "Not found" }));
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  if (err.message === 'CORS blocked') return res.status(403).json({ error: 'CORS blocked' });
  res.status(500).json({ error: 'Internal error' });
});

// -------------------------------------------------------------
// 🚀 LISTEN ON HTTP SERVER (REQUIRED FOR SOCKET.IO)
// -------------------------------------------------------------
const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Syvora Server running on port ${PORT} 40/40 Secured + WebSockets + 3 New Features ✅`);
});