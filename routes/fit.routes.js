

// const express = require('express');
// const { checkFit } = require('../services/fitService');

// const TOP_CATEGORIES = ['tshirt', 'top', 'shirt', 'kurta', 'dress', 'kurti', 'suit'];
// const BOTTOM_CATEGORIES = ['jeans', 'pant', 'trouser', 'shorts', 'skirt'];

// module.exports = (prisma) => {
//   const router = express.Router();

//   router.get('/garments', async (req, res) => {
//     try {
//       const garments = await prisma.garment.findMany({ orderBy: { id: 'desc' }, include: { product: true } });
//       if (!garments || garments.length === 0) {
//         const products = await prisma.product.findMany({ take: 50, orderBy: { id: 'desc' }, include: { category: true } });
//         const fallback = products.map(p => ({
//           id: p.id, name: p.name, category: p.category?.name || 'kurti',
//           imageUrl: p.imageUrl || p.images?.[0]?.url || p.images?.[0] || null,
//           productId: p.id, product: { id: p.id }, vtoAvailable: true
//         })).filter(g => g.imageUrl);
//         return res.json(fallback);
//       }
//       res.json(garments.map(g => ({ ...g, vtoAvailable: true, productId: g.productId || g.product?.id || g.id })));
//     } catch (e) { res.status(500).json({ error: e.message }); }
//   });

//   router.get('/measurement/:userId', async (req, res) => {
//     try { const m = await prisma.userMeasurement.findUnique({ where: { userId: Number(req.params.userId) } }); res.json(m || null); }
//     catch (e) { res.status(500).json({ error: e.message }); }
//   });

//   router.post('/measurement', async (req, res) => {
//     try {
//       const { userId, chest, shoulder, length, waist, hips, thigh, inseam, height, weight } = req.body;
//       if (!userId) return res.status(400).json({ error: "userId required" });
//       const data = await prisma.userMeasurement.upsert({
//         where: { userId: Number(userId) },
//         update: { chest: chest ? Number(chest) : null, shoulder: shoulder ? Number(shoulder) : null, length: length ? Number(length) : null, waist: waist ? Number(waist) : null, hips: hips ? Number(hips) : null, thigh: thigh ? Number(thigh) : null, inseam: inseam ? Number(inseam) : null, height: height ? Number(height) : null, weight: weight ? Number(weight) : null },
//         create: { userId: Number(userId), chest: chest ? Number(chest) : null, shoulder: shoulder ? Number(shoulder) : null, length: length ? Number(length) : null, waist: waist ? Number(waist) : null, hips: hips ? Number(hips) : null, thigh: thigh ? Number(thigh) : null, inseam: inseam ? Number(inseam) : null, height: height ? Number(height) : null, weight: weight ? Number(weight) : null }
//       });
//       res.json(data);
//     } catch (e) { res.status(500).json({ error: e.message }); }
//   });

//   router.post('/check', async (req, res) => {
//     try {
//       const { userId, productId, garmentId, selectedSize } = req.body;
//       if (!userId || !selectedSize || (!productId && !garmentId)) return res.status(400).json({ error: "userId, selectedSize and productId/garmentId required" });
//       const user = await prisma.userMeasurement.findUnique({ where: { userId: Number(userId) } });
//       if (!user) return res.status(404).json({ needMeasurement: true, message: "Pehle apni Size Profile banao" });
//       let allSizes = []; let category = 'Tshirt'; let productIdNum = null;
//       if (productId) {
//         productIdNum = Number(productId);
//         const product = await prisma.product.findUnique({ where: { id: productIdNum }, include: { category: true, garments: true } });
//         if (!product) return res.status(404).json({ error: "Product not found" });
//         category = product.category.name;
//         allSizes = await prisma.productSizeChart.findMany({ where: { productId: productIdNum }, orderBy: { size: 'asc' } });
//         if (!allSizes.length && product.garments[0]) allSizes = await prisma.garmentSizeChart.findMany({ where: { garmentId: product.garments[0].id }, orderBy: { size: 'asc' } });
//       } else {
//         const garment = await prisma.garment.findUnique({ where: { id: Number(garmentId) } });
//         if (!garment) return res.status(404).json({ error: "Garment not found" });
//         category = garment.category; productIdNum = garment.productId;
//         allSizes = await prisma.garmentSizeChart.findMany({ where: { garmentId: Number(garmentId) }, orderBy: { size: 'asc' } });
//       }
//       if (!allSizes.length) return res.status(404).json({ error: "Is product ka size chart nahi hai" });
//       const selected = allSizes.find(s => s.size.toLowerCase() === selectedSize.toLowerCase());
//       if (!selected) return res.status(400).json({ error: "Selected size not found" });
//       const details = checkFit(user, selected, category);
//       let bestSize = null; let bestScore = Infinity; const isBottomCat = BOTTOM_CATEGORIES.includes(category.toLowerCase());
//       for (const gs of allSizes.filter(s => s.inStock)) {
//         const fit = checkFit(user, gs, category);
//         let score = isBottomCat ? Math.abs(fit.waist.diff || 0) * 2 + Math.abs(fit.hips.diff || 0) + Math.abs(fit.thigh?.diff || 0) : Math.abs(fit.chest.diff || 0) * 2 + Math.abs(fit.waist.diff || 0) + Math.abs(fit.shoulder?.diff || 0);
//         if (score < bestScore) { bestScore = score; bestSize = gs.size; }
//       }
//       const bestObj = allSizes.find(s => s.size === bestSize);
//       res.json({ productId: productIdNum, category, selectedSize: selected.size, fit: details.main.status, details, bestSize, isBestAvailable: bestObj ? bestObj.inStock : false, allSizesAvailable: allSizes.filter(s => s.inStock).map(s => s.size), allSizes: allSizes.map(s => ({ size: s.size, inStock: s.inStock, chest: s.chest, waist: s.waist, hips: s.hips, length: s.length, shoulder: s.shoulder || null, thigh: s.thigh || null, inseam: s.inseam || null })), recommendation: bestSize === selected.size ? `${selected.size} aapke liye perfect fit hai.` : `${selected.size} aapko ${details.main.status} rahega. ${bestSize} try karo.` });
//     } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
//   });

//   return router;
// };




const express = require('express');
const { z } = require('zod');
const { checkFit } = require('../services/fitService');

const TOP_CATEGORIES = ['tshirt', 'top', 'shirt', 'kurta', 'dress', 'kurti', 'suit', 'blouse', 'saree'];
const BOTTOM_CATEGORIES = ['jeans', 'pant', 'trouser', 'shorts', 'skirt', 'lehenga', 'palazzo'];

// Zod - Point 15
const measurementSchema = z.object({
  chest: z.number().min(20).max(70).nullable().optional(),
  shoulder: z.number().min(10).max(30).nullable().optional(),
  length: z.number().min(10).max(70).nullable().optional(),
  waist: z.number().min(20).max(70).nullable().optional(),
  hips: z.number().min(20).max(70).nullable().optional(),
  thigh: z.number().min(10).max(40).nullable().optional(),
  inseam: z.number().min(10).max(50).nullable().optional(),
  height: z.number().min(100).max(250).nullable().optional(),
  weight: z.number().min(20).max(200).nullable().optional(),
});

module.exports = (prisma) => {
  const router = express.Router();

  // AUTH middleware - Point 8,17 IDOR Fix
  const verifyToken = (req, res, next) => {
    try {
      const token = req.headers.authorization?.split(' ')[1];
      if (!token) return res.status(401).json({ error: 'Token required' });
      const jwt = require('jsonwebtoken');
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = decoded;
      next();
    } catch { return res.status(401).json({ error: 'Invalid token' }); }
  };

  router.get('/garments', async (req, res) => {
    try {
      const garments = await prisma.garment.findMany({ orderBy: { id: 'desc' }, include: { product: true } });
      if (!garments?.length) {
        const products = await prisma.product.findMany({ take: 50, orderBy: { id: 'desc' }, include: { category: true } });
        const fallback = products.map(p => ({
          id: p.id, name: p.name, category: p.category?.name || 'kurti',
          imageUrl: p.imageUrl || p.images?.[0]?.url || p.images?.[0] || null,
          productId: p.id, vtoAvailable: true
        })).filter(g => g.imageUrl);
        return res.json(fallback);
      }
      res.json(garments.map(g => ({ ...g, vtoAvailable: true, productId: g.productId || g.product?.id || g.id })));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // GET measurement - IDOR FIX Point 17
  router.get('/measurement/:userId', verifyToken, async (req, res) => {
    try {
      const paramId = Number(req.params.userId);
      if (req.user.id !== paramId && req.user.role !== 'ADMIN') {
        return res.status(403).json({ error: 'IDOR: You can only view your own measurement' });
      }
      const m = await prisma.userMeasurement.findUnique({ where: { userId: paramId } });
      res.json(m || null);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // POST measurement - IDOR + Validation
  router.post('/measurement', verifyToken, async (req, res) => {
    try {
      const { userId, chest, shoulder, length, waist, hips, thigh, inseam, height, weight } = req.body;
      const uid = Number(userId || req.user.id);
      
      // IDOR
      if (req.user.id !== uid && req.user.role !== 'ADMIN') {
        return res.status(403).json({ error: 'IDOR blocked' });
      }

      const parsed = measurementSchema.parse({
        chest: chest ? Number(chest) : null,
        shoulder: shoulder ? Number(shoulder) : null,
        length: length ? Number(length) : null,
        waist: waist ? Number(waist) : null,
        hips: hips ? Number(hips) : null,
        thigh: thigh ? Number(thigh) : null,
        inseam: inseam ? Number(inseam) : null,
        height: height ? Number(height) : null,
        weight: weight ? Number(weight) : null,
      });

      const data = await prisma.userMeasurement.upsert({
        where: { userId: uid },
        update: parsed,
        create: { userId: uid, ...parsed }
      });

      // Audit log - Point 33
      await prisma.dataAccessLog.create({
        data: { actorId: req.user.id, targetUserId: uid, purpose: 'FIT_MEASUREMENT_UPDATE', ip: req.ip }
      }).catch(()=>{});

      res.json(data);
    } catch (e) {
      if (e.name === 'ZodError') return res.status(400).json({ error: 'Invalid measurements 20-70 inch only' });
      res.status(500).json({ error: e.message });
    }
  });

  // POST /check - MAIN BEST SIZE LOGIC FIXED
  router.post('/check', verifyToken, async (req, res) => {
    try {
      const { userId, productId, garmentId, selectedSize } = req.body;
      const uid = Number(userId || req.user.id);
      
      if (req.user.id !== uid && req.user.role !== 'ADMIN') {
        return res.status(403).json({ error: 'IDOR blocked in fit check' });
      }
      if (!selectedSize || (!productId && !garmentId)) {
        return res.status(400).json({ error: "selectedSize and productId/garmentId required" });
      }

      const user = await prisma.userMeasurement.findUnique({ where: { userId: uid } });
      if (!user) return res.status(404).json({ needMeasurement: true, message: "Pehle apni Size Profile banao" });

      let allSizes = []; let category = 'Tshirt'; let productIdNum = null;

      if (productId) {
        productIdNum = Number(productId);
        const product = await prisma.product.findUnique({ where: { id: productIdNum }, include: { category: true, garments: true } });
        if (!product) return res.status(404).json({ error: "Product not found" });
        category = product.category?.name || 'kurti';
        allSizes = await prisma.productSizeChart.findMany({ where: { productId: productIdNum }, orderBy: { size: 'asc' } });
        if (!allSizes.length && product.garments[0]) {
          allSizes = await prisma.garmentSizeChart.findMany({ where: { garmentId: product.garments[0].id }, orderBy: { size: 'asc' } });
        }
      } else {
        const garment = await prisma.garment.findUnique({ where: { id: Number(garmentId) } });
        if (!garment) return res.status(404).json({ error: "Garment not found" });
        category = garment.category; productIdNum = garment.productId;
        allSizes = await prisma.garmentSizeChart.findMany({ where: { garmentId: Number(garmentId) }, orderBy: { size: 'asc' } });
      }

      if (!allSizes.length) return res.status(404).json({ error: "Is product ka size chart nahi hai" });

      const selected = allSizes.find(s => s.size.toLowerCase() === selectedSize.toLowerCase().trim());
      if (!selected) return res.status(400).json({ error: "Selected size not found", available: allSizes.map(s => s.size) });

      const details = checkFit(user, selected, category);

      // BEST SIZE SCORE - FIXED: TOP me chest*2, BOTTOM me waist*2
      let bestSize = null; let bestScore = Infinity;
      const isBottomCat = BOTTOM_CATEGORIES.includes(category.toLowerCase().trim());

      for (const gs of allSizes.filter(s => s.inStock)) {
        const fit = checkFit(user, gs, category);
        let score;
        if (isBottomCat) {
          score = Math.abs(fit.waist?.diff || 0) * 2 + Math.abs(fit.hips?.diff || 0) + Math.abs(fit.thigh?.diff || 0);
        } else {
          score = Math.abs(fit.chest?.diff || 0) * 2 + Math.abs(fit.waist?.diff || 0) + Math.abs(fit.shoulder?.diff || 0);
        }
        if (score < bestScore) { bestScore = score; bestSize = gs.size; }
      }

      const bestObj = allSizes.find(s => s.size === bestSize);

      const recommendation = bestSize === selected.size
        ? `${selected.size} aapke liye perfect fit hai.`
        : `${selected.size} aapko ${details.main.status} rahega. ${bestSize || 'dusra size'} try karo.`;

      res.json({
        productId: productIdNum, category, selectedSize: selected.size,
        fit: details.main.status, details, bestSize,
        isBestAvailable: bestObj ? bestObj.inStock : false,
        allSizesAvailable: allSizes.filter(s => s.inStock).map(s => s.size),
        allSizes: allSizes.map(s => ({ size: s.size, inStock: s.inStock, chest: s.chest, waist: s.waist, hips: s.hips, length: s.length, shoulder: s.shoulder, thigh: s.thigh, inseam: s.inseam })),
        recommendation
      });
    } catch (e) {
      console.error('Fit check error'); // No PII log Point 35
      res.status(500).json({ error: e.message });
    }
  });

  return router;
};