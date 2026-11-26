// const express = require('express');
// const jwt = require('jsonwebtoken');

// module.exports = function (prisma) {
//   const router = express.Router();

//   // --- JWT Helper ---
//   function getUserIdFromToken(req) {
//     const authHeader = req.headers.authorization;
//     if (!authHeader) throw new Error("Unauthorized");
//     const token = authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : authHeader;
//     const decoded = jwt.verify(token, process.env.JWT_SECRET);
//     return Number(decoded.id || decoded.userId);
//   }

//   // 🚀 Helper to clean Room ID if full WhatsApp URL is pasted
//   function cleanRoomId(id) {
//     if (!id) return '';
//     let cleaned = String(id).trim();
//     if (cleaned.includes('syvora.in/room/')) {
//       const parts = cleaned.split('syvora.in/room/');
//       cleaned = parts[1] || cleaned;
//     }
//     if (cleaned.includes('/')) {
//       const parts = cleaned.split('/');
//       cleaned = parts[parts.length - 1];
//     }
//     return cleaned.split('?')[0].trim();
//   }

//   // =========================================================================
//   // 1. CREATE A NEW SHOPPING ROOM
//   // =========================================================================
//   router.post('/rooms/create', async (req, res) => {
//     try {
//       const userId = getUserIdFromToken(req);
//       const { userName, initialProductId, initialProductIds } = req.body;

//       const room = await prisma.shoppingRoom.create({
//         data: {
//           creatorId: userId,
//           members: {
//             create: {
//               userId,
//               userName: userName || "Host"
//             }
//           }
//         },
//         include: { members: true, items: { include: { product: { include: { images: true } } } }, comments: true }
//       });

//       if (initialProductId) {
//         await prisma.roomItem.create({
//           data: {
//             roomId: room.id,
//             productId: Number(initialProductId),
//             addedBy: userName || "Host"
//           }
//         });
//       }

//       if (Array.isArray(initialProductIds) && initialProductIds.length > 0) {
//         const itemsToCreate = initialProductIds.map(pId => ({
//           roomId: room.id,
//           productId: Number(pId),
//           addedBy: userName || "Host"
//         }));

//         await prisma.roomItem.createMany({
//           data: itemsToCreate,
//           skipDuplicates: true
//         });
//       }

//       const updatedRoom = await prisma.shoppingRoom.findUnique({
//         where: { id: room.id },
//         include: {
//           members: true,
//           items: { include: { product: { include: { images: true, brand: true } } } },
//           comments: { orderBy: { createdAt: 'asc' } }
//         }
//       });

//       res.status(201).json({
//         success: true,
//         roomId: room.id,
//         shareUrl: `https://syvora.in/room/${room.id}`,
//         room: updatedRoom
//       });
//     } catch (error) {
//       console.error("Create Room Error:", error);
//       if (error.message === "Unauthorized") return res.status(401).json({ error: "Unauthorized" });
//       res.status(500).json({ error: "Internal Server Error" });
//     }
//   });

//   // =========================================================================
//   // 2. GET ROOM DETAILS
//   // =========================================================================
//   router.get('/rooms/:roomId', async (req, res) => {
//     try {
//       const roomId = cleanRoomId(req.params.roomId);

//       const room = await prisma.shoppingRoom.findUnique({
//         where: { id: roomId },
//         include: {
//           members: true,
//           items: { include: { product: { include: { images: true, brand: true } } } },
//           comments: { orderBy: { createdAt: 'asc' } }
//         }
//       });

//       if (!room || !room.isActive) {
//         return res.status(404).json({ error: "Shopping room not found or expired" });
//       }

//       res.json({ success: true, room });
//     } catch (error) {
//       console.error("Get Room Error:", error);
//       res.status(500).json({ error: "Internal Server Error" });
//     }
//   });

//   // =========================================================================
//   // 3. DYNAMICALLY ADD ITEM TO EXISTING ROOM
//   // =========================================================================
//   router.post('/rooms/:roomId/add-item', async (req, res) => {
//     try {
//       const roomId = cleanRoomId(req.params.roomId);
//       const { productId, userName } = req.body;
//       getUserIdFromToken(req);

//       if (!productId) {
//         return res.status(400).json({ error: "Product ID is required" });
//       }

//       const room = await prisma.shoppingRoom.findUnique({ where: { id: roomId } });
//       if (!room || !room.isActive) {
//         return res.status(404).json({ error: "Shopping room not found or expired" });
//       }

//       const existingItem = await prisma.roomItem.findFirst({
//         where: { roomId, productId: Number(productId) }
//       });
//       if (existingItem) {
//         return res.status(400).json({ error: "Item is already in this room" });
//       }

//       const newItem = await prisma.roomItem.create({
//         data: {
//           roomId,
//           productId: Number(productId),
//           addedBy: userName || "Member"
//         },
//         include: { product: { include: { images: true, brand: true } } }
//       });
      
//       res.status(201).json({ success: true, item: newItem });
//     } catch (error) {
//       console.error("Add Room Item Error:", error);
//       if (error.message === "Unauthorized") return res.status(401).json({ error: "Unauthorized" });
//       res.status(500).json({ error: "Internal Server Error" });
//     }
//   });

//   // =========================================================================
//   // 4. JOIN AN EXISTING SHOPPING ROOM
//   // =========================================================================
//   router.post('/rooms/:roomId/join', async (req, res) => {
//     try {
//       const roomId = cleanRoomId(req.params.roomId);
//       const { userName } = req.body;
//       const userId = getUserIdFromToken(req);

//       const room = await prisma.shoppingRoom.findUnique({
//         where: { id: roomId },
//         include: { members: true }
//       });

//       if (!room || !room.isActive) {
//         return res.status(404).json({ error: "Shopping room not found or expired" });
//       }

//       await prisma.roomMember.upsert({
//         where: {
//           roomId_userId: {
//             roomId,
//             userId
//           }
//         },
//         update: {
//           userName: userName || "Member"
//         },
//         create: {
//           roomId,
//           userId,
//           userName: userName || "Member"
//         }
//       });

//       const updatedRoom = await prisma.shoppingRoom.findUnique({
//         where: { id: roomId },
//         include: {
//           members: true,
//           items: { include: { product: { include: { images: true, brand: true } } } },
//           comments: { orderBy: { createdAt: 'asc' } }
//         }
//       });

//       res.json({ success: true, room: updatedRoom });
//     } catch (error) {
//       console.error("Join Room Error:", error);
//       if (error.message === "Unauthorized") return res.status(401).json({ error: "Unauthorized" });
//       res.status(500).json({ error: "Internal Server Error" });
//     }
//   });

//   // =========================================================================
//   // 5. REMOVE ITEM FROM SHOPPING ROOM
//   // =========================================================================
//   router.delete('/rooms/:roomId/product/:productId', async (req, res) => {
//     try {
//       const roomId = cleanRoomId(req.params.roomId);
//       const { productId } = req.params;
//       getUserIdFromToken(req); // Ensure user is authenticated

//       if (!productId) {
//         return res.status(400).json({ error: "Product ID is required" });
//       }

//       // Check if room exists and is active
//       const room = await prisma.shoppingRoom.findUnique({ where: { id: roomId } });
//       if (!room || !room.isActive) {
//         return res.status(404).json({ error: "Shopping room not found or expired" });
//       }

//       // Delete the specific item from the room
//       const deletedItem = await prisma.roomItem.deleteMany({
//         where: {
//           roomId: roomId,
//           productId: Number(productId)
//         }
//       });

//       if (deletedItem.count === 0) {
//         return res.status(404).json({ error: "Item not found in this room" });
//       }

//       res.json({ 
//         success: true, 
//         message: "Product removed from room successfully", 
//         productId: Number(productId) 
//       });
//     } catch (error) {
//       console.error("Remove Room Item Error:", error);
//       if (error.message === "Unauthorized") return res.status(401).json({ error: "Unauthorized" });
//       res.status(500).json({ error: "Internal Server Error" });
//     }
//   });

//   return router;
// };

























// const express = require('express');
// const jwt = require('jsonwebtoken');

// module.exports = function (prisma, io = null) {
//   const router = express.Router();

//   // --- JWT Helper ---
//   function getUserIdFromToken(req) {
//     const authHeader = req.headers.authorization;
//     if (!authHeader) throw new Error("Unauthorized");
//     const token = authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : authHeader;
//     const decoded = jwt.verify(token, process.env.JWT_SECRET);
//     return Number(decoded.id || decoded.userId);
//   }

//   // Helper to clean Room ID if full WhatsApp URL is pasted
//   function cleanRoomId(id) {
//     if (!id) return '';
//     let cleaned = String(id).trim();
//     if (cleaned.includes('syvora.in/room/')) {
//       const parts = cleaned.split('syvora.in/room/');
//       cleaned = parts[1] || cleaned;
//     }
//     if (cleaned.includes('/')) {
//       const parts = cleaned.split('/');
//       cleaned = parts[parts.length - 1];
//     }
//     return cleaned.split('?')[0].trim();
//   }

//   function normalizeSplitMode(mode) {
//     return String(mode || 'EQUAL').toUpperCase() === 'ITEM_WISE' ? 'ITEM_WISE' : 'EQUAL';
//   }

//   async function loadRoomDetails(roomId) {
//     return prisma.shoppingRoom.findUnique({
//       where: { id: roomId },
//       include: {
//         members: true,
//         items: {
//           include: {
//             product: { include: { images: true, brand: true } },
//             assignedUser: {
//               select: {
//                 id: true,
//                 profile: { select: { name: true } }
//               }
//             }
//           }
//         },
//         comments: { orderBy: { createdAt: 'asc' } },
//         orders: {
//           orderBy: { createdAt: 'desc' },
//           take: 5,
//           select: {
//             id: true,
//             userId: true,
//             status: true,
//             totalAmount: true,
//             createdAt: true
//           }
//         }
//       }
//     });
//   }

//   // =========================================================================
//   // 1. CREATE A NEW SHOPPING ROOM
//   // =========================================================================
//   router.post('/rooms/create', async (req, res) => {
//     try {
//       const userId = getUserIdFromToken(req);
//       const { userName, initialProductId, initialProductIds, splitMode } = req.body;

//       const room = await prisma.shoppingRoom.create({
//         data: {
//           creatorId: userId,
//           splitMode: normalizeSplitMode(splitMode),
//           members: {
//             create: {
//               userId,
//               userName: userName || "Host"
//             }
//           }
//         }
//       });

//       if (initialProductId) {
//         await prisma.roomItem.create({
//           data: {
//             roomId: room.id,
//             productId: Number(initialProductId),
//             addedBy: userName || "Host"
//           }
//         });
//       }

//       if (Array.isArray(initialProductIds) && initialProductIds.length > 0) {
//         const itemsToCreate = initialProductIds
//           .map((pId) => Number(pId))
//           .filter((pId) => Number.isInteger(pId) && pId > 0)
//           .map((pId) => ({
//             roomId: room.id,
//             productId: pId,
//             addedBy: userName || "Host"
//           }));

//         if (itemsToCreate.length > 0) {
//           await prisma.roomItem.createMany({
//             data: itemsToCreate,
//             skipDuplicates: true
//           });
//         }
//       }

//       const updatedRoom = await loadRoomDetails(room.id);

//       res.status(201).json({
//         success: true,
//         roomId: room.id,
//         shareUrl: `https://syvora.in/room/${room.id}`,
//         room: updatedRoom
//       });
//     } catch (error) {
//       console.error("Create Room Error:", error);
//       if (error.message === "Unauthorized") return res.status(401).json({ error: "Unauthorized" });
//       res.status(500).json({ error: "Internal Server Error" });
//     }
//   });

//   // =========================================================================
//   // 2. GET ROOM DETAILS
//   // =========================================================================
//   router.get('/rooms/:roomId', async (req, res) => {
//     try {
//       const roomId = cleanRoomId(req.params.roomId);
//       const room = await loadRoomDetails(roomId);

//       if (!room || !room.isActive) {
//         return res.status(404).json({ error: "Shopping room not found or expired" });
//       }

//       res.json({ success: true, room });
//     } catch (error) {
//       console.error("Get Room Error:", error);
//       res.status(500).json({ error: "Internal Server Error" });
//     }
//   });

//   // =========================================================================
//   // 3. SWITCH SPLIT PREVIEW MODE (EQUAL vs ITEM_WISE)
//   // =========================================================================
//   router.patch('/rooms/:roomId/split-mode', async (req, res) => {
//     try {
//       const roomId = cleanRoomId(req.params.roomId);
//       getUserIdFromToken(req);

//       const rawMode = String(req.body?.splitMode || '').toUpperCase();
//       if (!['EQUAL', 'ITEM_WISE'].includes(rawMode)) {
//         return res.status(400).json({ error: "splitMode must be EQUAL or ITEM_WISE" });
//       }

//       const room = await prisma.shoppingRoom.findUnique({ where: { id: roomId } });
//       if (!room || !room.isActive) {
//         return res.status(404).json({ error: "Shopping room not found or expired" });
//       }

//       const updated = await prisma.shoppingRoom.update({
//         where: { id: roomId },
//         data: { splitMode: rawMode }
//       });

//       if (io) {
//         io.to(roomId).emit('split_mode_changed', { roomId, splitMode: updated.splitMode });
//       }

//       res.json({ success: true, splitMode: updated.splitMode });
//     } catch (error) {
//       console.error("Update Split Mode Error:", error);
//       if (error.message === "Unauthorized") return res.status(401).json({ error: "Unauthorized" });
//       res.status(500).json({ error: "Internal Server Error" });
//     }
//   });

//   // =========================================================================
//   // 4. DYNAMICALLY ADD ITEM TO EXISTING ROOM
//   // =========================================================================
//   router.post('/rooms/:roomId/add-item', async (req, res) => {
//     try {
//       const roomId = cleanRoomId(req.params.roomId);
//       const { productId, userName, assignedUserId } = req.body;
//       getUserIdFromToken(req);

//       if (!productId) {
//         return res.status(400).json({ error: "Product ID is required" });
//       }

//       const room = await prisma.shoppingRoom.findUnique({ where: { id: roomId } });
//       if (!room || !room.isActive) {
//         return res.status(404).json({ error: "Shopping room not found or expired" });
//       }

//       const existingItem = await prisma.roomItem.findFirst({
//         where: { roomId, productId: Number(productId) }
//       });
//       if (existingItem) {
//         return res.status(400).json({ error: "Item is already in this room" });
//       }

//       const newItem = await prisma.roomItem.create({
//         data: {
//           roomId,
//           productId: Number(productId),
//           addedBy: userName || "Member",
//           assignedUserId:
//             assignedUserId !== undefined && assignedUserId !== null && assignedUserId !== ''
//               ? Number(assignedUserId)
//               : null
//         },
//         include: {
//           product: { include: { images: true, brand: true } },
//           assignedUser: {
//             select: {
//               id: true,
//               profile: { select: { name: true } }
//             }
//           }
//         }
//       });

//       if (io) {
//         io.to(roomId).emit('item_added', newItem);
//       }

//       res.status(201).json({ success: true, item: newItem });
//     } catch (error) {
//       console.error("Add Room Item Error:", error);
//       if (error.message === "Unauthorized") return res.status(401).json({ error: "Unauthorized" });
//       res.status(500).json({ error: "Internal Server Error" });
//     }
//   });

//   // =========================================================================
//   // 5. ASSIGN ITEM TO A MEMBER FOR ITEM-WISE SPLIT PREVIEW
//   // =========================================================================
//   router.patch('/rooms/:roomId/items/:itemId/assign', async (req, res) => {
//     try {
//       const roomId = cleanRoomId(req.params.roomId);
//       const itemId = Number(req.params.itemId);
//       getUserIdFromToken(req);

//       if (!Number.isInteger(itemId) || itemId <= 0) {
//         return res.status(400).json({ error: "Invalid room item ID" });
//       }

//       const room = await prisma.shoppingRoom.findUnique({ where: { id: roomId } });
//       if (!room || !room.isActive) {
//         return res.status(404).json({ error: "Shopping room not found or expired" });
//       }

//       const roomItem = await prisma.roomItem.findFirst({
//         where: { id: itemId, roomId }
//       });
//       if (!roomItem) {
//         return res.status(404).json({ error: "Item not found in this room" });
//       }

//       const rawAssignee = req.body?.assignedUserId;
//       let nextAssigneeId = null;

//       if (rawAssignee !== null && rawAssignee !== undefined && rawAssignee !== '') {
//         nextAssigneeId = Number(rawAssignee);
//         if (!Number.isInteger(nextAssigneeId) || nextAssigneeId <= 0) {
//           return res.status(400).json({ error: "Invalid assignedUserId" });
//         }

//         const isMember = await prisma.roomMember.findUnique({
//           where: {
//             roomId_userId: {
//               roomId,
//               userId: nextAssigneeId
//             }
//           }
//         });
//         if (!isMember) {
//           return res.status(400).json({ error: "Selected user is not a member of this room" });
//         }
//       }

//       const updatedItem = await prisma.roomItem.update({
//         where: { id: itemId },
//         data: { assignedUserId: nextAssigneeId },
//         include: {
//           product: { include: { images: true, brand: true } },
//           assignedUser: {
//             select: {
//               id: true,
//               profile: { select: { name: true } }
//             }
//           }
//         }
//       });

//       if (io) {
//         io.to(roomId).emit('item_assigned', { roomId, item: updatedItem });
//       }

//       res.json({ success: true, item: updatedItem });
//     } catch (error) {
//       console.error("Assign Room Item Error:", error);
//       if (error.message === "Unauthorized") return res.status(401).json({ error: "Unauthorized" });
//       res.status(500).json({ error: "Internal Server Error" });
//     }
//   });

//   // =========================================================================
//   // 6. JOIN AN EXISTING SHOPPING ROOM
//   // =========================================================================
//   router.post('/rooms/:roomId/join', async (req, res) => {
//     try {
//       const roomId = cleanRoomId(req.params.roomId);
//       const { userName } = req.body;
//       const userId = getUserIdFromToken(req);

//       const room = await prisma.shoppingRoom.findUnique({
//         where: { id: roomId },
//         include: { members: true }
//       });

//       if (!room || !room.isActive) {
//         return res.status(404).json({ error: "Shopping room not found or expired" });
//       }

//       await prisma.roomMember.upsert({
//         where: {
//           roomId_userId: {
//             roomId,
//             userId
//           }
//         },
//         update: {
//           userName: userName || "Member"
//         },
//         create: {
//           roomId,
//           userId,
//           userName: userName || "Member"
//         }
//       });

//       const updatedRoom = await loadRoomDetails(roomId);

//       res.json({ success: true, room: updatedRoom });
//     } catch (error) {
//       console.error("Join Room Error:", error);
//       if (error.message === "Unauthorized") return res.status(401).json({ error: "Unauthorized" });
//       res.status(500).json({ error: "Internal Server Error" });
//     }
//   });

//   // =========================================================================
//   // 7. REMOVE ITEM FROM SHOPPING ROOM
//   // =========================================================================
//   router.delete('/rooms/:roomId/product/:productId', async (req, res) => {
//     try {
//       const roomId = cleanRoomId(req.params.roomId);
//       const { productId } = req.params;
//       getUserIdFromToken(req);

//       if (!productId) {
//         return res.status(400).json({ error: "Product ID is required" });
//       }

//       const room = await prisma.shoppingRoom.findUnique({ where: { id: roomId } });
//       if (!room || !room.isActive) {
//         return res.status(404).json({ error: "Shopping room not found or expired" });
//       }

//       const deletedItem = await prisma.roomItem.deleteMany({
//         where: {
//           roomId,
//           productId: Number(productId)
//         }
//       });

//       if (deletedItem.count === 0) {
//         return res.status(404).json({ error: "Item not found in this room" });
//       }

//       if (io) {
//         io.to(roomId).emit('item_removed', { roomId, productId: Number(productId) });
//       }

//       res.json({
//         success: true,
//         message: "Product removed from room successfully",
//         productId: Number(productId)
//       });
//     } catch (error) {
//       console.error("Remove Room Item Error:", error);
//       if (error.message === "Unauthorized") return res.status(401).json({ error: "Unauthorized" });
//       res.status(500).json({ error: "Internal Server Error" });
//     }
//   });

//   return router;
// };






















const express = require('express');
const jwt = require('jsonwebtoken');

module.exports = function (prisma, io = null) {
  const router = express.Router();

  // --- JWT Helper ---
  function getUserIdFromToken(req) {
    const authHeader = req.headers.authorization;
    if (!authHeader) throw new Error("Unauthorized");
    const token = authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : authHeader;
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const id = Number(decoded.id || decoded.userId);
    if (!Number.isInteger(id) || id <= 0) throw new Error("Unauthorized");
    return id;
  }

  function isUnauthorizedError(error) {
    return (
      error?.message === "Unauthorized" ||
      error?.name === "JsonWebTokenError" ||
      error?.name === "TokenExpiredError"
    );
  }

  function parsePositiveInt(val) {
    const num = Number(val);
    return Number.isInteger(num) && num > 0 ? num : null;
  }

  async function isRoomParticipant(room, userId) {
    if (!room || !userId) return false;
    if (Number(room.creatorId) === Number(userId)) return true;
    const member = await prisma.roomMember.findUnique({
      where: {
        roomId_userId: {
          roomId: room.id,
          userId: Number(userId)
        }
      },
      select: { userId: true }
    });
    return Boolean(member);
  }

  // Helper to clean Room ID if full WhatsApp URL is pasted
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

  function normalizeSplitMode(mode) {
    return String(mode || 'EQUAL').toUpperCase() === 'ITEM_WISE' ? 'ITEM_WISE' : 'EQUAL';
  }

  async function loadRoomDetails(roomId) {
    return prisma.shoppingRoom.findUnique({
      where: { id: roomId },
      include: {
        members: true,
        items: {
          include: {
            product: { include: { images: true, brand: true } },
            assignedUser: {
              select: {
                id: true,
                profile: { select: { name: true } }
              }
            }
          }
        },
        comments: { orderBy: { createdAt: 'asc' } },
        orders: {
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: {
            id: true,
            userId: true,
            status: true,
            totalAmount: true,
            createdAt: true
          }
        }
      }
    });
  }

  // =========================================================================
  // 1. CREATE A NEW SHOPPING ROOM
  // =========================================================================
  router.post('/rooms/create', async (req, res) => {
    try {
      const userId = getUserIdFromToken(req);
      const { userName, initialProductId, initialProductIds, splitMode } = req.body || {};

      const room = await prisma.shoppingRoom.create({
        data: {
          creatorId: userId,
          splitMode: normalizeSplitMode(splitMode),
          members: {
            create: {
              userId,
              userName: userName || "Host"
            }
          }
        }
      });

      const singleProductId = parsePositiveInt(initialProductId);
      if (singleProductId) {
        await prisma.roomItem.create({
          data: {
            roomId: room.id,
            productId: singleProductId,
            addedBy: userName || "Host"
          }
        });
      }

      if (Array.isArray(initialProductIds) && initialProductIds.length > 0) {
        const itemsToCreate = initialProductIds
          .map((pId) => parsePositiveInt(pId))
          .filter((pId) => Boolean(pId))
          .map((pId) => ({
            roomId: room.id,
            productId: pId,
            addedBy: userName || "Host"
          }));

        if (itemsToCreate.length > 0) {
          await prisma.roomItem.createMany({
            data: itemsToCreate,
            skipDuplicates: true
          });
        }
      }

      const updatedRoom = await loadRoomDetails(room.id);

      res.status(201).json({
        success: true,
        roomId: room.id,
        shareUrl: `https://syvora.in/room/${room.id}`,
        room: updatedRoom
      });
    } catch (error) {
      console.error("Create Room Error:", error);
      if (isUnauthorizedError(error)) return res.status(401).json({ error: "Unauthorized" });
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  // =========================================================================
  // 2. GET ROOM DETAILS (Participant Protected)
  // =========================================================================
  router.get('/rooms/:roomId', async (req, res) => {
    try {
      const userId = getUserIdFromToken(req);
      const roomId = cleanRoomId(req.params.roomId);
      const room = await loadRoomDetails(roomId);

      if (!room || !room.isActive) {
        return res.status(404).json({ error: "Shopping room not found or expired" });
      }

      if (!(await isRoomParticipant(room, userId))) {
        return res.status(403).json({ error: "Join the room first to view room details" });
      }

      res.json({ success: true, room });
    } catch (error) {
      console.error("Get Room Error:", error);
      if (isUnauthorizedError(error)) return res.status(401).json({ error: "Unauthorized" });
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  // =========================================================================
  // 3. SWITCH SPLIT PREVIEW MODE (EQUAL vs ITEM_WISE)
  // =========================================================================
  router.patch('/rooms/:roomId/split-mode', async (req, res) => {
    try {
      const roomId = cleanRoomId(req.params.roomId);
      const userId = getUserIdFromToken(req);

      const rawMode = String(req.body?.splitMode || '').toUpperCase();
      if (!['EQUAL', 'ITEM_WISE'].includes(rawMode)) {
        return res.status(400).json({ error: "splitMode must be EQUAL or ITEM_WISE" });
      }

      const room = await prisma.shoppingRoom.findUnique({ where: { id: roomId } });
      if (!room || !room.isActive) {
        return res.status(404).json({ error: "Shopping room not found or expired" });
      }

      if (!(await isRoomParticipant(room, userId))) {
        return res.status(403).json({ error: "Only room members can update split mode" });
      }

      const updated = await prisma.shoppingRoom.update({
        where: { id: roomId },
        data: { splitMode: rawMode }
      });

      if (io) {
        io.to(roomId).emit('split_mode_changed', { roomId, splitMode: updated.splitMode });
      }

      res.json({ success: true, splitMode: updated.splitMode });
    } catch (error) {
      console.error("Update Split Mode Error:", error);
      if (isUnauthorizedError(error)) return res.status(401).json({ error: "Unauthorized" });
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  // =========================================================================
  // 4. DYNAMICALLY ADD ITEM TO EXISTING ROOM
  // =========================================================================
  router.post('/rooms/:roomId/add-item', async (req, res) => {
    try {
      const roomId = cleanRoomId(req.params.roomId);
      const { productId, userName, assignedUserId } = req.body || {};
      const userId = getUserIdFromToken(req);

      const productIdNum = parsePositiveInt(productId);
      if (!productIdNum) {
        return res.status(400).json({ error: "Valid Product ID is required" });
      }

      const room = await prisma.shoppingRoom.findUnique({ where: { id: roomId } });
      if (!room || !room.isActive) {
        return res.status(404).json({ error: "Shopping room not found or expired" });
      }

      if (!(await isRoomParticipant(room, userId))) {
        return res.status(403).json({ error: "Only room members can add items to this room" });
      }

      const existingItem = await prisma.roomItem.findFirst({
        where: { roomId, productId: productIdNum }
      });
      if (existingItem) {
        return res.status(400).json({ error: "Item is already in this room" });
      }

      let nextAssigneeId = null;
      if (assignedUserId !== undefined && assignedUserId !== null && assignedUserId !== '') {
        nextAssigneeId = parsePositiveInt(assignedUserId);
        if (!nextAssigneeId) {
          return res.status(400).json({ error: "Invalid assignedUserId" });
        }
        const isMember = await prisma.roomMember.findUnique({
          where: {
            roomId_userId: {
              roomId,
              userId: nextAssigneeId
            }
          }
        });
        if (!isMember) {
          return res.status(400).json({ error: "Selected user is not a member of this room" });
        }
      }

      const newItem = await prisma.roomItem.create({
        data: {
          roomId,
          productId: productIdNum,
          addedBy: userName || "Member",
          assignedUserId: nextAssigneeId
        },
        include: {
          product: { include: { images: true, brand: true } },
          assignedUser: {
            select: {
              id: true,
              profile: { select: { name: true } }
            }
          }
        }
      });

      if (io) {
        io.to(roomId).emit('item_added', newItem);
      }

      res.status(201).json({ success: true, item: newItem });
    } catch (error) {
      console.error("Add Room Item Error:", error);
      if (isUnauthorizedError(error)) return res.status(401).json({ error: "Unauthorized" });
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  // =========================================================================
  // 5. ASSIGN ITEM TO A MEMBER FOR ITEM-WISE SPLIT PREVIEW
  // =========================================================================
  router.patch('/rooms/:roomId/items/:itemId/assign', async (req, res) => {
    try {
      const roomId = cleanRoomId(req.params.roomId);
      const itemId = parsePositiveInt(req.params.itemId);
      const userId = getUserIdFromToken(req);

      if (!itemId) {
        return res.status(400).json({ error: "Invalid room item ID" });
      }

      const room = await prisma.shoppingRoom.findUnique({ where: { id: roomId } });
      if (!room || !room.isActive) {
        return res.status(404).json({ error: "Shopping room not found or expired" });
      }

      if (!(await isRoomParticipant(room, userId))) {
        return res.status(403).json({ error: "Only room members can assign items in this room" });
      }

      const roomItem = await prisma.roomItem.findFirst({
        where: { id: itemId, roomId }
      });
      if (!roomItem) {
        return res.status(404).json({ error: "Item not found in this room" });
      }

      const rawAssignee = req.body?.assignedUserId;
      let nextAssigneeId = null;

      if (rawAssignee !== null && rawAssignee !== undefined && rawAssignee !== '') {
        nextAssigneeId = parsePositiveInt(rawAssignee);
        if (!nextAssigneeId) {
          return res.status(400).json({ error: "Invalid assignedUserId" });
        }

        const isMember = await prisma.roomMember.findUnique({
          where: {
            roomId_userId: {
              roomId,
              userId: nextAssigneeId
            }
          }
        });
        if (!isMember) {
          return res.status(400).json({ error: "Selected user is not a member of this room" });
        }
      }

      const updatedItem = await prisma.roomItem.update({
        where: { id: itemId },
        data: { assignedUserId: nextAssigneeId },
        include: {
          product: { include: { images: true, brand: true } },
          assignedUser: {
            select: {
              id: true,
              profile: { select: { name: true } }
            }
          }
        }
      });

      if (io) {
        io.to(roomId).emit('item_assigned', { roomId, item: updatedItem });
      }

      res.json({ success: true, item: updatedItem });
    } catch (error) {
      console.error("Assign Room Item Error:", error);
      if (isUnauthorizedError(error)) return res.status(401).json({ error: "Unauthorized" });
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  // =========================================================================
  // 6. JOIN AN EXISTING SHOPPING ROOM
  // =========================================================================
  router.post('/rooms/:roomId/join', async (req, res) => {
    try {
      const roomId = cleanRoomId(req.params.roomId);
      const { userName } = req.body || {};
      const userId = getUserIdFromToken(req);

      const room = await prisma.shoppingRoom.findUnique({
        where: { id: roomId },
        include: { members: true }
      });

      if (!room || !room.isActive) {
        return res.status(404).json({ error: "Shopping room not found or expired" });
      }

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

      const updatedRoom = await loadRoomDetails(roomId);

      res.json({ success: true, room: updatedRoom });
    } catch (error) {
      console.error("Join Room Error:", error);
      if (isUnauthorizedError(error)) return res.status(401).json({ error: "Unauthorized" });
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  // =========================================================================
  // 7. REMOVE ITEM FROM SHOPPING ROOM
  // =========================================================================
  router.delete('/rooms/:roomId/product/:productId', async (req, res) => {
    try {
      const roomId = cleanRoomId(req.params.roomId);
      const productIdNum = parsePositiveInt(req.params.productId);
      const userId = getUserIdFromToken(req);

      if (!productIdNum) {
        return res.status(400).json({ error: "Valid Product ID is required" });
      }

      const room = await prisma.shoppingRoom.findUnique({ where: { id: roomId } });
      if (!room || !room.isActive) {
        return res.status(404).json({ error: "Shopping room not found or expired" });
      }

      if (!(await isRoomParticipant(room, userId))) {
        return res.status(403).json({ error: "Only room members can remove items from this room" });
      }

      const deletedItem = await prisma.roomItem.deleteMany({
        where: {
          roomId,
          productId: productIdNum
        }
      });

      if (deletedItem.count === 0) {
        return res.status(404).json({ error: "Item not found in this room" });
      }

      if (io) {
        io.to(roomId).emit('item_removed', { roomId, productId: productIdNum });
      }

      res.json({
        success: true,
        message: "Product removed from room successfully",
        productId: productIdNum
      });
    } catch (error) {
      console.error("Remove Room Item Error:", error);
      if (isUnauthorizedError(error)) return res.status(401).json({ error: "Unauthorized" });
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  return router;
};