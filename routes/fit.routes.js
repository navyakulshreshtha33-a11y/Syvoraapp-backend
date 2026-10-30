const express = require('express');
const jwt = require('jsonwebtoken');

// Bottom categories constant
const BOTTOM_CATEGORIES = ['pants', 'jeans', 'trousers', 'shorts', 'skirt', 'palazzo', 'leggings'];

// Helper function for fit checking (agar aapne alag utils mein rakha hai toh wahan se require kar sakti hain)
function checkFit(user, garmentSize, category) {
  // Safe default fit details logic
  return {
    main: { status: 'Perfect' },
    chest: { diff: 0, status: 'Normal' },
    shoulder: { diff: 0, status: 'Normal' },
    waist: { diff: 0, status: 'Normal' },
    hips: { diff: 0, status: 'Normal' },
    thigh: { diff: 0, status: 'Normal' }
  };
}

module.exports = (prisma) => {
  const router = express.Router();

  // Helper middleware to verify token
  const verifyToken = (req, res, next) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = decoded;
      next();
    } catch {
      return res.status(401).json({ error: "Invalid token" });
    }
  };

  // POST /check - Smart Scoring for Partial Data
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

      // SMART DYNAMIC SCORING (Handles partial user inputs gracefully)
      let bestSize = null; let bestScore = Infinity;
      const isBottomCat = BOTTOM_CATEGORIES.includes(category.toLowerCase().trim());

      for (const gs of allSizes.filter(s => s.inStock)) {
        const fit = checkFit(user, gs, category);
        let score = 0;
        
        if (isBottomCat) {
          const wDiff = Math.abs(fit.waist?.diff || 0);
          const hDiff = Math.abs(fit.hips?.diff || 0);
          const tDiff = Math.abs(fit.thigh?.diff || 0);
          score = (fit.waist?.status !== 'Ignored' ? wDiff * 2 : 0) + 
                  (fit.hips?.status !== 'Ignored' ? hDiff : 0) + 
                  (fit.thigh?.status !== 'Ignored' ? tDiff : 0);
        } else {
          const cDiff = Math.abs(fit.chest?.diff || 0);
          const sDiff = Math.abs(fit.shoulder?.diff || 0);
          score = (fit.chest?.status !== 'Ignored' ? cDiff * 2 : 0) + 
                  (fit.shoulder?.status !== 'Ignored' ? sDiff : 0);
        }

        if (score === 0) score = Math.abs((gs.length || 0) - (user.length || 0));

        if (score < bestScore) { 
          bestScore = score; 
          bestSize = gs.size; 
        }
      }

      if (!bestSize && allSizes.length > 0) bestSize = allSizes[0].size;

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
      console.error('Fit check error:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  return router;
};