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

















// const express = require('express');
// const jwt = require('jsonwebtoken');
// const { z } = require('zod');

// module.exports = (prisma, verifyAdmin) => {
//   const router = express.Router();

//   // JWT se userId nikalna - IDOR FIX
//   function getUserIdFromToken(req){
//     const authHeader = req.headers.authorization;
//     if(!authHeader) throw new Error("Unauthorized");
//     const token = authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : authHeader;
//     const decoded = jwt.verify(token, process.env.JWT_SECRET);
//     return Number(decoded.id);
//   }

//   // ZOD - Whitelist fields (Point 16)
//   const addSchema = z.object({
//     productId: z.number().int().positive(),
//     quantity: z.number().int().min(1).max(10).optional().default(1),
//     size: z.string().max(10).optional()
//   });

//   async function getFullCart(userId) {
//     let config = await prisma.storeConfig.findUnique({ where: { id: 1 } });
//     if (!config) {
//       config = await prisma.storeConfig.create({
//         data: { id: 1, gstRate: 5.0, deliveryFee: 49.0, freeDeliveryThreshold: 999.0 }
//       });
//     }
//     const cart = await prisma.cart.findUnique({
//       where: { userId },
//       include: { items: { include: { product: { include: { brand: true, images: true } } } } }
//     });
//     if (!cart || cart.items.length === 0) {
//       return { id: cart?.id || null, userId, items: [], billSummary: { subtotal: 0, deliveryFee: 0, isFreeDelivery: false, freeDeliveryThreshold: config.freeDeliveryThreshold, gstRate: `${config.gstRate}%`, gstAmount: 0, grandTotal: 0 } };
//     }
//     const subtotal = cart.items.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);
//     const deliveryFee = subtotal >= config.freeDeliveryThreshold ? 0 : config.deliveryFee;
//     const gstAmount = Number((subtotal * (config.gstRate / 100)).toFixed(2));
//     const grandTotal = Number((subtotal + deliveryFee + gstAmount).toFixed(2));
//     return { ...cart, billSummary: { subtotal: Number(subtotal.toFixed(2)), deliveryFee, isFreeDelivery: deliveryFee === 0, freeDeliveryThreshold: config.freeDeliveryThreshold, gstRate: `${config.gstRate}%`, gstAmount, grandTotal } };
//   }

//   // 1. GET CART - FINAL FIX - NO :userId in URL
//   router.get('/cart', async (req, res) => {
//     try {
//       const userId = getUserIdFromToken(req);
//       const cartData = await getFullCart(userId);
//       res.json(cartData);
//     } catch (error) {
//       if(error.message === "Unauthorized") return res.status(401).json({ error: "Invalid token" });
//       if(error.name === "JsonWebTokenError") return res.status(401).json({ error: "Invalid token" });
//       res.status(500).json({ error: error.message });
//     }
//   });

//   // Backward compatibility ke liye - agar frontend purana route hit kare toh bhi chalega
//   router.get('/cart/:userId', async (req, res) => {
//     try {
//       const tokenUserId = getUserIdFromToken(req);
//       const paramUserId = Number(req.params.userId);
//       // Check - apna hi cart dekh sakta hai, admin sab dekh sakta hai
//       if(tokenUserId !== paramUserId){
//         const user = await prisma.user.findUnique({ where: { id: tokenUserId } });
//         if(!user || user.role !== 'ADMIN') return res.status(403).json({ error: "Access denied - use /cart" });
//       }
//       const cartData = await getFullCart(paramUserId);
//       res.json(cartData);
//     } catch (error) {
//       if(error.message === "Unauthorized") return res.status(401).json({ error: "Invalid token" });
//       res.status(500).json({ error: error.message });
//     }
//   });

//   // 2. ADD TO CART - SECURED
//   router.post('/cart/add', async (req, res) => {
//     try {
//       const userId = getUserIdFromToken(req);
//       const parsed = addSchema.safeParse(req.body);
//       if(!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
//       const { productId, quantity, size } = parsed.data;

//       const product = await prisma.product.findUnique({ where: { id: Number(productId) } });
//       if(!product) return res.status(404).json({ error: "Product not found" });

//       const cart = await prisma.cart.upsert({ where: { userId }, update: {}, create: { userId } });
//       const existingItem = await prisma.cartItem.findFirst({ where: { cartId: cart.id, productId: Number(productId), size: size || null } });

//       if (existingItem) {
//         await prisma.cartItem.update({ where: { id: existingItem.id }, data: { quantity: existingItem.quantity + quantity } });
//       } else {
//         await prisma.cartItem.create({ data: { cartId: cart.id, productId: Number(productId), quantity, size: size || null } });
//       }
//       const updatedCart = await getFullCart(userId);
//       res.status(201).json(updatedCart);
//     } catch (error) {
//       if(error.message === "Unauthorized") return res.status(401).json({ error: "Invalid token" });
//       res.status(500).json({ error: error.message });
//     }
//   });

//   router.patch('/cart/item/:itemId', async (req, res) => {
//     try {
//       const userId = getUserIdFromToken(req);
//       const item = await prisma.cartItem.findUnique({ where: { id: Number(req.params.itemId) }, include: { cart: true } });
//       if (!item) return res.status(404).json({ error: "Not found" });
//       if(item.cart.userId !== userId) return res.status(403).json({ error: "Access denied" });

//       const { action, quantity } = req.body;
//       if (quantity !== undefined) {
//         if (quantity <= 0) await prisma.cartItem.delete({ where: { id: Number(req.params.itemId) } });
//         else await prisma.cartItem.update({ where: { id: Number(req.params.itemId) }, data: { quantity: Number(quantity) } });
//       } else {
//         let newQuantity = item.quantity;
//         if (action === "INCREMENT") newQuantity += 1; else if (action === "DECREMENT") newQuantity -= 1;
//         if (newQuantity <= 0) await prisma.cartItem.delete({ where: { id: Number(req.params.itemId) } });
//         else await prisma.cartItem.update({ where: { id: Number(req.params.itemId) }, data: { quantity: newQuantity } });
//       }
//       res.json(await getFullCart(userId));
//     } catch (error) { res.status(500).json({ error: error.message }); }
//   });

//   router.delete('/cart/item/:itemId', async (req, res) => {
//     try {
//       const userId = getUserIdFromToken(req);
//       const item = await prisma.cartItem.findUnique({ where: { id: Number(req.params.itemId) }, include: { cart: true } });
//       if (!item) return res.status(404).json({ error: "Not found" });
//       if(item.cart.userId !== userId) return res.status(403).json({ error: "Access denied" });
//       await prisma.cartItem.delete({ where: { id: Number(req.params.itemId) } });
//       res.json(await getFullCart(userId));
//     } catch (error) { res.status(500).json({ error: error.message }); }
//   });

//   // WISHLIST - FINAL FIX - NO :userId
//   router.get('/wishlist', async (req, res) => {
//     try {
//       const userId = getUserIdFromToken(req);
//       let wishlist = await prisma.wishlist.findUnique({ where: { userId }, include: { items: { include: { product: { include: { brand: true, images: true } } } } } });
//       if (!wishlist) wishlist = await prisma.wishlist.create({ data: { userId }, include: { items: { include: { product: { include: { brand: true, images: true } } } } } });
//       res.json(wishlist);
//     } catch (error) { res.status(500).json({ error: error.message }); }
//   });

//   // Backward compatibility
//   router.get('/wishlist/:userId', async (req, res) => {
//     try {
//       const tokenUserId = getUserIdFromToken(req);
//       const paramUserId = Number(req.params.userId);
//       if(tokenUserId !== paramUserId) return res.status(403).json({ error: "Access denied - use /wishlist" });
//       let wishlist = await prisma.wishlist.findUnique({ where: { userId: paramUserId }, include: { items: { include: { product: { include: { brand: true, images: true } } } } } });
//       if (!wishlist) wishlist = await prisma.wishlist.create({ data: { userId: paramUserId }, include: { items: { include: { product: { include: { brand: true, images: true } } } } } });
//       res.json(wishlist);
//     } catch (error) { res.status(500).json({ error: error.message }); }
//   });

//   router.post('/wishlist/toggle', async (req, res) => {
//     try {
//       const userId = getUserIdFromToken(req);
//       const { productId } = req.body;
//       let wishlist = await prisma.wishlist.upsert({ where: { userId }, update: {}, create: { userId } });
//       const existingItem = await prisma.wishlistItem.findFirst({ where: { wishlistId: wishlist.id, productId: Number(productId) } });
//       if (existingItem) {
//         await prisma.wishlistItem.delete({ where: { id: existingItem.id } });
//         return res.json({ message: "Removed", status: "removed" });
//       } else {
//         const newItem = await prisma.wishlistItem.create({ data: { wishlistId: wishlist.id, productId: Number(productId) } });
//         return res.status(201).json({ message: "Added", status: "added", newItem });
//       }
//     } catch (error) { res.status(500).json({ error: error.message }); }
//   });

//   router.patch('/cart/admin/config', verifyAdmin, async (req, res) => {
//     try {
//       const { gstRate, deliveryFee, freeDeliveryThreshold } = req.body;
//       const updatedConfig = await prisma.storeConfig.upsert({ where: { id: 1 }, update: { ...(gstRate !== undefined && { gstRate: Number(gstRate) }), ...(deliveryFee !== undefined && { deliveryFee: Number(deliveryFee) }), ...(freeDeliveryThreshold !== undefined && { freeDeliveryThreshold: Number(freeDeliveryThreshold) }) }, create: { id: 1, gstRate: gstRate ? Number(gstRate) : 5.0, deliveryFee: deliveryFee ? Number(deliveryFee) : 49.0, freeDeliveryThreshold: freeDeliveryThreshold ? Number(freeDeliveryThreshold) : 999.0 } });
//       res.json({ message: "Updated!", config: updatedConfig });
//     } catch (error) { res.status(500).json({ error: error.message }); }
//   });

//   return router;
// };
















const express = require('express');
const jwt = require('jsonwebtoken');
const { z } = require('zod');

module.exports = (prisma, verifyAdmin) => {
  const router = express.Router();

  const MAX_ITEM_QTY = 10;

  function getUserIdFromToken(req) {
    const authHeader = req.headers.authorization;
    if (!authHeader) throw new Error("Unauthorized");
    const token = authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : authHeader;
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const uid = Number(decoded.id);
    if (!Number.isInteger(uid) || uid <= 0) throw new Error("Unauthorized");
    return uid;
  }

  function isTokenAuthError(err) {
    return (
      err?.message === "Unauthorized" ||
      err?.name === "JsonWebTokenError" ||
      err?.name === "TokenExpiredError"
    );
  }

  function handleRouteError(res, error) {
    if (isTokenAuthError(error)) {
      return res.status(401).json({ error: "Invalid token" });
    }
    return res.status(500).json({ error: "Internal Server Error" });
  }

  const addSchema = z.object({
    productId: z.number().int().positive(),
    quantity: z.number().int().min(1).max(MAX_ITEM_QTY).optional().default(1),
    size: z.string().trim().max(10).optional()
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
      return {
        id: cart?.id || null,
        userId,
        items: [],
        billSummary: {
          subtotal: 0,
          deliveryFee: 0,
          isFreeDelivery: false,
          freeDeliveryThreshold: config.freeDeliveryThreshold,
          gstRate: `${config.gstRate}%`,
          gstAmount: 0,
          grandTotal: 0
        }
      };
    }
    const subtotal = cart.items.reduce((sum, item) => sum + (Number(item.product.price) * item.quantity), 0);
    const deliveryFee = subtotal >= config.freeDeliveryThreshold ? 0 : config.deliveryFee;
    const gstAmount = Number((subtotal * (config.gstRate / 100)).toFixed(2));
    const grandTotal = Number((subtotal + deliveryFee + gstAmount).toFixed(2));
    return {
      ...cart,
      billSummary: {
        subtotal: Number(subtotal.toFixed(2)),
        deliveryFee,
        isFreeDelivery: deliveryFee === 0,
        freeDeliveryThreshold: config.freeDeliveryThreshold,
        gstRate: `${config.gstRate}%`,
        gstAmount,
        grandTotal
      }
    };
  }

  // 1. GET CART - NO :userId in URL
  router.get('/cart', async (req, res) => {
    try {
      const userId = getUserIdFromToken(req);
      const cartData = await getFullCart(userId);
      res.json(cartData);
    } catch (error) {
      return handleRouteError(res, error);
    }
  });

  // Backward compatibility
  router.get('/cart/:userId', async (req, res) => {
    try {
      const tokenUserId = getUserIdFromToken(req);
      const paramUserId = Number(req.params.userId);
      if (!Number.isInteger(paramUserId) || paramUserId <= 0) {
        return res.status(400).json({ error: "Invalid user ID" });
      }
      if (tokenUserId !== paramUserId) {
        const user = await prisma.user.findUnique({ where: { id: tokenUserId } });
        if (!user || user.role !== 'ADMIN') return res.status(403).json({ error: "Access denied - use /cart" });
      }
      const cartData = await getFullCart(paramUserId);
      res.json(cartData);
    } catch (error) {
      return handleRouteError(res, error);
    }
  });

  // 2. ADD TO CART - SECURED
  router.post('/cart/add', async (req, res) => {
    try {
      const userId = getUserIdFromToken(req);
      const rawPid = req.body?.productId;
      const parsedPid = rawPid === undefined || rawPid === '' ? NaN : Number(rawPid);
      const rawQty = req.body?.quantity;
      const parsedQty = rawQty === undefined || rawQty === '' ? undefined : Number(rawQty);

      const parsed = addSchema.safeParse({
        productId: parsedPid,
        quantity: parsedQty,
        size: req.body?.size
      });
      if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
      const { productId, quantity, size } = parsed.data;

      const product = await prisma.product.findUnique({ where: { id: productId } });
      if (!product) return res.status(404).json({ error: "Product not found" });
      if (product.isOutOfStock || product.stock <= 0) {
        return res.status(400).json({ error: "Product is currently out of stock" });
      }

      const cart = await prisma.cart.upsert({ where: { userId }, update: {}, create: { userId } });
      const existingItem = await prisma.cartItem.findFirst({
        where: { cartId: cart.id, productId, size: size || null }
      });

      if (existingItem) {
        const nextQty = existingItem.quantity + quantity;
        if (nextQty > MAX_ITEM_QTY) {
          return res.status(400).json({ error: `Maximum ${MAX_ITEM_QTY} units allowed per item` });
        }
        if (product.stock && nextQty > product.stock) {
          return res.status(400).json({ error: `Only ${product.stock} units available in stock` });
        }
        await prisma.cartItem.update({ where: { id: existingItem.id }, data: { quantity: nextQty } });
      } else {
        if (product.stock && quantity > product.stock) {
          return res.status(400).json({ error: `Only ${product.stock} units available in stock` });
        }
        await prisma.cartItem.create({ data: { cartId: cart.id, productId, quantity, size: size || null } });
      }
      const updatedCart = await getFullCart(userId);
      res.status(201).json(updatedCart);
    } catch (error) {
      return handleRouteError(res, error);
    }
  });

  router.patch('/cart/item/:itemId', async (req, res) => {
    try {
      const userId = getUserIdFromToken(req);
      const itemId = Number(req.params.itemId);
      if (!Number.isInteger(itemId) || itemId <= 0) {
        return res.status(400).json({ error: "Invalid cart item ID" });
      }

      const item = await prisma.cartItem.findUnique({
        where: { id: itemId },
        include: { cart: true, product: true }
      });
      if (!item) return res.status(404).json({ error: "Not found" });
      if (item.cart.userId !== userId) return res.status(403).json({ error: "Access denied" });

      const { action, quantity } = req.body || {};
      if (quantity !== undefined) {
        const parsedQty = Number(quantity);
        if (!Number.isInteger(parsedQty)) {
          return res.status(400).json({ error: "Quantity must be an integer" });
        }
        if (parsedQty > MAX_ITEM_QTY) {
          return res.status(400).json({ error: `Maximum ${MAX_ITEM_QTY} units allowed per item` });
        }
        if (parsedQty > 0 && item.product?.stock && parsedQty > item.product.stock) {
          return res.status(400).json({ error: `Only ${item.product.stock} units available in stock` });
        }
        if (parsedQty <= 0) await prisma.cartItem.delete({ where: { id: itemId } });
        else await prisma.cartItem.update({ where: { id: itemId }, data: { quantity: parsedQty } });
      } else {
        if (action !== "INCREMENT" && action !== "DECREMENT") {
          return res.status(400).json({ error: "Invalid action; use INCREMENT or DECREMENT" });
        }
        let newQuantity = item.quantity;
        if (action === "INCREMENT") newQuantity += 1;
        else if (action === "DECREMENT") newQuantity -= 1;

        if (newQuantity > MAX_ITEM_QTY) {
          return res.status(400).json({ error: `Maximum ${MAX_ITEM_QTY} units allowed per item` });
        }
        if (newQuantity > 0 && item.product?.stock && newQuantity > item.product.stock) {
          return res.status(400).json({ error: `Only ${item.product.stock} units available in stock` });
        }
        if (newQuantity <= 0) await prisma.cartItem.delete({ where: { id: itemId } });
        else await prisma.cartItem.update({ where: { id: itemId }, data: { quantity: newQuantity } });
      }
      res.json(await getFullCart(userId));
    } catch (error) {
      return handleRouteError(res, error);
    }
  });

  router.delete('/cart/item/:itemId', async (req, res) => {
    try {
      const userId = getUserIdFromToken(req);
      const itemId = Number(req.params.itemId);
      if (!Number.isInteger(itemId) || itemId <= 0) {
        return res.status(400).json({ error: "Invalid cart item ID" });
      }

      const item = await prisma.cartItem.findUnique({ where: { id: itemId }, include: { cart: true } });
      if (!item) return res.status(404).json({ error: "Not found" });
      if (item.cart.userId !== userId) return res.status(403).json({ error: "Access denied" });
      await prisma.cartItem.delete({ where: { id: itemId } });
      res.json(await getFullCart(userId));
    } catch (error) {
      return handleRouteError(res, error);
    }
  });

  // WISHLIST - NO :userId
  router.get('/wishlist', async (req, res) => {
    try {
      const userId = getUserIdFromToken(req);
      let wishlist = await prisma.wishlist.findUnique({
        where: { userId },
        include: { items: { include: { product: { include: { brand: true, images: true } } } } }
      });
      if (!wishlist) {
        wishlist = await prisma.wishlist.create({
          data: { userId },
          include: { items: { include: { product: { include: { brand: true, images: true } } } } }
        });
      }
      res.json(wishlist);
    } catch (error) {
      return handleRouteError(res, error);
    }
  });

  // Backward compatibility
  router.get('/wishlist/:userId', async (req, res) => {
    try {
      const tokenUserId = getUserIdFromToken(req);
      const paramUserId = Number(req.params.userId);
      if (!Number.isInteger(paramUserId) || paramUserId <= 0) {
        return res.status(400).json({ error: "Invalid user ID" });
      }
      if (tokenUserId !== paramUserId) return res.status(403).json({ error: "Access denied - use /wishlist" });
      let wishlist = await prisma.wishlist.findUnique({
        where: { userId: paramUserId },
        include: { items: { include: { product: { include: { brand: true, images: true } } } } }
      });
      if (!wishlist) {
        wishlist = await prisma.wishlist.create({
          data: { userId: paramUserId },
          include: { items: { include: { product: { include: { brand: true, images: true } } } } }
        });
      }
      res.json(wishlist);
    } catch (error) {
      return handleRouteError(res, error);
    }
  });

  router.post('/wishlist/toggle', async (req, res) => {
    try {
      const userId = getUserIdFromToken(req);
      const productId = Number(req.body?.productId);
      if (!Number.isInteger(productId) || productId <= 0) {
        return res.status(400).json({ error: "Invalid productId" });
      }

      const product = await prisma.product.findUnique({ where: { id: productId }, select: { id: true } });
      if (!product) return res.status(404).json({ error: "Product not found" });

      let wishlist = await prisma.wishlist.upsert({ where: { userId }, update: {}, create: { userId } });
      const existingItem = await prisma.wishlistItem.findFirst({ where: { wishlistId: wishlist.id, productId } });
      if (existingItem) {
        await prisma.wishlistItem.delete({ where: { id: existingItem.id } });
        return res.json({ message: "Removed", status: "removed" });
      } else {
        const newItem = await prisma.wishlistItem.create({ data: { wishlistId: wishlist.id, productId } });
        return res.status(201).json({ message: "Added", status: "added", newItem });
      }
    } catch (error) {
      return handleRouteError(res, error);
    }
  });

  router.patch('/cart/admin/config', verifyAdmin, async (req, res) => {
    try {
      const { gstRate, deliveryFee, freeDeliveryThreshold } = req.body || {};
      const updateData = {};

      if (gstRate !== undefined) {
        const val = Number(gstRate);
        if (!Number.isFinite(val) || val < 0 || val > 100) {
          return res.status(400).json({ error: "gstRate must be between 0 and 100" });
        }
        updateData.gstRate = val;
      }
      if (deliveryFee !== undefined) {
        const val = Number(deliveryFee);
        if (!Number.isFinite(val) || val < 0 || val > 5000) {
          return res.status(400).json({ error: "deliveryFee must be between 0 and 5000" });
        }
        updateData.deliveryFee = val;
      }
      if (freeDeliveryThreshold !== undefined) {
        const val = Number(freeDeliveryThreshold);
        if (!Number.isFinite(val) || val < 0 || val > 100000) {
          return res.status(400).json({ error: "freeDeliveryThreshold must be between 0 and 100000" });
        }
        updateData.freeDeliveryThreshold = val;
      }

      const updatedConfig = await prisma.storeConfig.upsert({
        where: { id: 1 },
        update: updateData,
        create: {
          id: 1,
          gstRate: updateData.gstRate ?? 5.0,
          deliveryFee: updateData.deliveryFee ?? 49.0,
          freeDeliveryThreshold: updateData.freeDeliveryThreshold ?? 999.0
        }
      });
      res.json({ message: "Updated!", config: updatedConfig });
    } catch (error) {
      return handleRouteError(res, error);
    }
  });

  return router;
};