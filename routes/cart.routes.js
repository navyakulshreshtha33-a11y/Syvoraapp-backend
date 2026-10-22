// const express = require('express');

// module.exports = (prisma, verifyAdmin) => {
//   const router = express.Router();

//   // ==========================================
//   // CART APIS
//   // ==========================================

//   // 1. GET CART WITH DYNAMIC BILL SUMMARY
//   router.get('/cart/:userId', async (req, res) => {
//     try {
//       const userId = Number(req.params.userId);

//       let config = await prisma.storeConfig.findUnique({ where: { id: 1 } });
//       if (!config) {
//         config = await prisma.storeConfig.create({
//           data: { id: 1, gstRate: 5.0, deliveryFee: 49.0, freeDeliveryThreshold: 999.0 }
//         });
//       }

//       let cart = await prisma.cart.findUnique({
//         where: { userId },
//         include: {
//           items: {
//             include: {
//               product: { include: { brand: true, images: true } }
//             }
//           }
//         }
//       });

//       if (!cart) {
//         return res.json({
//           id: null,
//           userId,
//           items: [],
//           billSummary: {
//             subtotal: 0,
//             deliveryFee: 0,
//             isFreeDelivery: false,
//             freeDeliveryThreshold: config.freeDeliveryThreshold,
//             gstRate: `${config.gstRate}%`,
//             gstAmount: 0,
//             grandTotal: 0
//           }
//         });
//       }

//       if (cart.items.length === 0) {
//         return res.json({
//           ...cart,
//           billSummary: {
//             subtotal: 0,
//             deliveryFee: 0,
//             isFreeDelivery: false,
//             freeDeliveryThreshold: config.freeDeliveryThreshold,
//             gstRate: `${config.gstRate}%`,
//             gstAmount: 0,
//             grandTotal: 0
//           }
//         });
//       }

//       const subtotal = cart.items.reduce((sum, item) => {
//         return sum + (item.product.price * item.quantity);
//       }, 0);

//       const deliveryFee = subtotal >= config.freeDeliveryThreshold ? 0 : config.deliveryFee;
//       const gstAmount = Number((subtotal * (config.gstRate / 100)).toFixed(2));
//       const grandTotal = Number((subtotal + deliveryFee + gstAmount).toFixed(2));

//       res.json({
//         ...cart,
//         billSummary: {
//           subtotal: Number(subtotal.toFixed(2)),
//           deliveryFee,
//           isFreeDelivery: deliveryFee === 0,
//           freeDeliveryThreshold: config.freeDeliveryThreshold,
//           gstRate: `${config.gstRate}%`,
//           gstAmount,
//           grandTotal
//         }
//       });
//     } catch (error) {
//       console.error("Get Cart Error:", error);
//       res.status(500).json({ error: "Internal Server Error" });
//     }
//   });

//   // 2. ADD TO CART
//   router.post('/cart/add', async (req, res) => {
//     console.log("FRONTEND SE AYA",req.body);
//     try {
//       const { userId, productId, quantity, size } = req.body;
//       if (!userId || !productId) {
//         return res.status(400).json({ error: "userId and productId required" });
//       }

//       let cart = await prisma.cart.findUnique({ where: { userId: Number(userId) } });
//       if (!cart) cart = await prisma.cart.create({ data: { userId: Number(userId) } });

//       const existingItem = await prisma.cartItem.findFirst({
//         where: { cartId: cart.id, productId: Number(productId), size: size || null }
//       });

//       let cartItem;
//       if (existingItem) {
//         cartItem = await prisma.cartItem.update({
//           where: { id: existingItem.id },
//           data: { quantity: existingItem.quantity + (quantity ? Number(quantity) : 1) }
//         });
//       } else {
//         cartItem = await prisma.cartItem.create({
//           data: {
//             cartId: cart.id,
//             productId: Number(productId),
//             quantity: quantity ? Number(quantity) : 1,
//             size: size || null
//           }
//         });
//       }
//       res.status(201).json({ message: "Item added to cart successfully!", cartItem });
//     } catch (error) {
//       console.error("Add to Cart Error:", error);
//       res.status(500).json({ error: "Internal Server Error" });
//     }
//   });

//   // 3. QUANTITY INCREMENT / DECREMENT
//   router.patch('/cart/item/:itemId', async (req, res) => {
//     try {
//       const itemId = Number(req.params.itemId);
//       const { action } = req.body;

//       const item = await prisma.cartItem.findUnique({ where: { id: itemId } });
//       if (!item) {
//         return res.status(404).json({ error: "Cart item not found" });
//       }

//       let newQuantity = item.quantity;
//       if (action === "INCREMENT") newQuantity += 1;
//       else if (action === "DECREMENT") newQuantity -= 1;

//       if (newQuantity <= 0) {
//         await prisma.cartItem.delete({ where: { id: itemId } });
//         return res.json({ message: "Item removed from cart" });
//       }

//       const updatedItem = await prisma.cartItem.update({
//         where: { id: itemId },
//         data: { quantity: newQuantity }
//       });

//       res.json({ message: "Quantity updated", cartItem: updatedItem });
//     } catch (error) {
//       console.error("Update Cart Item Quantity Error:", error);
//       res.status(500).json({ error: "Internal Server Error" });
//     }
//   });

//   // 4. REMOVE ITEM FROM CART
//   router.delete('/cart/item/:itemId', async (req, res) => {
//     try {
//       await prisma.cartItem.delete({ where: { id: Number(req.params.itemId) } });
//       res.json({ message: "Cart item removed successfully!" });
//     } catch (error) {
//       console.error("Remove Cart Item Error:", error);
//       res.status(500).json({ error: "Internal Server Error" });
//     }
//   });

//   // ==========================================
//   // WISHLIST APIS
//   // ==========================================

//   // 5. GET WISHLIST
//   router.get('/wishlist/:userId', async (req, res) => {
//     try {
//       const userId = Number(req.params.userId);
//       let wishlist = await prisma.wishlist.findUnique({
//         where: { userId },
//         include: { items: { include: { product: { include: { brand: true, images: true } } } } }
//       });

//       if (!wishlist) {
//         wishlist = await prisma.wishlist.create({
//           data: { userId },
//           include: { items: { include: { product: { include: { brand: true, images: true } } } } }
//         });
//       }
//       res.json(wishlist);
//     } catch (error) {
//       console.error("Get Wishlist Error:", error);
//       res.status(500).json({ error: "Internal Server Error" });
//     }
//   });

//   // 6. TOGGLE WISHLIST
//   router.post('/wishlist/toggle', async (req, res) => {
//     try {
//       const { userId, productId } = req.body;
//       if (!userId || !productId) return res.status(400).json({ error: "userId and productId required" });

//       let wishlist = await prisma.wishlist.findUnique({ where: { userId: Number(userId) } });
//       if (!wishlist) wishlist = await prisma.wishlist.create({ data: { userId: Number(userId) } });

//       const existingItem = await prisma.wishlistItem.findFirst({
//         where: { wishlistId: wishlist.id, productId: Number(productId) }
//       });

//       if (existingItem) {
//         await prisma.wishlistItem.delete({ where: { id: existingItem.id } });
//         return res.json({ message: "Removed from wishlist", status: "removed" });
//       } else {
//         const newItem = await prisma.wishlistItem.create({
//           data: { wishlistId: wishlist.id, productId: Number(productId) }
//         });
//         return res.status(201).json({ message: "Added to wishlist", status: "added", newItem });
//       }
//     } catch (error) {
//       console.error("Wishlist Toggle Error:", error);
//       res.status(500).json({ error: "Internal Server Error" });
//     }
//   });

//   // ==========================================
//   // STORE CONFIG APIS (Admin Only)
//   // ==========================================

//   // 7. UPDATE GST & DELIVERY CHARGES - NOW PROTECTED
//   router.patch('/cart/admin/config', verifyAdmin, async (req, res) => {
//     try {
//       const { gstRate, deliveryFee, freeDeliveryThreshold } = req.body;

//       const updatedConfig = await prisma.storeConfig.upsert({
//         where: { id: 1 },
//         update: {
//           ...(gstRate !== undefined && { gstRate: Number(gstRate) }),
//           ...(deliveryFee !== undefined && { deliveryFee: Number(deliveryFee) }),
//           ...(freeDeliveryThreshold !== undefined && { freeDeliveryThreshold: Number(freeDeliveryThreshold) })
//         },
//         create: {
//           id: 1,
//           gstRate: gstRate ? Number(gstRate) : 5.0,
//           deliveryFee: deliveryFee ? Number(deliveryFee) : 49.0,
//           freeDeliveryThreshold: freeDeliveryThreshold ? Number(freeDeliveryThreshold) : 999.0
//         }
//       });

//       res.json({ message: "Store settings updated successfully!", config: updatedConfig });
//     } catch (error) {
//       console.error("Update Config Error:", error);
//       res.status(500).json({ error: "Internal Server Error" });
//     }
//   });

//   return router;
// };




















const express = require('express');
const jwt = require('jsonwebtoken');
const { z } = require('zod');

module.exports = (prisma, verifyAdmin) => {
  const router = express.Router();

  // JWT se userId nikalna - IDOR FIX
  function getUserIdFromToken(req){
    const authHeader = req.headers.authorization;
    if(!authHeader) throw new Error("Unauthorized");
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return decoded.id;
  }

  // ZOD - Whitelist fields (Point 16)
  const addSchema = z.object({
    productId: z.number().int().positive(),
    quantity: z.number().int().min(1).max(10).optional().default(1),
    size: z.string().max(10).optional()
  });

  async function getFullCart(userId) {
    let config = await prisma.storeConfig.findUnique({ where: { id: 1 } });
    if (!config) {
      config = await prisma.storeConfig.create({
        data: { id: 1, gstRate: 5.0, deliveryFee: 49.0, freeDeliveryThreshold: 999.0 }
      });
    }
    const cart = await prisma.cart.findUnique({
      where: { userId },
      include: { items: { include: { product: { include: { brand: true, images: true } } } } }
    });
    if (!cart || cart.items.length === 0) {
      return { id: cart?.id || null, userId, items: [], billSummary: { subtotal: 0, deliveryFee: 0, isFreeDelivery: false, freeDeliveryThreshold: config.freeDeliveryThreshold, gstRate: `${config.gstRate}%`, gstAmount: 0, grandTotal: 0 } };
    }
    const subtotal = cart.items.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);
    const deliveryFee = subtotal >= config.freeDeliveryThreshold ? 0 : config.deliveryFee;
    const gstAmount = Number((subtotal * (config.gstRate / 100)).toFixed(2));
    const grandTotal = Number((subtotal + deliveryFee + gstAmount).toFixed(2));
    return { ...cart, billSummary: { subtotal: Number(subtotal.toFixed(2)), deliveryFee, isFreeDelivery: deliveryFee === 0, freeDeliveryThreshold: config.freeDeliveryThreshold, gstRate: `${config.gstRate}%`, gstAmount, grandTotal } };
  }

  // 1. GET CART - IDOR FIX
  router.get('/cart/:userId', async (req, res) => {
    try {
      const tokenUserId = getUserIdFromToken(req);
      const paramUserId = Number(req.params.userId);
      if(tokenUserId !== paramUserId){
        const user = await prisma.user.findUnique({ where: { id: tokenUserId } });
        if(user.role !== 'ADMIN') return res.status(403).json({ error: "Access denied" });
      }
      const cartData = await getFullCart(paramUserId);
      res.json(cartData);
    } catch (error) {
      if(error.message === "Unauthorized") return res.status(401).json({ error: "Invalid token" });
      res.status(500).json({ error: error.message });
    }
  });

  // 2. ADD TO CART - SECURED
  router.post('/cart/add', async (req, res) => {
    try {
      const userId = getUserIdFromToken(req); // body se nahi, token se
      const parsed = addSchema.safeParse(req.body);
      if(!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
      const { productId, quantity, size } = parsed.data;

      const product = await prisma.product.findUnique({ where: { id: Number(productId) } });
      if(!product) return res.status(404).json({ error: "Product not found" });

      const cart = await prisma.cart.upsert({ where: { userId }, update: {}, create: { userId } });

      const existingItem = await prisma.cartItem.findFirst({ where: { cartId: cart.id, productId: Number(productId), size: size || null } });

      if (existingItem) {
        await prisma.cartItem.update({ where: { id: existingItem.id }, data: { quantity: existingItem.quantity + quantity } });
      } else {
        await prisma.cartItem.create({ data: { cartId: cart.id, productId: Number(productId), quantity, size: size || null } });
      }
      const updatedCart = await getFullCart(userId);
      res.status(201).json(updatedCart);
    } catch (error) {
      if(error.message === "Unauthorized") return res.status(401).json({ error: "Invalid token" });
      res.status(500).json({ error: error.message });
    }
  });

  router.patch('/cart/item/:itemId', async (req, res) => {
    try {
      const userId = getUserIdFromToken(req);
      const item = await prisma.cartItem.findUnique({ where: { id: Number(req.params.itemId) }, include: { cart: true } });
      if (!item) return res.status(404).json({ error: "Not found" });
      if(item.cart.userId !== userId) return res.status(403).json({ error: "Access denied" }); // IDOR

      const { action, quantity } = req.body;
      if (quantity !== undefined) {
        if (quantity <= 0) await prisma.cartItem.delete({ where: { id: Number(req.params.itemId) } });
        else await prisma.cartItem.update({ where: { id: Number(req.params.itemId) }, data: { quantity: Number(quantity) } });
      } else {
        let newQuantity = item.quantity;
        if (action === "INCREMENT") newQuantity += 1; else if (action === "DECREMENT") newQuantity -= 1;
        if (newQuantity <= 0) await prisma.cartItem.delete({ where: { id: Number(req.params.itemId) } });
        else await prisma.cartItem.update({ where: { id: Number(req.params.itemId) }, data: { quantity: newQuantity } });
      }
      res.json(await getFullCart(userId));
    } catch (error) { res.status(500).json({ error: error.message }); }
  });

  router.delete('/cart/item/:itemId', async (req, res) => {
    try {
      const userId = getUserIdFromToken(req);
      const item = await prisma.cartItem.findUnique({ where: { id: Number(req.params.itemId) }, include: { cart: true } });
      if (!item) return res.status(404).json({ error: "Not found" });
      if(item.cart.userId !== userId) return res.status(403).json({ error: "Access denied" });
      await prisma.cartItem.delete({ where: { id: Number(req.params.itemId) } });
      res.json(await getFullCart(userId));
    } catch (error) { res.status(500).json({ error: error.message }); }
  });

  // Wishlist - same IDOR fix
  router.get('/wishlist/:userId', async (req, res) => {
    try {
      const tokenUserId = getUserIdFromToken(req);
      const paramUserId = Number(req.params.userId);
      if(tokenUserId !== paramUserId) return res.status(403).json({ error: "Access denied" });
      let wishlist = await prisma.wishlist.findUnique({ where: { userId: paramUserId }, include: { items: { include: { product: { include: { brand: true, images: true } } } } } });
      if (!wishlist) wishlist = await prisma.wishlist.create({ data: { userId: paramUserId }, include: { items: { include: { product: { include: { brand: true, images: true } } } } } });
      res.json(wishlist);
    } catch (error) { res.status(500).json({ error: error.message }); }
  });

  router.post('/wishlist/toggle', async (req, res) => {
    try {
      const userId = getUserIdFromToken(req);
      const { productId } = req.body;
      let wishlist = await prisma.wishlist.upsert({ where: { userId }, update: {}, create: { userId } });
      const existingItem = await prisma.wishlistItem.findFirst({ where: { wishlistId: wishlist.id, productId: Number(productId) } });
      if (existingItem) {
        await prisma.wishlistItem.delete({ where: { id: existingItem.id } });
        return res.json({ message: "Removed", status: "removed" });
      } else {
        const newItem = await prisma.wishlistItem.create({ data: { wishlistId: wishlist.id, productId: Number(productId) } });
        return res.status(201).json({ message: "Added", status: "added", newItem });
      }
    } catch (error) { res.status(500).json({ error: error.message }); }
  });

  router.patch('/cart/admin/config', verifyAdmin, async (req, res) => {
    try {
      const { gstRate, deliveryFee, freeDeliveryThreshold } = req.body;
      const updatedConfig = await prisma.storeConfig.upsert({ where: { id: 1 }, update: { ...(gstRate !== undefined && { gstRate: Number(gstRate) }), ...(deliveryFee !== undefined && { deliveryFee: Number(deliveryFee) }), ...(freeDeliveryThreshold !== undefined && { freeDeliveryThreshold: Number(freeDeliveryThreshold) }) }, create: { id: 1, gstRate: gstRate ? Number(gstRate) : 5.0, deliveryFee: deliveryFee ? Number(deliveryFee) : 49.0, freeDeliveryThreshold: freeDeliveryThreshold ? Number(freeDeliveryThreshold) : 999.0 } });
      res.json({ message: "Updated!", config: updatedConfig });
    } catch (error) { res.status(500).json({ error: error.message }); }
  });

  return router;
};