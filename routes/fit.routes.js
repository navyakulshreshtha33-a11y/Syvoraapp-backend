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

// All Garment Categories from schema.prisma
const GarmentCategory = {
  Tshirt: 'Tshirt',
  Top: 'Top',
  Shirt: 'Shirt',
  Kurta: 'Kurta',
  Dress: 'Dress',
  Jeans: 'Jeans',
  Pant: 'Pant',
  Trouser: 'Trouser',
  Shorts: 'Shorts',
  Skirt: 'Skirt',
  Kurti: 'Kurti',
  Suit: 'Suit'
};

// Top Wear vs Bottom Wear mapping
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

// POST /api/fit/check - MAIN FIT CHECK FOR ALL PRODUCTS
router.post('/check', async (req, res) => {
  try {
    const { userId, garmentId, selectedSize } = req.body;
    if (!userId || !garmentId || !selectedSize) return res.status(400).json({ error: "userId, garmentId, selectedSize required" });

    const user = await prisma.userMeasurement.findUnique({ where: { userId: Number(userId) } });
    if (!user) return res.status(404).json({ needMeasurement: true, message: "Size profile banao pehle" });

    const garment = await prisma.garment.findUnique({ where: { id: Number(garmentId) } });
    if (!garment) return res.status(404).json({ error: "Garment not found" });

    const allSizes = await prisma.garmentSizeChart.findMany({ where: { garmentId: Number(garmentId) }, orderBy: { size: 'asc' } });
    if (!allSizes.length) return res.status(404).json({ error: "Is garment ka size chart nahi hai" });

    const selected = allSizes.find(s => s.size.toLowerCase() === selectedSize.toLowerCase());
    if (!selected) return res.status(400).json({ error: "Selected size not found", available: allSizes.map(s => s.size) });

    const details = checkFit(user, selected, garment.category);

    // Best size nikalna - CATEGORY WISE
    let bestSize = null;
    let bestScore = Infinity;
    const catLower = garment.category.toLowerCase();
    const isBottomCat = BOTTOM_CATEGORIES.includes(catLower);
    const isTopCat = TOP_CATEGORIES.includes(catLower);

    for (const gs of allSizes.filter(s => s.inStock)) {
      const fit = checkFit(user, gs, garment.category);
      let score;
      if (isBottomCat) {
        // Bottom wear: Waist + Hips important
        score = Math.abs(fit.waist.diff) * 2 + Math.abs(fit.hips.diff);
      } else {
        // Top wear, Dress, Kurta, Kurti, Suit: Chest important
        score = Math.abs(fit.chest.diff) * 2 + Math.abs(fit.waist.diff) * 0.5;
      }
      if (score < bestScore) { bestScore = score; bestSize = gs.size; }
    }

    const bestObj = allSizes.find(s => s.size === bestSize);
    
    let recommendation = "";
    if (bestSize === selected.size) {
      if (isBottomCat) {
        recommendation = `${selected.size} waist pe perfect hai.`;
      } else if (catLower === 'dress' || catLower === 'kurta' || catLower === 'kurti' || catLower === 'suit') {
        recommendation = `${selected.size} aapke liye perfect fit hai (chest & length).`;
      } else {
        recommendation = `${selected.size} chest pe perfect hai.`;
      }
    } else if (bestSize) {
      if (isBottomCat) {
        recommendation = `${selected.size} aapko ${details.waist.status === 'Tight' ? 'waist pe tight' : 'waist pe loose'} rahega. ${bestSize} try karo.`;
      } else {
        recommendation = `${selected.size} aapko ${details.chest.status === 'Tight' ? 'chest pe tight' : 'chest pe loose'} rahega. ${bestSize} try karo.`;
      }
    } else {
      recommendation = `Available sizes: ${allSizes.filter(s=>s.inStock).map(s=>s.size).join(', ')}`;
    }

    if (bestObj && !bestObj.inStock) {
      recommendation = `Ideal size ${bestSize} hota but wo available nahi hai. Available: ${allSizes.filter(s=>s.inStock).map(s=>s.size).join(', ')}`;
    }

    res.json({
      garmentId: garment.id,
      category: garment.category,
      productId: garment.productId,
      selectedSize: selected.size,
      fit: details.main.status,
      details,
      bestSize,
      isBestAvailable: bestObj ? bestObj.inStock : false,
      allSizesAvailable: allSizes.filter(s => s.inStock).map(s => s.size),
      allSizes: allSizes.map(s => ({ size: s.size, inStock: s.inStock, chest: s.chest, waist: s.waist, hips: s.hips, length: s.length })),
      recommendation
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/fit/garment/:garmentId/size - ADD/UPDATE SIZE FOR ANY GARMENT CATEGORY
router.post('/garment/:garmentId/size', async (req, res) => {
  try {
    const { size, chest, waist, hips, length, inStock } = req.body;
    if (!size || chest === undefined || waist === undefined || hips === undefined) {
      return res.status(400).json({ error: "size, chest, waist, hips required" });
    }
    const garmentId = Number(req.params.garmentId);
    const data = await prisma.garmentSizeChart.upsert({
      where: { garmentId_size: { garmentId, size } },
      update: { chest: Number(chest), waist: Number(waist), hips: Number(hips), length: length ? Number(length) : null, inStock: inStock !== undefined ? Boolean(inStock) : true },
      create: { garmentId, size, chest: Number(chest), waist: Number(waist), hips: Number(hips), length: length ? Number(length) : null, inStock: inStock !== undefined ? Boolean(inStock) : true }
    });
    res.json({ success: true, category: GarmentCategory, data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/fit/garments - GET ALL GARMENTS WITH ALL CATEGORIES
router.get('/garments', async (req, res) => {
  try {
    const garments = await prisma.garment.findMany({
      include: { sizeCharts: true, brand: true, product: true },
      orderBy: { id: 'desc' }
    });
    res.json(garments);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/fit/categories - GET ALL AVAILABLE CATEGORIES
router.get('/categories', async (req, res) => {
  res.json(Object.values(GarmentCategory));
});

module.exports = router;