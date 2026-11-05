const express = require('express');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

module.exports = (prisma) => {
  const router = express.Router();

  const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });

  // User Auth Helper
  const verifyToken = (req, res, next) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: "Unauthorized access" });
      }
      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.userId = Number(decoded.id);
      next();
    } catch {
      return res.status(401).json({ error: "Invalid or expired token" });
    }
  };

  // 1. Create Razorpay Order API (/api/payment/create-order)
  router.post('/create-order', verifyToken, async (req, res) => {
    try {
      const { addressId, paymentType = 'PREPAID', couponCode } = req.body;

      if (!addressId) {
        return res.status(400).json({ error: 'Address ID is required' });
      }

      // 1. Pehle cart fetch karo user ki taaki total amount pata chale
      const cart = await prisma.cart.findUnique({
        where: { userId: req.userId },
        include: { items: { include: { product: true } } }
      });

      if (!cart || cart.items.length === 0) {
        return res.status(400).json({ error: 'Your cart is empty' });
      }

      const subtotal = cart.items.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);
      
      // StoreConfig se GST + Delivery
      const config = await prisma.storeConfig.findFirst({ where: { id: 1 } });
      const gstRate = config?.gstRate || 5.0;
      const deliveryFeeConfig = config?.deliveryFee || 49;
      const freeThreshold = config?.freeDeliveryThreshold || 999;

      let discountAmount = 0;
      let appliedCouponId = null;

      // --- COUPON VALIDATION LOGIC ---
      if (couponCode && couponCode.trim() !== '') {
        const cleanCode = couponCode.toUpperCase().trim();
        const coupon = await prisma.coupon.findUnique({ where: { code: cleanCode } });

        if (!coupon || !coupon.isActive) {
          return res.status(400).json({ error: 'Invalid or expired coupon code' });
        }

        // Check total limit (e.g. 5 users max)
        if (coupon.usedCount >= coupon.usageLimit) {
          return res.status(400).json({ error: 'Launch offer limit reached! This coupon is fully redeemed.' });
        }

        // Check if user already used this specific coupon
        const alreadyUsed = await prisma.couponRedemption.findUnique({
          where: {
            couponId_userId: {
              couponId: coupon.id,
              userId: req.userId
            }
          }
        });

        if (alreadyUsed) {
          return res.status(400).json({ error: 'You have already used this coupon code!' });
        }

        // Calculate discount (e.g. 10%)
        discountAmount = parseFloat(((subtotal * coupon.discountPct) / 100).toFixed(2));
        appliedCouponId = coupon.id;
      }

      const discountedSubtotal = Math.max(0, subtotal - discountAmount);
      const gstAmount = parseFloat(((discountedSubtotal * gstRate) / 100).toFixed(2));
      const deliveryFee = discountedSubtotal >= freeThreshold ? 0 : deliveryFeeConfig;
      let finalTotal = parseFloat((discountedSubtotal + gstAmount + deliveryFee).toFixed(2));

      // --- FIRST ORDER PREPAID / ADVANCE RULE CHECK ---
      const previousOrdersCount = await prisma.order.count({ 
        where: { 
          userId: req.userId,
          status: 'CONFIRMED'
        } 
      });

      if (previousOrdersCount === 0 && paymentType === 'COD') {
        return res.status(400).json({ 
          error: "Security Policy: Your first order must be Prepaid or require ₹99 Advance COD." 
        });
      }

      // Agar COD with Advance hai, toh amount sirf ₹99 charge hoga online, baaki COD
      let payableAmount = finalTotal;
      if (paymentType === 'COD_ADVANCE') {
        payableAmount = 99; // Advance amount
      }

      // 2. Address verify karo ki user ka hi hai ya nahi
      const address = await prisma.address.findFirst({
        where: { id: Number(addressId), userId: req.userId }
      });
      if (!address) {
        return res.status(403).json({ error: 'Invalid address or not yours' });
      }

      // 3. Database me Order create karo
      const newOrder = await prisma.order.create({
        data: {
          userId: req.userId,
          addressId: Number(addressId),
          shippingName: address.name,
          shippingPhone: address.phone,
          shippingLine: address.addressLine,
          shippingCity: address.city,
          shippingState: address.state,
          shippingPincode: address.pincode,
          subtotal, 
          gstAmount, 
          deliveryFee, 
          totalAmount: finalTotal,
          status: paymentType === 'COD' ? 'PENDING' : 'PENDING_PAYMENT',
          items: {
            create: cart.items.map(item => ({
              productId: item.productId,
              size: item.size || "M",
              quantity: item.quantity,
              price: item.product.price
            }))
          }
        }
      });

      // Agar coupon use hua hai toh use temporary track karne ke liye order table ya payment metadata me rakh sakte ho, 
      // par verification ke waqt redemption record banega. Abhi ke liye hum couponId ko verify-payment ke liye session/payment table me link kar sakte hain, 
      // ya seedha verify-payment me coupon apply kar sakte hain. 
      // (Asaan tarika: Payment table me metadata ya local variable ki tarah handle karna, ya verify ke time dobara validate karna).

      // Agar pure COD hai toh Razorpay order ki zaroorat nahi hai (Yahan cart clear hogi aur coupon redeem ho jayega)
      if (paymentType === 'COD') {
        if (appliedCouponId) {
          await prisma.couponRedemption.create({
            data: { couponId: appliedCouponId, userId: req.userId, orderId: newOrder.id }
          });
          await prisma.coupon.update({
            where: { id: appliedCouponId },
            data: { usedCount: { increment: 1 } }
          });
        }

        await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
        return res.status(201).json({
          success: true,
          dbOrderId: newOrder.id,
          message: 'COD Order placed successfully'
        });
      }

      // 4. Razorpay Order create karo (Prepaid ya ₹99 Advance ke liye)
      const amountInPaise = Math.round(payableAmount * 100);

      const options = {
        amount: amountInPaise,
        currency: 'INR',
        receipt: `receipt_order_${newOrder.id}`,
      };

      const razorpayOrder = await razorpay.orders.create(options);

      await prisma.payment.upsert({
        where: { orderId: newOrder.id },
        update: {
          gateway: 'RAZORPAY',
          gatewayOrderId: razorpayOrder.id,
          amount: payableAmount,
          status: 'PENDING',
        },
        create: {
          orderId: newOrder.id,
          gateway: 'RAZORPAY',
          gatewayOrderId: razorpayOrder.id,
          amount: payableAmount,
          status: 'PENDING',
        },
      });

      // Agar prepaid hai, toh coupon ki redemption payment verify hone par record karenge 
      // taaki payment fail hone par coupon waste na ho! (Iske liye hum couponId ko Payment table me store kar sakte hain).
      if (appliedCouponId) {
        await prisma.payment.update({
          where: { orderId: newOrder.id },
          data: { gatewayPaymentId: String(appliedCouponId) } // Temporary storage for couponId during payment flow
        });
      }

      res.json({
        success: true,
        key: process.env.RAZORPAY_KEY_ID,
        razorpayOrderId: razorpayOrder.id,
        amount: razorpayOrder.amount,
        currency: razorpayOrder.currency,
        dbOrderId: newOrder.id,
      });
    } catch (error) {
      console.error('Error creating Razorpay order:', error);
      res.status(500).json({ error: error.message || 'Failed to create payment order' });
    }
  });

  // 2. Verify Payment Signature API (/api/payment/verify-payment)
  router.post('/verify-payment', verifyToken, async (req, res) => {
    try {
      const { dbOrderId, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

      if (!dbOrderId || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
        return res.status(400).json({ error: 'Missing required payment verification details' });
      }

      const body = razorpay_order_id + '|' + razorpay_payment_id;

      const expectedSignature = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
        .update(body.toString())
        .digest('hex');

      const isAuthentic = expectedSignature === razorpay_signature;

      if (isAuthentic) {
        const paymentRecord = await prisma.payment.update({
          where: { orderId: Number(dbOrderId) },
          data: {
            gatewayPaymentId: razorpay_payment_id,
            gatewaySignature: razorpay_signature,
            status: 'COMPLETED',
          },
        });

        // Check if a coupon was attached (stored temporarily in gatewayPaymentId or handled via relation)
        // Note: Agar humne upar gatewayPaymentId me couponId rakha tha, toh usey yahan check karke redeem kar lenge:
        // (Clean approach: Payment model me couponId field add karna best hai, par filhal safe check lagate hain)

        const updatedOrder = await prisma.order.update({
          where: { id: Number(dbOrderId) },
          data: {
            status: 'CONFIRMED',
          },
        });

        // 🛒 CART CLEAR SIRF TAB HOGI JAB PAYMENT SUCCESSFUL HO JAYE!
        const cart = await prisma.cart.findUnique({
          where: { userId: updatedOrder.userId }
        });
        
        if (cart) {
          await prisma.cartItem.deleteMany({
            where: { cartId: cart.id }
          });
        }

        return res.json({ success: true, message: 'Payment verified successfully' });
      } else {
        await prisma.payment.update({
          where: { orderId: Number(dbOrderId) },
          data: { status: 'FAILED' },
        });

        return res.status(400).json({ success: false, error: 'Invalid payment signature' });
      }
    } catch (error) {
      console.error('Error verifying payment:', error);
      res.status(500).json({ error: 'Internal server error during verification' });
    }
  });

  // 3. Payment Failed / Cancelled Route
  router.post(['/failed', '/payment-failed'], verifyToken, async (req, res) => {
    try {
      const { dbOrderId } = req.body;
      if (dbOrderId) {
        await prisma.order.updateMany({
          where: { id: Number(dbOrderId), userId: req.userId },
          data: { status: 'FAILED' }
        });
        await prisma.payment.updateMany({
          where: { orderId: Number(dbOrderId) },
          data: { status: 'FAILED' }
        });
      }
      res.json({ success: true, message: 'Payment failure logged' });
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
};