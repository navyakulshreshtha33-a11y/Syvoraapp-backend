// const express = require('express');
// const jwt = require('jsonwebtoken');
// const { z } = require('zod');

// module.exports = function (prisma) {
//   const router = express.Router();

//   // --- JWT Helper (IDOR & Security Fix) ---
//   function getUserIdFromToken(req) {
//     const authHeader = req.headers.authorization;
//     if (!authHeader) throw new Error("Unauthorized");
//     const token = authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : authHeader;
//     const decoded = jwt.verify(token, process.env.JWT_SECRET);
//     return Number(decoded.id || decoded.userId);
//   }

//   // --- ZOD VALIDATION SCHEMA ---
//   const eventSchema = z.object({
//     eventName: z.string().min(2).max(100),
//     eventDate: z.string().refine((val) => !isNaN(Date.parse(val)), { message: "Invalid date format" }),
//     vibeTag: z.enum(['Ethnic', 'Indo-Western', 'Formal', 'Casual', 'Party Wear', 'Streetwear'])
//   });

//   // =========================================================================
//   // 1. CREATE NEW EVENT (Add Occasion to Planner)
//   // =========================================================================
//   router.post('/events', async (req, res) => {
//     try {
//       const userId = getUserIdFromToken(req);
//       const parsed = eventSchema.safeParse(req.body);

//       if (!parsed.success) {
//         return res.status(400).json({ error: parsed.error.issues[0].message });
//       }

//       const { eventName, eventDate, vibeTag } = parsed.data;

//       const newEvent = await prisma.eventPlanner.create({
//         data: {
//           userId,
//           eventName: eventName.trim(),
//           eventDate: new Date(eventDate),
//           vibeTag
//         }
//       });

//       res.status(201).json({
//         success: true,
//         message: "Event added to wardrobe planner successfully!",
//         event: newEvent
//       });
//     } catch (error) {
//       console.error("Create Event Error:", error);
//       if (error.message === "Unauthorized" || error.name === "JsonWebTokenError") {
//         return res.status(401).json({ error: "Invalid or expired token" });
//       }
//       res.status(500).json({ error: "Internal Server Error" });
//     }
//   });

//   // =========================================================================
//   // 2. GET USER EVENTS (List Upcoming Occasions)
//   // =========================================================================
//   router.get('/events', async (req, res) => {
//     try {
//       const userId = getUserIdFromToken(req);
      
//       // Fix: Aaj ke din ke shuruwat (00:00:00) se saare upcoming events dikhao taaki time mismatch se events hide na hon
//       const today = new Date();
//       today.setHours(0, 0, 0, 0);

//       const events = await prisma.eventPlanner.findMany({
//         where: { 
//           userId,
//           eventDate: { gte: today } 
//         },
//         orderBy: { eventDate: 'asc' }
//       });

//       res.json({ success: true, events });
//     } catch (error) {
//       console.error("Get Events Error:", error);
//       if (error.message === "Unauthorized" || error.name === "JsonWebTokenError") {
//         return res.status(401).json({ error: "Invalid or expired token" });
//       }
//       res.status(500).json({ error: "Internal Server Error" });
//     }
//   });

//   // =========================================================================
//   // 3. DELETE EVENT (IDOR Protected)
//   // =========================================================================
//   router.delete('/events/:id', async (req, res) => {
//     try {
//       const userId = getUserIdFromToken(req);
//       const eventId = Number(req.params.id);

//       if (isNaN(eventId)) return res.status(400).json({ error: "Invalid Event ID" });

//       // Verify ownership (IDOR prevention)
//       const event = await prisma.eventPlanner.findUnique({
//         where: { id: eventId }
//       });

//       if (!event) {
//         return res.status(404).json({ error: "Event not found" });
//       }

//       if (event.userId !== userId) {
//         return res.status(403).json({ error: "Access denied" });
//       }

//       await prisma.eventPlanner.delete({
//         where: { id: eventId }
//       });

//       res.json({ success: true, message: "Event deleted successfully" });
//     } catch (error) {
//       console.error("Delete Event Error:", error);
//       if (error.message === "Unauthorized" || error.name === "JsonWebTokenError") {
//         return res.status(401).json({ error: "Invalid or expired token" });
//       }
//       res.status(500).json({ error: "Internal Server Error" });
//     }
//   });

//   return router;
// };
















// const express = require('express');
// const jwt = require('jsonwebtoken');
// const { z } = require('zod');

// module.exports = function (prisma) {
//   const router = express.Router();

//   // --- JWT Helper (IDOR & Security Fix) ---
//   function getUserIdFromToken(req) {
//     const authHeader = req.headers.authorization;
//     if (!authHeader) throw new Error("Unauthorized");
//     const token = authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : authHeader;
//     const decoded = jwt.verify(token, process.env.JWT_SECRET);
//     return Number(decoded.id || decoded.userId);
//   }

//   function isTokenAuthError(error) {
//     return (
//       error?.message === "Unauthorized" ||
//       error?.name === "JsonWebTokenError" ||
//       error?.name === "TokenExpiredError"
//     );
//   }

//   // --- ZOD VALIDATION SCHEMA ---
//   const eventSchema = z.object({
//     eventName: z.string().min(2).max(100),
//     eventDate: z.string().refine((val) => !isNaN(Date.parse(val)), { message: "Invalid date format" }),
//     vibeTag: z.enum(['Ethnic', 'Indo-Western', 'Formal', 'Casual', 'Party Wear', 'Streetwear'])
//   });

//   // =========================================================================
//   // 1. CREATE NEW EVENT (Add Occasion to Planner)
//   // =========================================================================
//   router.post('/events', async (req, res) => {
//     try {
//       const userId = getUserIdFromToken(req);
//       const parsed = eventSchema.safeParse(req.body);

//       if (!parsed.success) {
//         return res.status(400).json({ error: parsed.error.issues[0].message });
//       }

//       const { eventName, eventDate, vibeTag } = parsed.data;

//       const newEvent = await prisma.eventPlanner.create({
//         data: {
//           userId,
//           eventName: eventName.trim(),
//           eventDate: new Date(eventDate),
//           vibeTag
//         }
//       });

//       res.status(201).json({
//         success: true,
//         message: "Event added to wardrobe planner successfully!",
//         event: newEvent
//       });
//     } catch (error) {
//       console.error("Create Event Error:", error);
//       if (isTokenAuthError(error)) {
//         return res.status(401).json({ error: "Invalid or expired token" });
//       }
//       res.status(500).json({ error: "Internal Server Error" });
//     }
//   });

//   // =========================================================================
//   // 2. GET USER EVENTS (List Upcoming Occasions)
//   // =========================================================================
//   router.get('/events', async (req, res) => {
//     try {
//       const userId = getUserIdFromToken(req);

//       // Fix: Aaj ke din ke shuruwat (00:00:00) se saare upcoming events dikhao taaki time mismatch se events hide na hon
//       const today = new Date();
//       today.setHours(0, 0, 0, 0);

//       const events = await prisma.eventPlanner.findMany({
//         where: {
//           userId,
//           eventDate: { gte: today }
//         },
//         orderBy: { eventDate: 'asc' }
//       });

//       res.json({ success: true, events });
//     } catch (error) {
//       console.error("Get Events Error:", error);
//       if (isTokenAuthError(error)) {
//         return res.status(401).json({ error: "Invalid or expired token" });
//       }
//       res.status(500).json({ error: "Internal Server Error" });
//     }
//   });

//   // =========================================================================
//   // 3. DELETE EVENT (IDOR Protected)
//   // =========================================================================
//   router.delete('/events/:id', async (req, res) => {
//     try {
//       const userId = getUserIdFromToken(req);
//       const eventId = Number(req.params.id);

//       if (!Number.isInteger(eventId) || eventId <= 0) {
//         return res.status(400).json({ error: "Invalid Event ID" });
//       }

//       // Verify ownership (IDOR prevention)
//       const event = await prisma.eventPlanner.findUnique({
//         where: { id: eventId }
//       });

//       if (!event) {
//         return res.status(404).json({ error: "Event not found" });
//       }

//       if (event.userId !== userId) {
//         return res.status(403).json({ error: "Access denied" });
//       }

//       await prisma.eventPlanner.delete({
//         where: { id: eventId }
//       });

//       res.json({ success: true, message: "Event deleted successfully" });
//     } catch (error) {
//       console.error("Delete Event Error:", error);
//       if (isTokenAuthError(error)) {
//         return res.status(401).json({ error: "Invalid or expired token" });
//       }
//       res.status(500).json({ error: "Internal Server Error" });
//     }
//   });

//   return router;
// };

















const express = require('express');
const jwt = require('jsonwebtoken');
const { z } = require('zod');

module.exports = function (prisma, sendNotification) {
  const router = express.Router();

  function getUserIdFromToken(req) {
    const authHeader = req.headers.authorization;
    if (!authHeader) throw new Error("Unauthorized");
    const token = authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : authHeader;
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return Number(decoded.id || decoded.userId);
  }

  function isTokenAuthError(error) {
    return (
      error?.message === "Unauthorized" ||
      error?.name === "JsonWebTokenError" ||
      error?.name === "TokenExpiredError"
    );
  }

  async function notifyUserSafe(payload) {
    if (typeof sendNotification !== 'function') return;
    try {
      await sendNotification(payload);
    } catch (err) {
      console.error("⚠️ Event notification error:", err.message);
    }
  }

  function hasAvailableStock(product) {
    if (!product) return false;
    if (product.status !== 'ACTIVE' || product.isOutOfStock === true) return false;
    if (Number(product.stock ?? 0) <= 0) return false;
    if (Array.isArray(product.sizeCharts) && product.sizeCharts.length > 0) {
      const anySizeAvailable = product.sizeCharts.some(
        (s) => s.inStock !== false && Number(s.stock ?? 0) > 0
      );
      if (!anySizeAvailable) return false;
    }
    return true;
  }

  async function findMatchingInStockProduct(vibeTag, eventName = '') {
    const cleanVibe = String(vibeTag || '').trim();
    const stopWords = new Set(['the', 'and', 'for', 'with', 'day', 'event', 'party', 'wear']);
    const keywords = String(eventName || '')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 3 && !stopWords.has(w));

    const orFilters = [];
    if (cleanVibe) {
      orFilters.push(
        { vibeTag: { equals: cleanVibe, mode: 'insensitive' } },
        { occasion: { contains: cleanVibe, mode: 'insensitive' } },
        { tags: { has: cleanVibe } }
      );
    }
    for (const kw of keywords) {
      orFilters.push(
        { name: { contains: kw, mode: 'insensitive' } },
        { occasion: { contains: kw, mode: 'insensitive' } }
      );
    }

    if (orFilters.length === 0) return null;

    const candidates = await prisma.product.findMany({
      where: {
        status: 'ACTIVE',
        isOutOfStock: false,
        stock: { gt: 0 },
        OR: orFilters,
      },
      include: {
        images: { orderBy: { sortOrder: 'asc' }, take: 1 },
        sizeCharts: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    const inStockList = candidates.filter(hasAvailableStock);
    if (inStockList.length === 0) return null;

    const vibeMatched = cleanVibe
      ? inStockList.filter(
          (p) =>
            String(p.vibeTag || '').toLowerCase() === cleanVibe.toLowerCase() ||
            String(p.occasion || '').toLowerCase().includes(cleanVibe.toLowerCase()) ||
            (Array.isArray(p.tags) && p.tags.some((t) => String(t).toLowerCase() === cleanVibe.toLowerCase()))
        )
      : inStockList;

    const pool = vibeMatched.length > 0 ? vibeMatched : inStockList;

    if (keywords.length > 0) {
      const kwMatch = pool.find((p) => {
        const text = `${p.name || ''} ${p.occasion || ''} ${p.vibeTag || ''}`.toLowerCase();
        return keywords.some((kw) => text.includes(kw));
      });
      if (kwMatch) return kwMatch;
    }

    return pool[0];
  }

  const eventSchema = z.object({
    eventName: z.string().min(2).max(100),
    eventDate: z.string().refine((val) => !isNaN(Date.parse(val)), { message: "Invalid date format" }),
    vibeTag: z.enum(['Ethnic', 'Indo-Western', 'Formal', 'Casual', 'Party Wear', 'Streetwear'])
  });

  // 1. CREATE NEW EVENT -> Only notify + FCM if an in-stock matching product exists
  router.post('/events', async (req, res) => {
    try {
      const userId = getUserIdFromToken(req);
      const parsed = eventSchema.safeParse(req.body);

      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0].message });
      }

      const { eventName, eventDate, vibeTag } = parsed.data;
      const cleanName = eventName.trim();
      const parsedDate = new Date(eventDate);

      if (Number.isNaN(parsedDate.getTime())) {
        return res.status(400).json({ error: "Invalid date value" });
      }

      const newEvent = await prisma.eventPlanner.create({
        data: {
          userId,
          eventName: cleanName,
          eventDate: parsedDate,
          vibeTag,
          reminderSent: false
        }
      });

      const matchedProduct = await findMatchingInStockProduct(vibeTag, cleanName);

      if (matchedProduct) {
        const formattedDate = parsedDate.toLocaleDateString('en-IN', {
          day: 'numeric',
          month: 'short',
          year: 'numeric'
        });
        const encodedTag = encodeURIComponent(vibeTag);
        const encodedEvent = encodeURIComponent(cleanName);

        await notifyUserSafe({
          userId,
          productId: matchedProduct.id,
          title: matchedProduct.name,
          message: `In stock for ${cleanName} (${formattedDate}) · ₹${matchedProduct.price}. Tap to shop! [EVT:${encodedTag}|${encodedEvent}]`
        });
      }

      res.status(201).json({
        success: true,
        message: "Event added to wardrobe planner successfully!",
        event: newEvent,
        matchedProductId: matchedProduct?.id || null
      });
    } catch (error) {
      console.error("Create Event Error:", error);
      if (isTokenAuthError(error)) {
        return res.status(401).json({ error: "Invalid or expired token" });
      }
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  // 2. GET USER EVENTS
  router.get('/events', async (req, res) => {
    try {
      const userId = getUserIdFromToken(req);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const events = await prisma.eventPlanner.findMany({
        where: {
          userId,
          eventDate: { gte: today }
        },
        orderBy: { eventDate: 'asc' }
      });

      res.json({ success: true, events });
    } catch (error) {
      console.error("Get Events Error:", error);
      if (isTokenAuthError(error)) {
        return res.status(401).json({ error: "Invalid or expired token" });
      }
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  // 3. DELETE EVENT
  router.delete('/events/:id', async (req, res) => {
    try {
      const userId = getUserIdFromToken(req);
      const eventId = Number(req.params.id);

      if (!Number.isInteger(eventId) || eventId <= 0) {
        return res.status(400).json({ error: "Invalid Event ID" });
      }

      const event = await prisma.eventPlanner.findUnique({ where: { id: eventId } });
      if (!event) return res.status(404).json({ error: "Event not found" });
      if (event.userId !== userId) return res.status(403).json({ error: "Access denied" });

      await prisma.eventPlanner.delete({ where: { id: eventId } });
      res.json({ success: true, message: "Event deleted successfully" });
    } catch (error) {
      console.error("Delete Event Error:", error);
      if (isTokenAuthError(error)) {
        return res.status(401).json({ error: "Invalid or expired token" });
      }
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  return router;
};