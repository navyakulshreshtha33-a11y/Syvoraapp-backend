require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('./generated/client');
const { startCleanupCron } = require('./services/cleanupCron');
const { Resend } = require('resend');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const pool = new Pool({ 
 connectionString: process.env.DATABASE_URL,
 ssl: { rejectUnauthorized: false }
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const JWT_SECRET = process.env.JWT_SECRET || 'syvora_jwt_secret_2026';
const generateToken = (userId, email) => {
  return jwt.sign({ userId, email }, JWT_SECRET, { expiresIn: '7d' });
};

const verifyAdmin = async (req, res, next) => {
  try {
    const userId = req.headers['user-id'] || req.body.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const user = await prisma.user.findUnique({ where: { id: Number(userId) } });
    if (!user || user.role !== 'ADMIN') {
      return res.status(403).json({ error: "Access denied. Admins only!" });
    }
    next();
  } catch (error) {
    res.status(500).json({ error: "Internal Server Error" });
  }
};

const resend = new Resend(process.env.RESEND_API_KEY);
console.log("✅ Email Service: Resend Ready");

const authRoutes = require('./routes/auth.routes')(prisma, resend, generateToken);
const catalogRoutes = require('./routes/catalog.routes')(prisma, verifyAdmin);
const retailerRoutes = require('./routes/retailer.routes')(prisma, verifyAdmin);
const cartRoutes = require('./routes/cart.routes')(prisma, verifyAdmin);
const addressRoutes = require('./routes/address.routes')(prisma);
const orderRoutes = require('./routes/order.routes')(prisma, resend);
const reviewRoutes = require('./routes/review.routes')(prisma);
const vtoRoutes = require('./routes/vto.routes');
const garmentRoutes = require('./routes/garment.routes');
const fitRoutes = require('./routes/fit.routes')(prisma);

app.use('/api/auth', authRoutes);
app.use('/api', catalogRoutes);
app.use('/api/retailers', retailerRoutes);
app.use('/api', cartRoutes);
app.use('/api', addressRoutes);
app.use('/api', orderRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/vto', vtoRoutes);
app.use('/api/garments', garmentRoutes);
app.use('/api/fit', fitRoutes);

// Health
app.get('/health', (req, res) => res.json({ status: "OK" }));
app.get('/api/health', (req, res) => res.json({ status: "OK", timestamp: new Date() }));
app.get('/', (req,res)=> res.send('Syvora API Running'));

startCleanupCron();

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Syvora Server running on port ${PORT}`);
}); 