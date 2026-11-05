const express = require('express');
const jwt = require('jsonwebtoken');

module.exports = function (prisma) {
  const router = express.Router();

  const verifyToken = (req, res, next) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader) return res.status(401).json({ error: "Unauthorized" });
      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.userId = Number(decoded.id);
      next();
    } catch {
      return res.status(401).json({ error: "Invalid token" });
    }
  };

  // 1. Validate / Apply Coupon
  router.post('/apply', verifyToken, async (req, res) => {
    try {
      const { code } = req.body;
      if (!code) return res.status(400).json({ error: "Coupon code required" });

      const cleanCode = code.toUpperCase().trim();
      const coupon = await prisma.coupon.findUnique({ where: { code: cleanCode } });

      if (!coupon || !coupon.isActive) {
        return res.status(400).json({ error: "Invalid or expired coupon code" });
      }

      // 🔴 CHECK 1: Total limit 5 cross toh nahi hui?
      if (coupon.usedCount >= coupon.usageLimit) {
        return res.status(400).json({ error: "Offer limit reached! This coupon is no longer available." });
      }

      // 🔴 CHECK 2: Kya is user ne ye coupon pehle hi use kar liya hai?
      const alreadyUsed = await prisma.couponRedemption.findUnique({
        where: {
          couponId_userId: {
            couponId: coupon.id,
            userId: req.userId
          }
        }
      });

      if (alreadyUsed) {
        return res.status(400).json({ error: "You have already used this coupon code once!" });
      }

      res.json({
        success: true,
        couponId: coupon.id,
        code: coupon.code,
        discountPct: coupon.discountPct,
        message: `${coupon.discountPct}% discount code applied!`
      });
    } catch (error) {
      console.error("Coupon verification error:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  return router;
};