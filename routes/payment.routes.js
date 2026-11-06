const express = require('express');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

module.exports = (prisma, resend) => {
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
      const { addressId, paymentType = 'PREPAID', couponCode, checkoutMode = 'CART', buyNowItem } = req.body;

      if (!addressId) {
        return res.status(400).json({ error: 'Address ID is required' });
      }

      let orderItemsToProcess = [];
      let cartToClear = null;

      // --- CHECKOUT MODE LOGIC (CART vs BUY_NOW) ---
      if (checkoutMode === 'BUY_NOW') {
        if (!buyNowItem || !buyNowItem.productId) {
          return res.status(400).json({ error: 'Buy Now item details are missing.' });
        }
        const product = await prisma.product.findUnique({ where: { id: Number(buyNowItem.productId) } });
        if (!product) return res.status(404).json({ error: 'Product not found' });

        orderItemsToProcess = [{
          productId: product.id,
          quantity: Number(buyNowItem.quantity) || 1,
          size: buyNowItem.size || "M",
          product: product
        }];
      } else {
        cartToClear = await prisma.cart.findUnique({
          where: { userId: req.userId },
          include: { items: { include: { product: true } } }
        });

        if (!cartToClear || cartToClear.items.length === 0) {
          return res.status(400).json({ error: 'Your cart is empty' });
        }
        orderItemsToProcess = cartToClear.items;
      }

      const subtotal = orderItemsToProcess.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);

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

        if (coupon.usedCount >= coupon.usageLimit) {
          return res.status(400).json({ error: 'Launch offer limit reached! This coupon is fully redeemed.' });
        }

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

      let payableAmount = finalTotal;
      if (paymentType === 'COD_ADVANCE') {
        payableAmount = 99; 
      }

      // 2. Address verify karo
      const address = await prisma.address.findFirst({
        where: { id: Number(addressId), userId: req.userId }
      });
      if (!address) {
        return res.status(403).json({ error: 'Invalid address or not yours' });
      }

      // 3. Database me Order create karo (Stock lock ke sath)
      const newOrder = await prisma.$transaction(async (tx) => {
        // Stock decrement
        for (const item of orderItemsToProcess) {
          const updated = await tx.product.updateMany({
            where: { id: item.productId, stock: { gte: item.quantity } },
            data: { stock: { decrement: item.quantity } }
          });
          if (updated.count === 0) {
            throw new Error(`Out of stock: ${item.product?.name || item.productId}`);
          }
        }

        return await tx.order.create({
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
              create: orderItemsToProcess.map(item => ({
                productId: item.productId,
                size: item.size || "M",
                quantity: item.quantity,
                price: item.product.price
              }))
            }
          },
          include: { items: { include: { product: true } }, address: true }
        });
      });

      // Agar COD hai toh turant cart clear aur email bhej do
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

        if (checkoutMode === 'CART' && cartToClear) {
          await prisma.cartItem.deleteMany({ where: { cartId: cartToClear.id } });
        }

        return res.status(201).json({
          success: true,
          dbOrderId: newOrder.id,
          message: 'COD Order placed successfully'
        });
      }

      // 4. Razorpay Order create karo
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

      if (appliedCouponId) {
        await prisma.payment.update({
          where: { orderId: newOrder.id },
          data: { gatewayPaymentId: String(appliedCouponId) } 
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
        await prisma.payment.update({
          where: { orderId: Number(dbOrderId) },
          data: {
            gatewayPaymentId: razorpay_payment_id,
            gatewaySignature: razorpay_signature,
            status: 'COMPLETED',
          },
        });

        const updatedOrder = await prisma.order.update({
          where: { id: Number(dbOrderId) },
          data: {
            status: 'CONFIRMED',
          },
          include: { items: { include: { product: true } }, address: true, user: { include: { profile: true } } }
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

        // 🚀 5. SEND DETAILED EMAILS VIA RESEND UPON SUCCESSFUL PAYMENT VERIFICATION
        if (resend) {
          try {
            const adminEmail = "syvora.official.acc@gmail.com";
            const userEmail = updatedOrder.user?.email;

            // HTML items list generate
            const itemsHtml = updatedOrder.items.map(i => `
              <tr>
                <td style="padding: 8px; border-bottom: 1px solid #eee;">${i.product.name} (Size: ${i.size})</td>
                <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: center;">${i.quantity}</td>
                <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">₹${i.price * i.quantity}</td>
              </tr>
            `).join('');

            // A. Admin Notification Email
            await resend.emails.send({
              from: "Syvora Orders <orders@syvora.in>",
              replyTo: userEmail || "support@syvora.in",
              to: [adminEmail],
              subject: `🚨 NEW PREPAID ORDER #SYV-${updatedOrder.id} Received!`,
              html: `
                <div style="font-family: Arial, sans-serif; padding: 20px; color: #3D2B1F; background: #FAF7F2; border-radius: 10px;">
                  <h2 style="color: #4A3024;">🎉 New Prepaid Order Placed! (#SYV-${updatedOrder.id})</h2>
                  <p><b>Customer Name:</b> ${updatedOrder.shippingName}</p>
                  <p><b>Customer Phone:</b> ${updatedOrder.shippingPhone}</p>
                  <p><b>Customer Email:</b> ${userEmail || 'N/A'}</p>
                  
                  <h3 style="margin-top: 15px; color: #4A3024;">Shipping Address:</h3>
                  <p style="background: #FFF; padding: 10px; border-radius: 5px;">
                    ${updatedOrder.shippingLine}, ${updatedOrder.shippingCity}, ${updatedOrder.shippingState} - ${updatedOrder.shippingPincode}
                  </p>

                  <h3 style="margin-top: 15px; color: #4A3024;">Ordered Items:</h3>
                  <table style="width: 100%; background: #FFF; border-collapse: collapse; border-radius: 5px; overflow: hidden;">
                    <tr style="background: #EEDFD2; text-align: left;">
                      <th style="padding: 8px;">Item</th>
                      <th style="padding: 8px; text-align: center;">Qty</th>
                      <th style="padding: 8px; text-align: right;">Price</th>
                    </tr>
                    ${itemsHtml}
                  </table>

                  <p style="margin-top: 15px;"><b>Subtotal:</b> ₹${updatedOrder.subtotal}</p>
                  <p><b>GST (5%):</b> ₹${updatedOrder.gstAmount}</p>
                  <p><b>Delivery Fee:</b> ₹${updatedOrder.deliveryFee}</p>
                  <h3 style="color: #4A3024;">Grand Total: ₹${updatedOrder.totalAmount}</h3>
                  
                  <p style="color: #8B6B4A; font-weight: bold; margin-top: 20px;">Team Syvora System</p>
                </div>
              `
            });

            // B. Customer Confirmation Email
            if (userEmail) {
              await resend.emails.send({
                from: "Syvora Orders <orders@syvora.in>",
                replyTo: "syvora.official.acc@gmail.com",
                to: [userEmail],
                subject: `🎉 Order Confirmed! #SYV-${updatedOrder.id} - Syvora`,
                html: `
                  <div style="font-family: Arial, sans-serif; padding: 20px; color: #3D2B1F; background: #FAF7F2; border-radius: 10px;">
                    <h2 style="color: #4A3024;">Thank you for shopping with Syvora, ${updatedOrder.shippingName}!</h2>
                    <p>Your order <b>#SYV-${updatedOrder.id}</b> has been successfully paid and placed.</p>
                    
                    <h3 style="margin-top: 15px; color: #4A3024;">Order Summary:</h3>
                    <table style="width: 100%; background: #FFF; border-collapse: collapse; border-radius: 5px; overflow: hidden;">
                      <tr style="background: #EEDFD2; text-align: left;">
                        <th style="padding: 8px;">Item</th>
                        <th style="padding: 8px; text-align: center;">Qty</th>
                        <th style="padding: 8px; text-align: right;">Price</th>
                      </tr>
                      ${itemsHtml}
                    </table>

                    <p style="margin-top: 15px;"><b>Grand Total:</b> ₹${updatedOrder.totalAmount}</p>
                    <p><b>Delivery Address:</b> ${updatedOrder.shippingLine}, ${updatedOrder.shippingCity} - ${updatedOrder.shippingPincode}</p>
                    
                    <p>We will notify you with tracking details once your order ships.</p>
                    <p style="color: #8B6B4A; font-weight: bold; margin-top: 20px;">Team Syvora</p>
                  </div>
                `
              });
            }
            console.log(`[PAYMENT EMAIL] Successfully sent emails for Order #${updatedOrder.id}`);
          } catch (mailErr) {
            console.error("❌ Resend Payment Email Error:", mailErr.message);
          }
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