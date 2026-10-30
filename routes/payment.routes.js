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
      const { orderId } = req.body;

      if (!orderId) {
        return res.status(400).json({ error: 'Order ID is required' });
      }

      const order = await prisma.order.findFirst({
        where: { 
          id: Number(orderId),
          userId: req.userId // Ensure user owns the order
        },
      });

      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }

      const amountInPaise = Math.round(order.totalAmount * 100);

      const options = {
        amount: amountInPaise,
        currency: 'INR',
        receipt: `receipt_order_${order.id}`,
      };

      const razorpayOrder = await razorpay.orders.create(options);

      await prisma.payment.upsert({
        where: { orderId: order.id },
        update: {
          gateway: 'RAZORPAY',
          gatewayOrderId: razorpayOrder.id,
          amount: order.totalAmount,
          status: 'PENDING',
        },
        create: {
          orderId: order.id,
          gateway: 'RAZORPAY',
          gatewayOrderId: razorpayOrder.id,
          amount: order.totalAmount,
          status: 'PENDING',
        },
      });

      res.json({
        success: true,
        key: process.env.RAZORPAY_KEY_ID,
        razorpayOrderId: razorpayOrder.id,
        amount: razorpayOrder.amount,
        currency: razorpayOrder.currency,
        orderId: order.id,
      });
    } catch (error) {
      console.error('Error creating Razorpay order:', error);
      res.status(500).json({ error: 'Failed to create payment order' });
    }
  });

  // 2. Verify Payment Signature API (/api/payment/verify-payment)
  router.post('/verify-payment', verifyToken, async (req, res) => {
    try {
      const { orderId, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

      if (!orderId || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
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
          where: { orderId: Number(orderId) },
          data: {
            gatewayPaymentId: razorpay_payment_id,
            gatewaySignature: razorpay_signature,
            status: 'COMPLETED',
          },
        });

        await prisma.order.update({
          where: { id: Number(orderId) },
          data: {
            status: 'PAID',
          },
        });

        return res.json({ success: true, message: 'Payment verified successfully' });
      } else {
        await prisma.payment.update({
          where: { orderId: Number(orderId) },
          data: { status: 'FAILED' },
        });

        return res.status(400).json({ success: false, error: 'Invalid payment signature' });
      }
    } catch (error) {
      console.error('Error verifying payment:', error);
      res.status(500).json({ error: 'Internal server error during verification' });
    }
  });

  return router;
};