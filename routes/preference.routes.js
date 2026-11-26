const express = require('express');
const jwt = require('jsonwebtoken');
const { z } = require('zod');

module.exports = function (prisma) {
  const router = express.Router();

  // --- JWT Helper (IDOR & Security Fix) ---
  function getUserIdFromToken(req) {
    const authHeader = req.headers.authorization;
    if (!authHeader) throw new Error("Unauthorized");
    const token = authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : authHeader;
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const id = Number(decoded.id || decoded.userId);
    if (!Number.isInteger(id) || id <= 0) throw new Error("Unauthorized");
    return id;
  }

  function isTokenAuthError(error) {
    return (
      error?.message === "Unauthorized" ||
      error?.name === "JsonWebTokenError" ||
      error?.name === "TokenExpiredError"
    );
  }

  // --- ZOD VALIDATION SCHEMA (Security & Integrity) ---
  const preferenceSchema = z.object({
    bodyType: z.enum(['Slim', 'Athletic', 'Curvy', 'Tall', 'Petite']).optional(),
    aesthetics: z.array(z.string().trim().min(1).max(50)).max(5).optional(),
    priceRange: z.enum(['under_999', '1k_3k', '3k_plus']).optional()
  });

  // =========================================================================
  // 1. SAVE OR UPDATE ONBOARDING PREFERENCES (Quiz Results)
  // =========================================================================
  router.post('/preferences/save', async (req, res) => {
    try {
      const userId = getUserIdFromToken(req);
      const parsed = preferenceSchema.safeParse(req.body);

      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0].message });
      }

      const { bodyType, aesthetics, priceRange } = parsed.data;
      const cleanAesthetics = Array.isArray(aesthetics)
        ? aesthetics.map((item) => item.trim()).filter(Boolean)
        : undefined;

      // Upsert: Agar pehle se preference hai toh update hogi, nahi toh create hogi
      const preference = await prisma.userPreference.upsert({
        where: { userId },
        update: {
          ...(bodyType && { bodyType }),
          ...(cleanAesthetics !== undefined && { aesthetics: cleanAesthetics }),
          ...(priceRange && { priceRange })
        },
        create: {
          userId,
          bodyType: bodyType || 'Slim',
          aesthetics: cleanAesthetics || [],
          priceRange: priceRange || '1k_3k'
        }
      });

      res.status(200).json({
        success: true,
        message: "Style preferences saved successfully!",
        preference
      });
    } catch (error) {
      console.error("Save Preference Error:", error);
      if (isTokenAuthError(error)) {
        return res.status(401).json({ error: "Invalid or expired token" });
      }
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  // =========================================================================
  // 2. GET USER PREFERENCES
  // =========================================================================
  router.get('/preferences', async (req, res) => {
    try {
      const userId = getUserIdFromToken(req);
      const preference = await prisma.userPreference.findUnique({
        where: { userId }
      });

      if (!preference) {
        return res.status(404).json({ error: "Preferences not found. Please complete the quiz." });
      }

      res.json(preference);
    } catch (error) {
      if (isTokenAuthError(error)) {
        return res.status(401).json({ error: "Invalid or expired token" });
      }
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  // =========================================================================
  // 3. PERSONALIZED CAPSULE WARDROBE FEED (Based on Quiz Preferences)
  // =========================================================================
  router.get('/feed/capsule-wardrobe', async (req, res) => {
    try {
      const userId = getUserIdFromToken(req);

      // User ki preferences fetch karo
      const preference = await prisma.userPreference.findUnique({
        where: { userId }
      });

      // Agar quiz nahi bhara, toh default trending products dikhao
      if (!preference) {
        const defaultProducts = await prisma.product.findMany({
          take: 5,
          include: { images: true, brand: true },
          orderBy: { createdAt: 'desc' }
        });
        return res.json({ isPersonalized: false, products: defaultProducts });
      }

      // Price range filtering logic mapping
      let maxPrice = 100000;
      let minPrice = 0;
      if (preference.priceRange === 'under_999') {
        maxPrice = 999;
      } else if (preference.priceRange === '1k_3k') {
        minPrice = 1000;
        maxPrice = 3000;
      } else if (preference.priceRange === '3k_plus') {
        minPrice = 3001;
      }

      // Query matching products based on aesthetics tags or price
      const matchedProducts = await prisma.product.findMany({
        where: {
          price: { gte: minPrice, lte: maxPrice },
          ...(preference.aesthetics.length > 0 && {
            tags: { hasSome: preference.aesthetics }
          })
        },
        take: 5, // Weekly 5-Piece Capsule Wardrobe
        include: { images: true, brand: true, category: true },
        orderBy: { createdAt: 'desc' }
      });

      // Fallback agar tags se exact match na mile
      let finalProducts = matchedProducts;
      if (finalProducts.length === 0) {
        finalProducts = await prisma.product.findMany({
          take: 5,
          include: { images: true, brand: true },
          orderBy: { price: 'asc' }
        });
      }

      res.json({
        isPersonalized: true,
        capsuleTheme: preference.aesthetics[0] || "Curated For You",
        products: finalProducts
      });
    } catch (error) {
      console.error("Capsule Feed Error:", error);
      if (isTokenAuthError(error)) {
        return res.status(401).json({ error: "Invalid or expired token" });
      }
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  return router;
};