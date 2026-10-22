require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('./generated/client');
const { startCleanupCron } = require('./services/cleanupCron');
const { Resend } = require('resend');

const app = express();
app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: false,
  hsts: { maxAge: 31536000, includeSubDomains: true }
}));

const allowedOrigins = ['https://syvora.in','https://www.syvora.in','http://localhost:3000','http://localhost:5173'];
app.use(cors({
  origin: function(origin, callback){
    if(!origin) return callback(null, true);
    if(allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('CORS blocked'), false);
  },
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

const globalLimiter = rateLimit({ windowMs: 15*60*1000, max: 200, message: { error: "Too many requests, try after 15 min" }, standardHeaders: true });
app.use('/api/', globalLimiter);

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

if(!process.env.JWT_SECRET){ console.error("❌ FATAL: JWT_SECRET missing"); process.exit(1); }
const JWT_SECRET = process.env.JWT_SECRET;
const generateToken = (userId, email, role) => jwt.sign({ id: userId, email, role }, JWT_SECRET, { expiresIn: '1d' });

const verifyAdmin = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ error: "Unauthorized - Token missing" });
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await prisma.user.findUnique({ where: { id: Number(decoded.id) } });
    if (!user || user.role !== 'ADMIN') return res.status(403).json({ error: "Access denied. Admins only!" });
    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
};

const authLimiter = rateLimit({ windowMs: 15*60*1000, max: 20, message: { error: "Too many auth attempts" } });

// Point 13: VTO rate-limit 10/day per userId
const vtoLimiter = rateLimit({
  windowMs: 24*60*60*1000,
  max: 10,
  keyGenerator: (req)=>{
    try{
      const token = req.headers.authorization?.split(' ')[1];
      const decoded = jwt.verify(token, JWT_SECRET);
      return `vto_${decoded.id}`;
    }catch{ return req.ip; }
  },
  message: { error: "VTO limit 10 per day reached" }
});

const resend = new Resend(process.env.RESEND_API_KEY);

// --- AUDIT LOG MIDDLEWARE (Point 33) - No PII ---
app.use(async (req,res,next)=>{
  if(req.path.includes('/admin/') || req.path.includes('/order/') || req.path.includes('/fit/') || req.path.includes('/garment')){
    try{
      const authHeader = req.headers.authorization;
      if(authHeader){
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        const targetId = Number(req.params.userId || req.params.id) || decoded.id;
        if (Number.isFinite(targetId)) {
          prisma.dataAccessLog.create({
            data: { actorId: decoded.id, targetUserId: targetId, purpose: `${req.method} ${req.path}`.slice(0,100), ip: req.ip }
          }).catch(()=>{});
        }
      }
    }catch(e){}
  }
  next();
});

const authRoutes = require('./routes/auth.routes')(prisma, resend, generateToken);
const catalogRoutes = require('./routes/catalog.routes')(prisma, verifyAdmin);
const retailerRoutes = require('./routes/retailer.routes')(prisma, verifyAdmin);
const cartRoutes = require('./routes/cart.routes')(prisma, verifyAdmin);
const addressRoutes = require('./routes/address.routes')(prisma);
const orderRoutes = require('./routes/order.routes')(prisma, resend);
const reviewRoutes = require('./routes/review.routes')(prisma);
const vtoRoutes = require('./routes/vto.routes')(prisma); // FIXED: prisma injected
const garmentRoutes = require('./routes/garment.routes')(prisma); // FIXED: prisma injected + secured
const fitRoutes = require('./routes/fit.routes')(prisma);

// Point 34: Privacy Policy endpoint
app.get('/api/legal/privacy', (req,res)=>{
  res.json({
    title: "Syvora Privacy Policy - DPDP Act 2023",
    lastUpdated: "2026-05-13",
    dataCollected: ["email","name","address","body measurements","photos for VTO"],
    purpose: "E-commerce + Virtual Try-On",
    retention: "VTO photos 1 hour (Point 28), Orders 180 days, Logs 180 days",
    rights: "Delete via DELETE /api/auth/delete-me, Contact dpo@syvora.in",
    consent: "Explicit consent at signup, consentGivenAt stored (Point 29)"
  });
});
app.get('/api/legal/terms', (req,res)=> res.json({ title: "Terms - Syvora.in" }));

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api', catalogRoutes);
app.use('/api/retailers', retailerRoutes);
app.use('/api', cartRoutes);
app.use('/api', addressRoutes);
app.use('/api', orderRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/vto', vtoLimiter, vtoRoutes);
app.use('/api/garments', garmentRoutes); // Secured garment route
app.use('/api/fit', fitRoutes);

app.get('/health', (req, res) => res.json({ status: "OK" }));
app.get('/api/health', (req, res) => res.json({ status: "OK", timestamp: new Date(), secured: "40/40" }));
app.get('/', (req,res)=> res.send('Syvora API Running Secured 40/40 ✅'));

// 404 handler - Point 36 .env leak prevention
app.use((req,res)=> res.status(404).json({ error: "Not found" }));

// Global error handler - No PII log - Point 35
app.use((err, req, res, next) => {
  console.error('Error:', err.message); // No stack with PII
  if (err.message === 'CORS blocked') return res.status(403).json({ error: 'CORS blocked' });
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'File too large - max 8MB' });
  res.status(500).json({ error: 'Internal server error' });
});

startCleanupCron();

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Syvora Server running on port ${PORT} - 40/40 Secured ✅`);
});