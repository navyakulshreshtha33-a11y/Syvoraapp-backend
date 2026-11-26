const express = require('express');
const jwt = require('jsonwebtoken');

module.exports = function (prisma) {
  const router = express.Router();

  const verifyToken = (req, res, next) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader) return res.status(401).json({ error: "Unauthorized" });
      const token = authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : authHeader;
      if (!token) return res.status(401).json({ error: "Unauthorized" });
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const userId = Number(decoded.id);
      if (!Number.isInteger(userId) || userId <= 0) {
        return res.status(401).json({ error: "Invalid token" });
      }
      req.userId = userId;
      next();
    } catch {
      return res.status(401).json({ error: "Invalid token" });
    }
  };

  // 1. Validate / Apply Coupon
  router.post('/apply', verifyToken, async (req, res) => {
    try {
      const { code } = req.body || {};
      if (typeof code !== 'string' || !code.trim()) {
        return res.status(400).json({ error: "Coupon code required" });
      }

      const cleanCode = code.toUpperCase().trim();
      if (cleanCode.length > 30) {
        return res.status(400).json({ error: "Invalid coupon code" });
      }

      const coupon = await prisma.coupon.findUnique({ where: { code: cleanCode } });

      if (!coupon || !coupon.isActive) {
        return res.status(400).json({ error: "Invalid or expired coupon code" });
      }

      if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) {
        return res.status(400).json({ error: "Invalid or expired coupon code" });
      }

      // Total usage limit check
      if (coupon.usedCount >= coupon.usageLimit) {
        return res.status(400).json({ error: "Offer limit reached! This coupon is no longer available." });
      }

      // Per-user single-use check
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