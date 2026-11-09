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

  // 🚀 Helper to clean Room ID if full WhatsApp URL is pasted
  function cleanRoomId(id) {
    if (!id) return '';
    let cleaned = String(id).trim();
    if (cleaned.includes('syvora.in/room/')) {
      const parts = cleaned.split('syvora.in/room/');
      cleaned = parts[1] || cleaned;
    }
    if (cleaned.includes('/')) {
      const parts = cleaned.split('/');
      cleaned = parts[parts.length - 1];
    }
    return cleaned.split('?')[0].trim();
  }

  // =========================================================================
  // 1. CREATE A NEW SHOPPING ROOM
  // =========================================================================
  router.post('/rooms/create', async (req, res) => {
    try {
      const userId = getUserIdFromToken(req);
      const { userName, initialProductId, initialProductIds } = req.body;

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

      if (initialProductId) {
        await prisma.roomItem.create({
          data: {
            roomId: room.id,
            productId: Number(initialProductId),
            addedBy: userName || "Host"
          }
        });
      }

      if (Array.isArray(initialProductIds) && initialProductIds.length > 0) {
        const itemsToCreate = initialProductIds.map(pId => ({
          roomId: room.id,
          productId: Number(pId),
          addedBy: userName || "Host"
        }));

        await prisma.roomItem.createMany({
          data: itemsToCreate,
          skipDuplicates: true
        });
      }

      const updatedRoom = await prisma.shoppingRoom.findUnique({
        where: { id: room.id },
        include: {
          members: true,
          items: { include: { product: { include: { images: true, brand: true } } } },
          comments: { orderBy: { createdAt: 'asc' } }
        }
      });

      res.status(201).json({
        success: true,
        roomId: room.id,
        shareUrl: `https://syvora.in/room/${room.id}`,
        room: updatedRoom
      });
    } catch (error) {
      console.error("Create Room Error:", error);
      if (error.message === "Unauthorized") return res.status(401).json({ error: "Unauthorized" });
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  // =========================================================================
  // 2. GET ROOM DETAILS
  // =========================================================================
  router.get('/rooms/:roomId', async (req, res) => {
    try {
      const roomId = cleanRoomId(req.params.roomId);

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

  // =========================================================================
  // 3. DYNAMICALLY ADD ITEM TO EXISTING ROOM
  // =========================================================================
  router.post('/rooms/:roomId/add-item', async (req, res) => {
    try {
      const roomId = cleanRoomId(req.params.roomId);
      const { productId, userName } = req.body;
      getUserIdFromToken(req);

      if (!productId) {
        return res.status(400).json({ error: "Product ID is required" });
      }

      const room = await prisma.shoppingRoom.findUnique({ where: { id: roomId } });
      if (!room || !room.isActive) {
        return res.status(404).json({ error: "Shopping room not found or expired" });
      }

      const existingItem = await prisma.roomItem.findFirst({
        where: { roomId, productId: Number(productId) }
      });
      if (existingItem) {
        return res.status(400).json({ error: "Item is already in this room" });
      }

      const newItem = await prisma.roomItem.create({
        data: {
          roomId,
          productId: Number(productId),
          addedBy: userName || "Member"
        },
        include: { product: { include: { images: true, brand: true } } }
      });
      
      res.status(201).json({ success: true, item: newItem });
    } catch (error) {
      console.error("Add Room Item Error:", error);
      if (error.message === "Unauthorized") return res.status(401).json({ error: "Unauthorized" });
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  // =========================================================================
  // 4. JOIN AN EXISTING SHOPPING ROOM (Fixed with correct Prisma model 'roomMember')
  // =========================================================================
  router.post('/rooms/:roomId/join', async (req, res) => {
    try {
      const roomId = cleanRoomId(req.params.roomId);
      const { userName } = req.body;
      const userId = getUserIdFromToken(req);

      const room = await prisma.shoppingRoom.findUnique({
        where: { id: roomId },
        include: { members: true }
      });

      if (!room || !room.isActive) {
        return res.status(404).json({ error: "Shopping room not found or expired" });
      }

      // 🚀 Fixed: using exact prisma.roomMember model matching schema.prisma
      await prisma.roomMember.upsert({
        where: {
          roomId_userId: {
            roomId,
            userId
          }
        },
        update: {
          userName: userName || "Member"
        },
        create: {
          roomId,
          userId,
          userName: userName || "Member"
        }
      });

      const updatedRoom = await prisma.shoppingRoom.findUnique({
        where: { id: roomId },
        include: {
          members: true,
          items: { include: { product: { include: { images: true, brand: true } } } },
          comments: { orderBy: { createdAt: 'asc' } }
        }
      });

      res.json({ success: true, room: updatedRoom });
    } catch (error) {
      console.error("Join Room Error:", error);
      if (error.message === "Unauthorized") return res.status(401).json({ error: "Unauthorized" });
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  return router;
};