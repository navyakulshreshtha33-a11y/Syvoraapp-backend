const express = require('express');
const Razorpay = require('razorpay');
const crypto = require('crypto');

module.exports = function (prisma) {
  const router = express.Router();

  // Razorpay Instance Initialize
  const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
  });

  // =========================================================================
  // 1. CREATE RAZORPAY ORDER (Online Payment - UPI / Cards / Netbanking)
  // =========================================================================
  router.post('/payment/create-razorpay-order', async (req, res) => {
    try {
      const { orderId } = req.body;

      if (!orderId) {
        return res.status(400).json({ error: "orderId is required" });
      }

      // Fetch Order Details
      const order = await prisma.order.findUnique({
        where: { id: Number(orderId) },
        include: { payment: true }
      });

      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }

      if (order.status !== "PENDING") {
        return res.status(400).json({ error: "Order is already processed or cancelled" });
      }

      // Razorpay expects amount in PAISE (₹1 = 100 Paise)
      const amountInPaise = Math.round(order.totalAmount * 100);

      const razorpayOrderOptions = {
        amount: amountInPaise,
        currency: "INR",
        receipt: `receipt_order_${order.id}`,
        notes: { orderId: order.id.toString(), userId: order.userId.toString() }
      };

      // Create Order on Razorpay
      const rzpOrder = await razorpay.orders.create(razorpayOrderOptions);

      // Create or Update Payment Entry in Database
      const payment = await prisma.payment.upsert({
        where: { orderId: order.id },
        update: {
          gateway: "Razorpay",
          amount: order.totalAmount,
          status: "PENDING"
        },
        create: {
          orderId: order.id,
          gateway: "Razorpay",
          amount: order.totalAmount,
          status: "PENDING"
        }
      });

      res.status(200).json({
        success: true,
        razorpayOrderId: rzpOrder.id,
        amount: rzpOrder.amount,
        currency: rzpOrder.currency,
        keyId: process.env.RAZORPAY_KEY_ID,
        orderId: order.id
      });
    } catch (error) {
      console.error("❌ Create Razorpay Order Error:", error);
      res.status(500).json({ error: "Failed to initiate Razorpay order" });
    }
  });

  // =========================================================================
  // 2. VERIFY RAZORPAY PAYMENT (Frontend Callback Verification)
  // =========================================================================
  router.post('/payment/verify-razorpay', async (req, res) => {
    try {
      const { orderId, razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;

      if (!orderId || !razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
        return res.status(400).json({ error: "Missing required payment details" });
      }

      // Cryptographic HMAC Verification
      const generatedBody = razorpayOrderId + "|" + razorpayPaymentId;
      const expectedSignature = crypto
        .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
        .update(generatedBody.toString())
        .digest("hex");

      if (expectedSignature !== razorpaySignature) {
        // Payment Verification Failed (Possible Tampering)
        await prisma.payment.update({
          where: { orderId: Number(orderId) },
          data: { status: "FAILED", gatewayPaymentId: razorpayPaymentId }
        });
        return res.status(400).json({ success: false, error: "Invalid payment signature" });
      }

      // Atomic Transaction: Update Payment to SUCCESS & Order to CONFIRMED
      const updatedOrder = await prisma.$transaction(async (tx) => {
        await tx.payment.update({
          where: { orderId: Number(orderId) },
          data: {
            status: "SUCCESS",
            gatewayPaymentId: razorpayPaymentId
          }
        });

        return await tx.order.update({
          where: { id: Number(orderId) },
          data: { status: "CONFIRMED" }
        });
      });

      res.json({
        success: true,
        message: "Payment verified successfully!",
        order: updatedOrder
      });
    } catch (error) {
      console.error("❌ Verify Payment Error:", error);
      res.status(500).json({ error: "Payment verification failed" });
    }
  });

  // =========================================================================
  // 3. CASH ON DELIVERY (COD Flow)
  // =========================================================================
  router.post('/payment/process-cod', async (req, res) => {
    try {
      const { orderId } = req.body;

      if (!orderId) {
        return res.status(400).json({ error: "orderId is required" });
      }

      const order = await prisma.order.findUnique({
        where: { id: Number(orderId) }
      });

      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }

      // Atomic Transaction: Create COD Payment record (PENDING) & Confirm Order
      const result = await prisma.$transaction(async (tx) => {
        const payment = await tx.payment.upsert({
          where: { orderId: Number(orderId) },
          update: {
            gateway: "COD",
            amount: order.totalAmount,
            status: "PENDING"
          },
          create: {
            orderId: Number(orderId),
            gateway: "COD",
            amount: order.totalAmount,
            status: "PENDING"
          }
        });

        const updatedOrder = await tx.order.update({
          where: { id: Number(orderId) },
          data: { status: "CONFIRMED" }
        });

        return { payment, order: updatedOrder };
      });

      res.status(200).json({
        success: true,
        message: "Order confirmed with Cash on Delivery!",
        data: result
      });
    } catch (error) {
      console.error("❌ COD Processing Error:", error);
      res.status(500).json({ error: "Failed to process COD order" });
    }
  });

  // =========================================================================
  // 4. RAZORPAY WEBHOOK (Fail-Safe Background Payment Capture)
  // =========================================================================
  // Note: App file me req.rawBody or express.raw parser configure karein webhook endpoint ke liye
  router.post('/payment/webhook/razorpay', async (req, res) => {
    try {
      const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
      const signature = req.headers['x-razorpay-signature'];

      // Webhook Signature Verification
      const shasum = crypto.createHmac('sha256', webhookSecret);
      shasum.update(JSON.stringify(req.body));
      const digest = shasum.digest('hex');

      if (digest !== signature) {
        return res.status(400).json({ error: "Invalid webhook signature" });
      }

      const event = req.body.event;

      if (event === 'payment.captured' || event === 'order.paid') {
        const paymentEntity = req.body.payload.payment.entity;
        const razorpayPaymentId = paymentEntity.id;
        const notes = paymentEntity.notes;
        const dbOrderId = Number(notes.orderId);

        if (dbOrderId) {
          await prisma.$transaction(async (tx) => {
            await tx.payment.upsert({
              where: { orderId: dbOrderId },
              update: { status: "SUCCESS", gatewayPaymentId: razorpayPaymentId },
              create: {
                orderId: dbOrderId,
                gateway: "Razorpay",
                amount: paymentEntity.amount / 100,
                status: "SUCCESS",
                gatewayPaymentId: razorpayPaymentId
              }
            });

            await tx.order.update({
              where: { id: dbOrderId },
              data: { status: "CONFIRMED" }
            });
          });
        }
      }

      res.status(200).json({ status: "ok" });
    } catch (error) {
      console.error("❌ Webhook Handling Error:", error);
      res.status(500).json({ error: "Webhook handler failed" });
    }
  });

  return router;
};