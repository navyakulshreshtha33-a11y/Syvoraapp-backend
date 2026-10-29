const express = require('express');
const multer = require('multer');
const jwt = require('jsonwebtoken');
const cloudinary = require('../services/cloudinary');
const { fileTypeFromBuffer } = require('file-type');
const { z } = require('zod');

module.exports = (prisma) => {
  const router = express.Router();

  const upload = multer({ 
    storage: multer.memoryStorage(), 
    limits: { fileSize: 8 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      if (!file.mimetype.startsWith('image/')) {
        cb(new Error('Only images allowed'), false);
      } else cb(null, true);
    }
  });

  const VTO_BLOCKED_CATEGORIES = ['lingerie', 'bikini', 'bra', 'panty', 'innerwear'];

  const verifyAdmin = (req, res, next) => {
    try {
      const token = req.headers.authorization?.split(' ')[1];
      if (!token) return res.status(401).json({ error: 'Token required' });
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      if (decoded.role !== 'ADMIN') return res.status(403).json({ error: 'Admin only' });
      req.user = decoded;
      next();
    } catch (e) { return res.status(401).json({ error: 'Invalid token' }); }
  };

  const garmentSchema = z.object({
    brandId: z.string().optional(),
    name: z.string().min(2).max(100).optional(),
    category: z.string().min(2).max(50).optional(),
    productId: z.string().optional(),
  });

  router.post('/', verifyAdmin, upload.single('garmentPhoto'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "garmentPhoto chahiye" });

    try {
      const type = await fileTypeFromBuffer(req.file.buffer);
      if (!type || !['image/jpeg','image/png','image/webp','image/jpg'].includes(type.mime)) {
        req.file.buffer.fill(0);
        return res.status(400).json({ error: 'Invalid file type - only jpeg/png/webp allowed' });
      }

      const parsed = garmentSchema.parse(req.body);
      const catLower = (parsed.category || 'Top').toLowerCase().trim().replace(/[^a-z]/g,'');
      const isVtoAllowed = !VTO_BLOCKED_CATEGORIES.includes(catLower);

      const safePublicId = `syvora_garment_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      const uploadRes = await new Promise((resolve, reject) => {
        cloudinary.uploader.upload_stream(
          { folder: 'syvora/garments', public_id: safePublicId, resource_type: 'image' },
          (err, result) => err ? reject(err) : resolve(result)
        ).end(req.file.buffer);
      });

      const garment = await prisma.garment.create({
        data: {
          brandId: parsed.brandId ? parseInt(parsed.brandId) : 1,
          name: parsed.name || 'Garment',
          category: catLower || 'kurti',
          imageUrl: uploadRes.secure_url,
          cloudinaryPublicId: uploadRes.public_id,
          productId: parsed.productId ? parseInt(parsed.productId) : null
        }
      });

      req.file.buffer.fill(0);

      await prisma.dataAccessLog.create({
        data: { actorId: req.user.id, targetUserId: req.user.id, purpose: 'GARMENT_UPLOAD', ip: req.ip }
      }).catch(()=>{});

      res.json({
        success: true,
        garment,
        vtoAvailable: isVtoAllowed,
        message: isVtoAllowed ? "Garment uploaded successfully" : "Garment uploaded but VTO disabled for this category"
      });
    } catch (e) {
      if (req.file?.buffer) req.file.buffer.fill(0);
      if (e.name === 'ZodError') return res.status(400).json({ error: 'Invalid input' });
      console.log("[GARMENT UPLOAD ERROR]:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  router.get('/', async (req, res) => {
    try {
      const garments = await prisma.garment.findMany({
        orderBy: { id: 'desc' },
        include: {
          sizeCharts: true,
          product: { select: { isOutOfStock: true, stock: true } }
        }
      });

      const garmentsWithFlags = garments.map(g => {
        const availableSizes = g.sizeCharts.filter(sc => sc.inStock);
        const allOut = g.sizeCharts.length > 0 && availableSizes.length === 0;
        return {
          ...g,
          vtoAvailable: !VTO_BLOCKED_CATEGORIES.includes((g.category || '').toLowerCase()),
          isOutOfStock: allOut || g.product?.isOutOfStock || false,
          totalAvailableSizes: availableSizes.length,
          allSizesOutOfStock: allOut
        };
      });
      res.json(garmentsWithFlags);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get('/:id', async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' });
      
      const garment = await prisma.garment.findUnique({
        where: { id },
        include: { sizeCharts: true, product: true, brand: true }
      });
      if (!garment) return res.status(404).json({ error: "Garment not found" });
      const availableSizes = garment.sizeCharts.filter(sc => sc.inStock);
      res.json({
        ...garment,
        vtoAvailable: !VTO_BLOCKED_CATEGORIES.includes((garment.category || '').toLowerCase()),
        isOutOfStock: garment.sizeCharts.length > 0 && availableSizes.length === 0,
        totalAvailableSizes: availableSizes.length
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.patch('/:id/size/:size/stock', verifyAdmin, async (req, res) => {
    try {
      const garmentId = Number(req.params.id);
      const sizeLabel = String(req.params.size).trim().slice(0,20);
      if (!Number.isFinite(garmentId)) return res.status(400).json({ error: 'Invalid garmentId' });
      
      const { inStock } = req.body;
      const updated = await prisma.garmentSizeChart.update({
        where: { garmentId_size: { garmentId, size: sizeLabel } },
        data: { inStock: Boolean(inStock) }
      });
      res.json({ message: `Size ${sizeLabel} ${inStock ? 'In Stock' : 'Out of Stock'}`, data: updated });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  return router;
};