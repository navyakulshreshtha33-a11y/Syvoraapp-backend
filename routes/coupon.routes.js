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

  // 2. Admin: Create Coupon
  router.post('/', verifyToken, verifyAdminUser, async (req, res) => {
    try {
      const rawCode = typeof req.body?.code === 'string' ? req.body.code.trim().toUpperCase() : '';
      const pct = Number(req.body?.discountPct);
      const limit = req.body?.usageLimit !== undefined && req.body?.usageLimit !== ''
        ? Number(req.body.usageLimit)
        : 5;
      const isActive = req.body?.isActive !== undefined ? Boolean(req.body.isActive) : true;

      if (!rawCode || !/^[A-Z0-9_-]{3,25}$/.test(rawCode)) {
        return res.status(400).json({
          error: "Coupon code must be 3-25 letters/numbers/underscores/hyphens (e.g. SYVORA15).",
        });
      }
      if (!Number.isFinite(pct) || pct <= 0 || pct > 90) {
        return res.status(400).json({ error: "Discount percentage must be between 1 and 90." });
      }
      if (!Number.isInteger(limit) || limit <= 0 || limit > 1000000) {
        return res.status(400).json({ error: "Usage limit must be a positive whole number." });
      }

      const existing = await prisma.coupon.findUnique({ where: { code: rawCode } });
      if (existing) {
        return res.status(409).json({ error: `Coupon code ${rawCode} already exists.` });
      }

      const created = await prisma.coupon.create({
        data: {
          code: rawCode,
          discountPct: pct,
          usageLimit: limit,
          usedCount: 0,
          isActive,
        },
      });

      return res.status(201).json({
        message: `Coupon ${created.code} created!`,
        coupon: created,
      });
    } catch (error) {
      console.error("Create coupon error:", error);
      return res.status(500).json({ error: "Internal Server Error" });
    }
  });

  // 3. Admin: Toggle Coupon Active Status
  router.patch('/:id/toggle', verifyToken, verifyAdminUser, async (req, res) => {
    try {
      const couponId = Number(req.params.id);
      if (!Number.isInteger(couponId) || couponId <= 0) {
        return res.status(400).json({ error: "Invalid coupon ID" });
      }

      const existing = await prisma.coupon.findUnique({ where: { id: couponId } });
      if (!existing) {
        return res.status(404).json({ error: "Coupon not found" });
      }

      const updated = await prisma.coupon.update({
        where: { id: couponId },
        data: { isActive: !existing.isActive },
      });

      return res.json({
        message: `Coupon ${updated.code} is now ${updated.isActive ? 'ACTIVE' : 'INACTIVE'}.`,
        coupon: updated,
      });
    } catch (error) {
      console.error("Toggle coupon error:", error);
      return res.status(500).json({ error: "Internal Server Error" });
    }
  });

  return router;
};