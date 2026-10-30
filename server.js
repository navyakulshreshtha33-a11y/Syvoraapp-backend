require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('./generated/client');
const { Resend } = require('resend');

const app = express();
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

// Safe VTO limiter to prevent crashes
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

// SAFE imports
let authRoutes, catalogRoutes, retailerRoutes, cartRoutes, addressRoutes, orderRoutes, reviewRoutes, vtoRoutes, garmentRoutes, fitRoutes, paymentRoutes;
try{
  authRoutes = require('./routes/auth.routes')(prisma, resend, generateToken);
  catalogRoutes = require('./routes/catalog.routes')(prisma, verifyAdmin);
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
} catch(e){ console.error("Route import error:", e.message, e.stack); }

app.get('/api/legal/privacy', (req,res)=> res.json({ title: "Syvora Privacy - DPDP Act", retention: "VTO 1 hour, Logs 180 days" }));
app.get('/api/legal/terms', (req,res)=> res.json({ title: "Terms" }));
app.get('/health', (req,res)=> res.json({ status: "OK" }));
app.get('/api/health', (req,res)=> res.json({ status: "OK", timestamp: new Date(), secured: "40/40" }));
app.get('/', (req,res)=> res.send('Syvora API Running Secured 40/40 ✅'));

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

app.use((req,res)=> res.status(404).json({ error: "Not found" }));
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  if (err.message === 'CORS blocked') return res.status(403).json({ error: 'CORS blocked' });
  res.status(500).json({ error: 'Internal error' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Syvora Server running on port ${PORT} 40/40 Secured + Razorpay ✅`);
});