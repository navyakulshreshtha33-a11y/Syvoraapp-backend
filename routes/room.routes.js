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
  // 1. CREATE A NEW SHOPPING ROOM (Supports Initial Products from Cart/Details)
  // =========================================================================
  router.post('/rooms/create', async (req, res) => {
    try {
      const userId = getUserIdFromToken(req);
      const { userName, initialProductId, initialProductIds } = req.body;

      // 1. Shopping Room create karo
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

      // 2. Single Product Details se aaye toh 1 item add karo
      if (initialProductId) {
        await prisma.roomItem.create({
          data: {
            roomId: room.id,
            productId: Number(initialProductId),
            addedBy: userName || "Host"
          }
        });
      }

      // 3. Cart Screen se aaye toh saare cart products ek sath add karo
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

      // 4. Updated room data items ke sath fetch karke return karo
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
        shareUrl: `https://syvora.in/room/${room.id}`, // ✅ syvora.in use karo
        room: updatedRoom
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

  // =========================================================================
  // 3. DYNAMICALLY ADD ITEM TO EXISTING ROOM (Frontend requirement)
  // =========================================================================
  router.post('/rooms/:roomId/add-item', async (req, res) => {
    try {
      const { roomId } = req.params;
      const { productId, userName } = req.body;
      getUserIdFromToken(req); // Just to verify the token is valid

      if (!productId) {
        return res.status(400).json({ error: "Product ID is required" });
      }

      // 1. Verify Room exists and is active
      const room = await prisma.shoppingRoom.findUnique({ where: { id: roomId } });
      if (!room || !room.isActive) {
        return res.status(404).json({ error: "Shopping room not found or expired" });
      }

      // 2. Prevent duplicates (Ek hi product room mein do baar na aaye)
      const existingItem = await prisma.roomItem.findFirst({
        where: { roomId, productId: Number(productId) }
      });
      if (existingItem) {
        return res.status(400).json({ error: "Item is already in this room" });
      }

      // 3. Add Item to Room
      const newItem = await prisma.roomItem.create({
        data: {
          roomId,
          productId: Number(productId),
          addedBy: userName || "Member"
        },
        include: { product: { include: { images: true, brand: true } } }
      });

      // (Note for real-time: Frontend ne image mein mention kiya hai ki io.emit use karna hai. 
      // Express router mein directly socket use karna mushkil hota hai agar io ko yaha pass na kiya ho. 
      // Abhi hum data bhej rahe hain, aur frontend jab yeh successful response receive karega toh 
      // woh directly client-side socket socket.emit('item_added', ...) se update bhej sakta hai)
      
      res.status(201).json({ success: true, item: newItem });
    } catch (error) {
      console.error("Add Room Item Error:", error);
      if (error.message === "Unauthorized") return res.status(401).json({ error: "Unauthorized" });
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  return router;
};