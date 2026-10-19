// const express = require('express');
// const { Pool } = require('pg');
// const { PrismaPg } = require('@prisma/adapter-pg');
// const { PrismaClient } = require('../generated/client');
// const { checkFit } = require('../services/fitService');

// const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
// const adapter = new PrismaPg(pool);
// const prisma = new PrismaClient({ adapter });

// const router = express.Router();

// // GET /api/fit/measurement/:userId
// router.get('/measurement/:userId', async (req, res) => {
//   try {
//     const m = await prisma.userMeasurement.findUnique({ where: { userId: Number(req.params.userId) } });
//     res.json(m || null);
//   } catch (e) {
//     res.status(500).json({ error: e.message });
//   }
// });

// // POST /api/fit/measurement
// router.post('/measurement', async (req, res) => {
//   try {
//     const { userId, chest, waist, hips, height, weight } = req.body;
//     if (!userId || !chest || !waist || !hips) return res.status(400).json({ error: "userId, chest, waist, hips required" });

//     const data = await prisma.userMeasurement.upsert({
//       where: { userId: Number(userId) },
//       update: { chest: Number(chest), waist: Number(waist), hips: Number(hips), height: height ? Number(height) : null, weight: weight ? Number(weight) : null },
//       create: { userId: Number(userId), chest: Number(chest), waist: Number(waist), hips: Number(hips), height: height ? Number(height) : null, weight: weight ? Number(weight) : null }
//     });
//     res.json(data);
//   } catch (e) {
//     res.status(500).json({ error: e.message });
//   }
// });

// // POST /api/fit/check
// router.post('/check', async (req, res) => {
//   try {
//     const { userId, garmentId, selectedSize } = req.body;
//     if (!userId || !garmentId || !selectedSize) return res.status(400).json({ error: "userId, garmentId, selectedSize required" });

//     const user = await prisma.userMeasurement.findUnique({ where: { userId: Number(userId) } });
//     if (!user) return res.status(404).json({ needMeasurement: true, message: "Size profile banao pehle" });

//     const garment = await prisma.garment.findUnique({ where: { id: Number(garmentId) } });
//     if (!garment) return res.status(404).json({ error: "Garment not found" });

//     const allSizes = await prisma.garmentSizeChart.findMany({ where: { garmentId: Number(garmentId) }, orderBy: { size: 'asc' } });
//     if (!allSizes.length) return res.status(404).json({ error: "Is garment ka size chart nahi hai" });

//     const selected = allSizes.find(s => s.size.toLowerCase() === selectedSize.toLowerCase());
//     if (!selected) return res.status(400).json({ error: "Selected size not found", available: allSizes.map(s => s.size) });

//     const details = checkFit(user, selected, garment.category);

//     // Best size nikalna - CATEGORY WISE + sirf inStock wale me se
//     let bestSize = null;
//     let bestScore = Infinity;
//     const catLower = garment.category.toLowerCase();
//     const isBottomCat = ['jeans','pant','trouser','pant','shorts','skirt'].includes(catLower);

//     for (const gs of allSizes.filter(s => s.inStock)) {
//       const fit = checkFit(user, gs, garment.category);
//       let score;
//       if (isBottomCat) {
//         score = Math.abs(fit.waist.diff) * 2 + Math.abs(fit.hips.diff); // waist main
//       } else {
//         score = Math.abs(fit.chest.diff) * 2; // chest main
//       }
//       if (score < bestScore) { bestScore = score; bestSize = gs.size; }
//     }

//     const bestObj = allSizes.find(s => s.size === bestSize);
    
//     let recommendation = "";
//     if (bestSize === selected.size) {
//       recommendation = isBottomCat 
//         ? `${selected.size} waist pe perfect hai.`
//         : `${selected.size} chest pe perfect hai.`;
//     } else if (bestSize) {
//       if (isBottomCat) {
//         recommendation = `${selected.size} aapko ${details.waist.status === 'Tight' ? 'waist pe tight' : 'waist pe loose'} rahega. ${bestSize} try karo.`;
//       } else {
//         recommendation = `${selected.size} aapko ${details.chest.status === 'Tight' ? 'chest pe tight' : 'chest pe loose'} rahega. ${bestSize} try karo.`;
//       }
//     } else {
//       recommendation = `Available sizes: ${allSizes.filter(s=>s.inStock).map(s=>s.size).join(', ')}`;
//     }

//     if (bestObj && !bestObj.inStock) {
//       recommendation = `Ideal size ${bestSize} hota but wo available nahi hai. Available: ${allSizes.filter(s=>s.inStock).map(s=>s.size).join(', ')}`;
//     }

//     res.json({
//       garmentId: garment.id,
//       category: garment.category,
//       selectedSize: selected.size,
//       fit: details.main.status,
//       details, // chest/waist/hips + type TOP/BOTTOM
//       bestSize,
//       isBestAvailable: bestObj ? bestObj.inStock : false,
//       allSizesAvailable: allSizes.filter(s => s.inStock).map(s => s.size),
//       allSizes: allSizes.map(s => ({ size: s.size, inStock: s.inStock, chest: s.chest, waist: s.waist, hips: s.hips })),
//       recommendation
//     });
//   } catch (e) {
//     console.error(e);
//     res.status(500).json({ error: e.message });
//   }
// });

// // POST /api/fit/garment/:garmentId/size
// router.post('/garment/:garmentId/size', async (req, res) => {
//   try {
//     const { size, chest, waist, hips, length, inStock } = req.body;
//     const garmentId = Number(req.params.garmentId);
//     const data = await prisma.garmentSizeChart.upsert({
//       where: { garmentId_size: { garmentId, size } },
//       update: { chest: Number(chest), waist: Number(waist), hips: Number(hips), length: length ? Number(length) : null, inStock: inStock !== undefined ? Boolean(inStock) : true },
//       create: { garmentId, size, chest: Number(chest), waist: Number(waist), hips: Number(hips), length: length ? Number(length) : null, inStock: inStock !== undefined ? Boolean(inStock) : true }
//     });
//     res.json({ success: true, data });
//   } catch (e) {
//     res.status(500).json({ error: e.message });
//   }
// });

// module.exports = router;



const express = require('express');
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('../generated/client');
const { checkFit } = require('../services/fitService');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const router = express.Router();

const TOP_CATEGORIES = ['tshirt', 'top', 'shirt', 'kurta', 'dress', 'kurti', 'suit'];
const BOTTOM_CATEGORIES = ['jeans', 'pant', 'trouser', 'shorts', 'skirt'];

// GET /api/fit/measurement/:userId
router.get('/measurement/:userId', async (req, res) => {
  try {
    const m = await prisma.userMeasurement.findUnique({ where: { userId: Number(req.params.userId) } });
    res.json(m || null);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/fit/measurement
router.post('/measurement', async (req, res) => {
  try {
    const { userId, chest, waist, hips, height, weight } = req.body;
    if (!userId || !chest || !waist || !hips) return res.status(400).json({ error: "userId, chest, waist, hips required" });
    const data = await prisma.userMeasurement.upsert({
      where: { userId: Number(userId) },
      update: { chest: Number(chest), waist: Number(waist), hips: Number(hips), height: height ? Number(height) : null, weight: weight ? Number(weight) : null },
      create: { userId: Number(userId), chest: Number(chest), waist: Number(waist), hips: Number(hips), height: height ? Number(height) : null, weight: weight ? Number(weight) : null }
    });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/fit/check - MAIN
router.post('/check', async (req, res) => {
  try {
    const { userId, productId, garmentId, selectedSize } = req.body;
    if (!userId || !selectedSize || (!productId && !garmentId)) {
      return res.status(400).json({ error: "userId, selectedSize and productId/garmentId required" });
    }

    const user = await prisma.userMeasurement.findUnique({ where: { userId: Number(userId) } });
    if (!user) return res.status(404).json({ needMeasurement: true, message: "Pehle apni Size Profile banao" });

    let allSizes = [];
    let category = 'Tshirt';
    let productIdNum = null;

    if (productId) {
      productIdNum = Number(productId);
      const product = await prisma.product.findUnique({ 
        where: { id: productIdNum }, 
        include: { category: true, garments: true } 
      });
      if (!product) return res.status(404).json({ error: "Product not found" });
      
      category = product.category.name;
      // Pehle ProductSizeChart check
      allSizes = await prisma.productSizeChart.findMany({ 
        where: { productId: productIdNum }, 
        orderBy: { size: 'asc' } 
      });

      // Agar ProductSizeChart khali hai to GarmentSizeChart fallback
      if (!allSizes.length && product.garments[0]) {
        allSizes = await prisma.garmentSizeChart.findMany({ 
          where: { garmentId: product.garments[0].id }, 
          orderBy: { size: 'asc' } 
        });
      }
    } else {
      const garment = await prisma.garment.findUnique({ where: { id: Number(garmentId) } });
      if (!garment) return res.status(404).json({ error: "Garment not found" });
      category = garment.category;
      productIdNum = garment.productId;
      allSizes = await prisma.garmentSizeChart.findMany({ 
        where: { garmentId: Number(garmentId) }, 
        orderBy: { size: 'asc' } 
      });
    }

    if (!allSizes.length) return res.status(404).json({ error: "Is product ka size chart nahi hai" });

    const selected = allSizes.find(s => s.size.toLowerCase() === selectedSize.toLowerCase());
    if (!selected) return res.status(400).json({ error: "Selected size not found", available: allSizes.map(s => s.size) });

    const details = checkFit(user, selected, category);

    let bestSize = null;
    let bestScore = Infinity;
    const catLower = category.toLowerCase();
    const isBottomCat = BOTTOM_CATEGORIES.includes(catLower);

    for (const gs of allSizes.filter(s => s.inStock)) {
      const fit = checkFit(user, gs, category);
      let score;
      if (isBottomCat) {
        score = Math.abs(fit.waist.diff) * 2 + Math.abs(fit.hips.diff);
      } else {
        score = Math.abs(fit.chest.diff) * 2 + Math.abs(fit.waist.diff);
      }
      if (score < bestScore) { bestScore = score; bestSize = gs.size; }
    }

    const bestObj = allSizes.find(s => s.size === bestSize);
    
    let recommendation = "";
    if (bestSize === selected.size) {
      recommendation = `${selected.size} aapke liye perfect fit hai.`;
    } else if (bestSize) {
      recommendation = `${selected.size} aapko ${details.main.status} rahega. ${bestSize} try karo.`;
    } else {
      recommendation = `Available: ${allSizes.filter(s=>s.inStock).map(s=>s.size).join(', ')}`;
    }

    res.json({
      productId: productIdNum,
      category,
      selectedSize: selected.size,
      fit: details.main.status,
      details,
      bestSize,
      isBestAvailable: bestObj ? bestObj.inStock : false,
      allSizesAvailable: allSizes.filter(s => s.inStock).map(s => s.size),
      allSizes: allSizes.map(s => ({ size: s.size, inStock: s.inStock, chest: s.chest, waist: s.waist, hips: s.hips, length: s.length, shoulder: s.shoulder || null })),
      recommendation
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;