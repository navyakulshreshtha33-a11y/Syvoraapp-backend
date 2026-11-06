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
    return Number(decoded.id || decoded.userId);
  }

  // --- ZOD VALIDATION SCHEMA ---
  const eventSchema = z.object({
    eventName: z.string().min(2).max(100),
    eventDate: z.string().refine((val) => !isNaN(Date.parse(val)), { message: "Invalid date format" }),
    vibeTag: z.enum(['Ethnic', 'Indo-Western', 'Formal', 'Casual', 'Party Wear', 'Streetwear'])
  });

  // =========================================================================
  // 1. CREATE NEW EVENT (Add Occasion to Planner)
  // =========================================================================
  router.post('/events', async (req, res) => {
    try {
      const userId = getUserIdFromToken(req);
      const parsed = eventSchema.safeParse(req.body);

      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0].message });
      }

      const { eventName, eventDate, vibeTag } = parsed.data;

      const newEvent = await prisma.eventPlanner.create({
        data: {
          userId,
          eventName: eventName.trim(),
          eventDate: new Date(eventDate),
          vibeTag
        }
      });

      res.status(201).json({
        success: true,
        message: "Event added to wardrobe planner successfully!",
        event: newEvent
      });
    } catch (error) {
      console.error("Create Event Error:", error);
      if (error.message === "Unauthorized" || error.name === "JsonWebTokenError") {
        return res.status(401).json({ error: "Invalid or expired token" });
      }
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  // =========================================================================
  // 2. GET USER EVENTS (List Upcoming Occasions)
  // =========================================================================
  router.get('/events', async (req, res) => {
    try {
      const userId = getUserIdFromToken(req);
      
      const events = await prisma.eventPlanner.findMany({
        where: { 
          userId,
          eventDate: { gte: new Date() } // Sirf future/upcoming events dikhao
        },
        orderBy: { eventDate: 'asc' }
      });

      res.json({ success: true, events });
    } catch (error) {
      console.error("Get Events Error:", error);
      if (error.message === "Unauthorized") return res.status(401).json({ error: "Unauthorized" });
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  // =========================================================================
  // 3. DELETE EVENT (IDOR Protected)
  // =========================================================================
  router.delete('/events/:id', async (req, res) => {
    try {
      const userId = getUserIdFromToken(req);
      const eventId = Number(req.params.id);

      if (isNaN(eventId)) return res.status(400).json({ error: "Invalid Event ID" });

      // Verify ownership (IDOR prevention)
      const event = await prisma.eventPlanner.findUnique({
        where: { id: eventId }
      });

      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }

      if (event.userId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }

      await prisma.eventPlanner.delete({
        where: { id: eventId }
      });

      res.json({ success: true, message: "Event deleted successfully" });
    } catch (error) {
      console.error("Delete Event Error:", error);
      if (error.message === "Unauthorized") return res.status(401).json({ error: "Unauthorized" });
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  return router;
};