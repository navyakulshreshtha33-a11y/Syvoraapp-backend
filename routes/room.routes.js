const express = require('express');
const jwt = require('jsonwebtoken');

module.exports = function (prisma) {
  const router = express.Router();

  // --- JWT Helper ---
  function getUserIdFromToken(req) {
    const authHeader = req.headers.authorization;
    if (!authHeader) throw new Error("Unauthorized");
    const token = authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : authHeader;
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return Number(decoded.id || decoded.userId);
  }

  // =========================================================================
  // 1. CREATE A NEW SHOPPING ROOM
  // =========================================================================
  router.post('/rooms/create', async (req, res) => {
    try {
      const userId = getUserIdFromToken(req);
      const { userName } = req.body;

      // Naya room create karo
      const room = await prisma.shoppingRoom.create({
        data: {
          creatorId: userId,
          members: {
            create: {
              userId,
              userName: userName || "Host"
            }
          }
        },
        include: { members: true, items: { include: { product: { include: { images: true } } } }, comments: true }
      });

      res.status(201).json({
        success: true,
        roomId: room.id,
        shareUrl: `https://syvora.app/room/${room.id}`,
        room
      });
    } catch (error) {
      console.error("Create Room Error:", error);
      if (error.message === "Unauthorized") return res.status(401).json({ error: "Unauthorized" });
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  // =========================================================================
  // 2. GET ROOM DETAILS (Jab user link se join kare)
  // =========================================================================
  router.get('/rooms/:roomId', async (req, res) => {
    try {
      const { roomId } = req.params;

      const room = await prisma.shoppingRoom.findUnique({
        where: { id: roomId },
        include: {
          members: true,
          items: { include: { product: { include: { images: true, brand: true } } } },
          comments: { orderBy: { createdAt: 'asc' } }
        }
      });

      if (!room || !room.isActive) {
        return res.status(404).json({ error: "Shopping room not found or expired" });
      }

      res.json({ success: true, room });
    } catch (error) {
      console.error("Get Room Error:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  return router;
};