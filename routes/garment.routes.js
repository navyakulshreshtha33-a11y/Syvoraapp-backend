// const express = require('express');
// const multer = require('multer');
// const cloudinary = require('../services/cloudinary');
// const { Pool } = require('pg');
// const { PrismaPg } = require('@prisma/adapter-pg');
// const { PrismaClient } = require('../generated/client');

// const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
// const adapter = new PrismaPg(pool);
// const prisma = new PrismaClient({ adapter });

// const router = express.Router();
// const upload = multer({ storage: multer.memoryStorage() });

// const VTO_BLOCKED_CATEGORIES = ['lingerie', 'saree', 'sari', 'lehenga', 'bikini', 'bra', 'panty', 'innerwear'];

// // POST /api/garments - Admin upload
// router.post('/', upload.single('garmentPhoto'), async (req, res) => {
//   const { brandId, name, category, productId } = req.body;
//   if (!req.file) return res.status(400).json({ error: "garmentPhoto chahiye" });

//   try {
//     const catLower = (category || 'Top').toLowerCase();
//     const isVtoAllowed =!VTO_BLOCKED_CATEGORIES.includes(catLower);

//     const uploadRes = await new Promise((resolve, reject) => {
//       cloudinary.uploader.upload_stream(
//         { folder: 'syvora/garments', resource_type: 'image' },
//         (err, result) => err? reject(err) : resolve(result)
//       ).end(req.file.buffer);
//     });

//     const garment = await prisma.garment.create({
//       data: {
//         brandId: parseInt(brandId),
//         name,
//         category: category || 'Top',
//         imageUrl: uploadRes.secure_url,
//         cloudinaryPublicId: uploadRes.public_id,
//         productId: productId? parseInt(productId) : null
//       }
//     });

//     res.json({
//       success: true,
//       garment,
//       vtoAvailable: isVtoAllowed,
//       message: isVtoAllowed? "Garment uploaded with VTO" : "Garment uploaded but VTO disabled for this category"
//     });
//   } catch (e) {
//     res.status(500).json({ error: e.message });
//   }
// });

// // GET /api/garments - Frontend list (with vto flag + stock flag)
// router.get('/', async (req, res) => {
//   try {
//     const garments = await prisma.garment.findMany({
//       orderBy: { id: 'desc' },
//       include: {
//         sizeCharts: true,
//         product: { select: { isOutOfStock: true, stock: true } }
//       }
//     });

//     const garmentsWithFlags = garments.map(g => {
//       const availableSizes = g.sizeCharts.filter(sc => sc.inStock);
//       const allOut = g.sizeCharts.length > 0 && availableSizes.length === 0;

//       return {
//        ...g,
//         vtoAvailable:!VTO_BLOCKED_CATEGORIES.includes((g.category || '').toLowerCase()),
//         isOutOfStock: allOut || g.product?.isOutOfStock || false,
//         totalAvailableSizes: availableSizes.length,
//         allSizesOutOfStock: allOut
//       };
//     });

//     res.json(garmentsWithFlags);
//   } catch (e) {
//     res.status(500).json({ error: e.message });
//   }
// });

// // GET /api/garments/:id - Single with stock
// router.get('/:id', async (req, res) => {
//   try {
//     const garment = await prisma.garment.findUnique({
//       where: { id: Number(req.params.id) },
//       include: { sizeCharts: true, product: true, brand: true }
//     });
//     if (!garment) return res.status(404).json({ error: "Garment not found" });

//     const availableSizes = garment.sizeCharts.filter(sc => sc.inStock);

//     res.json({
//      ...garment,
//       vtoAvailable:!VTO_BLOCKED_CATEGORIES.includes((garment.category || '').toLowerCase()),
//       isOutOfStock: garment.sizeCharts.length > 0 && availableSizes.length === 0,
//       totalAvailableSizes: availableSizes.length
//     });
//   } catch (e) {
//     res.status(500).json({ error: e.message });
//   }
// });

// // PATCH /api/garments/:id/size/:size/stock - Single size toggle
// router.patch('/:id/size/:size/stock', async (req, res) => {
//   try {
//     const garmentId = Number(req.params.id);
//     const sizeLabel = req.params.size;
//     const { inStock } = req.body;

//     const updated = await prisma.garmentSizeChart.update({
//       where: { garmentId_size: { garmentId, size: sizeLabel } },
//       data: { inStock: Boolean(inStock) }
//     });

//     res.json({ message: `Size ${sizeLabel} ${inStock? 'In Stock' : 'Out of Stock'}`, data: updated });
//   } catch (e) {
//     res.status(500).json({ error: e.message });
//   }
// });

// module.exports = router;


const express = require('express');
const multer = require('multer');
const cloudinary = require('../services/cloudinary');
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('../generated/client');
const { cleanGarmentBuffer } = require('../services/garmentCleaner');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

// FIX: Sirf innerwear block hai, kurti/lehenga/saree sab VTO me allow hai
const VTO_BLOCKED_CATEGORIES = ['lingerie', 'bikini', 'bra', 'panty', 'innerwear'];

// POST /api/garments - Admin upload (auto white bg)
router.post('/', upload.single('garmentPhoto'), async (req, res) => {
  const { brandId, name, category, productId } = req.body;
  if (!req.file) return res.status(400).json({ error: "garmentPhoto chahiye" });

  try {
    const catLower = (category || 'Top').toLowerCase();
    const isVtoAllowed = !VTO_BLOCKED_CATEGORIES.includes(catLower);

    // Step 1: Auto clean - white background
    const finalBuffer = await cleanGarmentBuffer(req.file.buffer);

    // Step 2: Cloudinary upload
    const uploadRes = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        { folder: 'syvora/garments', resource_type: 'image' },
        (err, result) => err ? reject(err) : resolve(result)
      ).end(finalBuffer);
    });

    const garment = await prisma.garment.create({
      data: {
        brandId: brandId ? parseInt(brandId) : 1,
        name: name || 'Garment',
        category: category || 'kurti',
        imageUrl: uploadRes.secure_url,
        cloudinaryPublicId: uploadRes.public_id,
        productId: productId ? parseInt(productId) : null
      }
    });

    res.json({
      success: true,
      garment,
      vtoAvailable: isVtoAllowed,
      cleaned: finalBuffer.length !== req.file.buffer.length,
      message: isVtoAllowed ? "Garment uploaded with auto-clean" : "Garment uploaded but VTO disabled for this category"
    });
  } catch (e) {
    console.log("[GARMENT UPLOAD ERROR]:", e);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/garments - Frontend list
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

// GET /api/garments/:id
router.get('/:id', async (req, res) => {
  try {
    const garment = await prisma.garment.findUnique({
      where: { id: Number(req.params.id) },
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

// PATCH size stock toggle
router.patch('/:id/size/:size/stock', async (req, res) => {
  try {
    const garmentId = Number(req.params.id);
    const sizeLabel = req.params.size;
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

module.exports = router;