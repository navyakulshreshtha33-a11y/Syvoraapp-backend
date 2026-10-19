const express = require('express');
const multer = require('multer');
const cloudinary = require('../services/cloudinary');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const uploadToCloudinary = (buffer, folder) => {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload_stream({ folder }, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    }).end(buffer);
  });
};

module.exports = (prisma) => {
  const router = express.Router();

  // POST /api/reviews - Create review with photos (Cloudinary)
  router.post('/', upload.array('photos', 4), async (req, res) => {
    const { userId, productId, rating, title, comment } = req.body;
    if (!userId || !productId || !rating) return res.status(400).json({ error: "userId, productId, rating required" });
    const r = parseInt(rating);
    if (r < 1 || r > 5) return res.status(400).json({ error: "Rating 1-5 only" });

    try {
      const product = await prisma.product.findUnique({ where: { id: parseInt(productId) } });
      if (!product) return res.status(404).json({ error: "Product not found" });

      const existing = await prisma.review.findUnique({
        where: { userId_productId: { userId: parseInt(userId), productId: parseInt(productId) } }
      });
      if (existing) return res.status(400).json({ error: "You already reviewed" });

      let isVerified = false;
      const ordered = await prisma.order.findFirst({
        where: { userId: parseInt(userId), status: { in: ["DELIVERED", "COMPLETED", "PAID"] }, items: { some: { productId: parseInt(productId) } } }
      });
      if (ordered) isVerified = true;

      const review = await prisma.review.create({
        data: { userId: parseInt(userId), productId: parseInt(productId), rating: r, title: title || null, comment: comment || null, isVerifiedPurchase: isVerified }
      });

      if (req.files?.length) {
        for (const file of req.files) {
          const result = await uploadToCloudinary(file.buffer, 'syvora/reviews');
          await prisma.reviewImage.create({ data: { reviewId: review.id, imageUrl: result.secure_url, publicId: result.public_id } });
        }
      }

      const fullReview = await prisma.review.findUnique({ where: { id: review.id }, include: { images: true, user: { include: { profile: true } } } });
      res.status(201).json(fullReview);
    } catch (e) {
      console.log("Review create error:", e);
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/reviews/product/:productId
  router.get('/product/:productId', async (req, res) => {
    try {
      const pid = parseInt(req.params.productId);
      const reviews = await prisma.review.findMany({ where: { productId: pid }, include: { images: true, user: { include: { profile: true } } }, orderBy: { createdAt: 'desc' } });
      const stats = await prisma.review.aggregate({ where: { productId: pid }, _avg: { rating: true }, _count: { rating: true } });
      const breakdown = await prisma.review.groupBy({ by: ['rating'], where: { productId: pid }, _count: { rating: true } });
      res.json({ avgRating: stats._avg.rating ? Number(stats._avg.rating.toFixed(1)) : 0, totalReviews: stats._count.rating, breakdown, reviews });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // GET /api/reviews/user/:userId
  router.get('/user/:userId', async (req, res) => {
    try {
      const reviews = await prisma.review.findMany({ where: { userId: parseInt(req.params.userId) }, include: { images: true, product: { include: { images: true } } }, orderBy: { createdAt: 'desc' } });
      res.json(reviews);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // PUT /api/reviews/:id
  router.put('/:id', upload.array('photos', 4), async (req, res) => {
    const { userId, rating, title, comment } = req.body;
    try {
      const review = await prisma.review.findUnique({ where: { id: parseInt(req.params.id) } });
      if (!review) return res.status(404).json({ error: "Not found" });
      if (review.userId !== parseInt(userId)) return res.status(403).json({ error: "Not yours" });
      const data = {};
      if (rating) data.rating = parseInt(rating);
      if (title !== undefined) data.title = title || null;
      if (comment !== undefined) data.comment = comment || null;
      await prisma.review.update({ where: { id: review.id }, data });
      if (req.files?.length) {
        for (const file of req.files) {
          const result = await uploadToCloudinary(file.buffer, 'syvora/reviews');
          await prisma.reviewImage.create({ data: { reviewId: review.id, imageUrl: result.secure_url, publicId: result.public_id } });
        }
      }
      const full = await prisma.review.findUnique({ where: { id: review.id }, include: { images: true } });
      res.json(full);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // DELETE /api/reviews/:id
  router.delete('/:id', async (req, res) => {
    const { userId } = req.body;
    try {
      const review = await prisma.review.findUnique({ where: { id: parseInt(req.params.id) }, include: { images: true } });
      if (!review) return res.status(404).json({ error: "Not found" });
      if (review.userId !== parseInt(userId)) return res.status(403).json({ error: "Not yours" });
      for (const img of review.images) { if (img.publicId) try { await cloudinary.uploader.destroy(img.publicId); } catch {} }
      await prisma.review.delete({ where: { id: review.id } });
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  return router;
};