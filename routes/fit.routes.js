const express = require('express');
const { z } = require('zod');
const { checkFit } = require('../services/fitService');
const { estimateMeasurements } = require('../services/ruleEngine');

const TOP_CATEGORIES = ['tshirt', 'top', 'shirt', 'kurta', 'dress', 'kurti', 'suit', 'blouse', 'saree'];
const BOTTOM_CATEGORIES = ['jeans', 'pant', 'trouser', 'shorts', 'skirt', 'lehenga', 'palazzo'];

function getSizeRank(sizeStr) {
  if (!sizeStr) return 0;
  const clean = String(sizeStr).toLowerCase().trim();
  const num = parseInt(clean, 10);
  if (!isNaN(num)) return num;
  const stdRanks = { 'xs': 1, 's': 2, 'm': 3, 'l': 4, 'xl': 5, 'xxl': 6, '2xl': 6, '3xl': 7 };
  return stdRanks[clean] || 3;
}

const measurementSchema = z.object({
  height: z.number().min(100).max(250).nullable().optional(),
  weight: z.number().min(20).max(200).nullable().optional(),
  gender: z.string().optional().default('female'),
  bodyType: z.string().optional().default('regular'),
  fitType: z.string().optional().default('regular'),
  chest: z.number().min(20).max(70).nullable().optional(),
  waist: z.number().min(20).max(70).nullable().optional(),
  hips: z.number().min(20).max(70).nullable().optional(),
  shoulder: z.number().min(10).max(30).nullable().optional(),
  length: z.number().min(10).max(70).nullable().optional(),
  thigh: z.number().min(10).max(40).nullable().optional(),
  inseam: z.number().min(10).max(50).nullable().optional(),
});

module.exports = (prisma) => {
  const router = express.Router();

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

  // POST /measurement - Height & Weight se automatic measurements estimate karke save karega
  router.post('/measurement', verifyToken, async (req, res) => {
    try {
      const { userId, height, weight, gender, bodyType, fitType, chest, waist, hips, shoulder, length, thigh, inseam } = req.body;
      const uid = Number(userId || req.user.id);
      
      if (req.user.id !== uid && req.user.role !== 'ADMIN') {
        return res.status(403).json({ error: 'IDOR blocked' });
      }

      const parsed = measurementSchema.parse({
        height: height ? Number(height) : null,
        weight: weight ? Number(weight) : null,
        gender: gender || 'female',
        bodyType: bodyType || 'regular',
        fitType: fitType || 'regular',
        chest: chest ? Number(chest) : null,
        waist: waist ? Number(waist) : null,
        hips: hips ? Number(hips) : null,
        shoulder: shoulder ? Number(shoulder) : null,
        length: length ? Number(length) : null,
        thigh: thigh ? Number(thigh) : null,
        inseam: inseam ? Number(inseam) : null,
      });

      let calculatedChest = parsed.chest;
      let calculatedWaist = parsed.waist;
      let calculatedShoulder = parsed.shoulder;
      let calculatedHips = parsed.hips;

      // 🔥 AUTO-ESTIMATION LOGIC: Height & Weight se ruleEngine ke through values calculate honge
      if (parsed.height && parsed.weight) {
        const feet = Math.floor(parsed.height / 30.48);
        const inches = Math.round((parsed.height % 30.48) / 2.54);
        const heightStr = `${feet}'${inches}`;

        const estimated = estimateMeasurements(
          heightStr,
          parsed.weight,
          parsed.gender || 'female',
          parsed.bodyType || 'regular'
        );

        calculatedChest = parsed.chest || estimated.chest;
        calculatedWaist = parsed.waist || estimated.waist;
        calculatedShoulder = parsed.shoulder || estimated.shoulder;
        calculatedHips = parsed.hips || estimated.hip;
      }

      // 🛑 Sirf wahi fields database me save hongi jo Prisma schema ke UserMeasurement table me hain!
      const dbPayload = {
        height: parsed.height,
        weight: parsed.weight,
        chest: calculatedChest,
        waist: calculatedWaist,
        shoulder: calculatedShoulder,
        hips: calculatedHips,
        length: parsed.length,
        thigh: parsed.thigh,
        inseam: parsed.inseam,
      };

      const data = await prisma.userMeasurement.upsert({
        where: { userId: uid },
        update: dbPayload,
        create: { userId: uid, ...dbPayload }
      });

      await prisma.dataAccessLog.create({
        data: { actorId: req.user.id, targetUserId: uid, purpose: 'FIT_MEASUREMENT_AUTO_ESTIMATE', ip: req.ip }
      }).catch(()=>{});

      res.json({ message: "Measurements estimated & saved successfully!", data });
    } catch (e) {
      console.error("Measurement error:", e);
      if (e.name === 'ZodError') return res.status(400).json({ error: 'Invalid measurement values' });
      res.status(500).json({ error: e.message });
    }
  });

  // POST /check - Fit calculation route
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
      if (!user) return res.status(404).json({ needMeasurement: true, message: "Pehle apni Height aur Weight profile set karein" });

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

      const isBottomCat = BOTTOM_CATEGORIES.includes(category.toLowerCase().trim());

      let bestSizeObj = null;
      let minScore = Infinity;

      for (const gs of allSizes.filter(s => s.inStock)) {
        const fit = checkFit(user, gs, category);
        let primaryDiff = 0;
        let score = 0;

        if (isBottomCat) {
          const wDiff = fit.waist?.status !== 'Ignored' ? fit.waist.diff : null;
          const hDiff = fit.hips?.status !== 'Ignored' ? fit.hips.diff : null;
          primaryDiff = wDiff !== null ? wDiff : (hDiff !== null ? hDiff : 0);
          score = (wDiff !== null ? Math.abs(wDiff) * 3 : 0) + (hDiff !== null ? Math.abs(hDiff) : 0);
        } else {
          const cDiff = fit.chest?.status !== 'Ignored' ? fit.chest.diff : null;
          primaryDiff = cDiff !== null ? cDiff : 0;
          score = Math.abs(primaryDiff) * 3 + (fit.shoulder?.diff ? Math.abs(fit.shoulder.diff) : 0);
        }

        if (primaryDiff < -0.5) score += 50;

        if (score < minScore) {
          minScore = score;
          bestSizeObj = gs;
        }
      }

      const bestSize = bestSizeObj ? bestSizeObj.size : selected.size;
      const selectedFitDetails = checkFit(user, selected, category);
      const selectedStatus = selectedFitDetails.main.status;

      const selectedRank = getSizeRank(selected.size);
      const bestRank = getSizeRank(bestSize);

      let recommendation = '';
      if (selected.size.toLowerCase() === bestSize.toLowerCase() || selectedStatus === 'Perfect') {
        recommendation = `${selected.size} aapke liye perfect fit hai.`;
      } else if (selectedStatus === 'Tight' || selectedRank < bestRank) {
        recommendation = `${selected.size} aapko Tight rahega. Bada size (${bestSize}) try karo.`;
      } else {
        recommendation = `${selected.size} aapko ${selectedStatus} rahega. Chhota size (${bestSize}) try karo.`;
      }

      res.json({
        productId: productIdNum, category, selectedSize: selected.size,
        fit: selectedStatus, details: selectedFitDetails, bestSize,
        isBestAvailable: bestSizeObj ? bestSizeObj.inStock : false,
        allSizesAvailable: allSizes.filter(s => s.inStock).map(s => s.size),
        allSizes: allSizes.map(s => ({ size: s.size, inStock: s.inStock, chest: s.chest, waist: s.waist, hips: s.hips, length: s.length, shoulder: s.shoulder, thigh: s.thigh, inseam: s.inseam })),
        recommendation
      });
    } catch (e) {
      console.error('Fit check error:', e);
      res.status(500).json({ error: e.message });
    }
  });

  return router;
};