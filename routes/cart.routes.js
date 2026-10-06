const express = require('express');

module.exports = (prisma) => {
  const router = express.Router();

  // ==========================================
  // CART APIS
  // ==========================================

  // 1. GET CART WITH DYNAMIC BILL SUMMARY (StoreConfig Se)
  router.get('/cart/:userId', async (req, res) => {
    try {
      const userId = Number(req.params.userId);

      // Store Settings DB se read karo (Nahi ho toh default create kar do)
      let config = await prisma.storeConfig.findUnique({ where: { id: 1 } });
      if (!config) {
        config = await prisma.storeConfig.create({
          data: { id: 1, gstRate: 5.0, deliveryFee: 49.0, freeDeliveryThreshold: 999.0 }
        });
      }

      // User Cart fetch karo
      let cart = await prisma.cart.findUnique({
        where: { userId },
        include: {
          items: {
            include: {
              product: { include: { brand: true, images: true } }
            }
          }
        }
      });

      if (!cart) {
        cart = await prisma.cart.create({
          data: { userId },
          include: {
            items: {
              include: { product: { include: { brand: true, images: true } } }
            }
          }
        });
      }

      // Cart khali hone par 0 summary send karo
      if (cart.items.length === 0) {
        return res.json({
          ...cart,
          billSummary: {
            subtotal: 0,
            deliveryFee: 0,
            isFreeDelivery: false,
            freeDeliveryThreshold: config.freeDeliveryThreshold,
            gstRate: `${config.gstRate}%`,
            gstAmount: 0,
            grandTotal: 0
          }
        });
      }

      // Subtotal Calculation
      const subtotal = cart.items.reduce((sum, item) => {
        return sum + (item.product.price * item.quantity);
      }, 0);

      // Dynamic Delivery Fee (DB config se)
      const deliveryFee = subtotal >= config.freeDeliveryThreshold ? 0 : config.deliveryFee;

      // Dynamic GST Calculation (DB config se)
      const gstAmount = Math.round(subtotal * (config.gstRate / 100));

      // Final Grand Total
      const grandTotal = Math.round(subtotal + deliveryFee + gstAmount);

      res.json({
        ...cart,
        billSummary: {
          subtotal: parseFloat(subtotal.toFixed(2)),
          deliveryFee,
          isFreeDelivery: deliveryFee === 0,
          freeDeliveryThreshold: config.freeDeliveryThreshold,
          gstRate: `${config.gstRate}%`,
          gstAmount,
          grandTotal
        }
      });
    } catch (error) {
      console.error("Get Cart Error:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  // 2. ADD TO CART
  router.post('/cart/add', async (req, res) => {
    try {
      const { userId, productId, quantity, size } = req.body;
      if (!userId || !productId) {
        return res.status(400).json({ error: "userId and productId required" });
      }

      let cart = await prisma.cart.findUnique({ where: { userId: Number(userId) } });
      if (!cart) cart = await prisma.cart.create({ data: { userId: Number(userId) } });

      const existingItem = await prisma.cartItem.findFirst({
        where: { cartId: cart.id, productId: Number(productId), size: size || null }
      });

      let cartItem;
      if (existingItem) {
        cartItem = await prisma.cartItem.update({
          where: { id: existingItem.id },
          data: { quantity: existingItem.quantity + (quantity ? Number(quantity) : 1) }
        });
      } else {
        cartItem = await prisma.cartItem.create({
          data: {
            cartId: cart.id,
            productId: Number(productId),
            quantity: quantity ? Number(quantity) : 1,
            size: size || null
          }
        });
      }
      res.status(201).json({ message: "Item added to cart successfully!", cartItem });
    } catch (error) {
      console.error("Add to Cart Error:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  // 3. QUANTITY INCREMENT / DECREMENT (+ / - Buttons)
  router.patch('/cart/item/:itemId', async (req, res) => {
    try {
      const itemId = Number(req.params.itemId);
      const { action } = req.body; // "INCREMENT" ya "DECREMENT"

      const item = await prisma.cartItem.findUnique({ where: { id: itemId } });
      if (!item) {
        return res.status(404).json({ error: "Cart item not found" });
      }

      let newQuantity = item.quantity;
      if (action === "INCREMENT") {
        newQuantity += 1;
      } else if (action === "DECREMENT") {
        newQuantity -= 1;
      }

      // Quantity 0 hone par auto delete
      if (newQuantity <= 0) {
        await prisma.cartItem.delete({ where: { id: itemId } });
        return res.json({ message: "Item removed from cart" });
      }

      const updatedItem = await prisma.cartItem.update({
        where: { id: itemId },
        data: { quantity: newQuantity }
      });

      res.json({ message: "Quantity updated", cartItem: updatedItem });
    } catch (error) {
      console.error("Update Cart Item Quantity Error:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  // 4. REMOVE ITEM FROM CART (Trash Button)
  router.delete('/cart/item/:itemId', async (req, res) => {
    try {
      await prisma.cartItem.delete({ where: { id: Number(req.params.itemId) } });
      res.json({ message: "Cart item removed successfully!" });
    } catch (error) {
      console.error("Remove Cart Item Error:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  // ==========================================
  // WISHLIST APIS
  // ==========================================

  // 5. GET WISHLIST
  router.get('/wishlist/:userId', async (req, res) => {
    try {
      const userId = Number(req.params.userId);
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
      console.error("Get Wishlist Error:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  // 6. TOGGLE WISHLIST (Add/Remove)
  router.post('/wishlist/toggle', async (req, res) => {
    try {
      const { userId, productId } = req.body;
      if (!userId || !productId) return res.status(400).json({ error: "userId and productId required" });

      let wishlist = await prisma.wishlist.findUnique({ where: { userId: Number(userId) } });
      if (!wishlist) wishlist = await prisma.wishlist.create({ data: { userId: Number(userId) } });

      const existingItem = await prisma.wishlistItem.findFirst({
        where: { wishlistId: wishlist.id, productId: Number(productId) }
      });

      if (existingItem) {
        await prisma.wishlistItem.delete({ where: { id: existingItem.id } });
        return res.json({ message: "Removed from wishlist", status: "removed" });
      } else {
        const newItem = await prisma.wishlistItem.create({
          data: { wishlistId: wishlist.id, productId: Number(productId) }
        });
        return res.status(201).json({ message: "Added to wishlist", status: "added", newItem });
      }
    } catch (error) {
      console.error("Wishlist Toggle Error:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  // ==========================================
  // STORE CONFIG APIS (Admin Only)
  // ==========================================

  // 7. UPDATE GST & DELIVERY CHARGES
  router.patch('/cart/admin/config', async (req, res) => {
    try {
      const { gstRate, deliveryFee, freeDeliveryThreshold } = req.body;

      const updatedConfig = await prisma.storeConfig.upsert({
        where: { id: 1 },
        update: {
          ...(gstRate !== undefined && { gstRate: Number(gstRate) }),
          ...(deliveryFee !== undefined && { deliveryFee: Number(deliveryFee) }),
          ...(freeDeliveryThreshold !== undefined && { freeDeliveryThreshold: Number(freeDeliveryThreshold) })
        },
        create: {
          id: 1,
          gstRate: gstRate ? Number(gstRate) : 5.0,
          deliveryFee: deliveryFee ? Number(deliveryFee) : 49.0,
          freeDeliveryThreshold: freeDeliveryThreshold ? Number(freeDeliveryThreshold) : 999.0
        }
      });

      res.json({ message: "Store settings updated successfully!", config: updatedConfig });
    } catch (error) {
      console.error("Update Config Error:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  return router;
};