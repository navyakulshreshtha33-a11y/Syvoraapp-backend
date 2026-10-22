const express = require('express');
const multer = require('multer');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const fileType = require('file-type');
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

  function getUserIdFromToken(req){
    const authHeader = req.headers.authorization;
    if(!authHeader) throw new Error("Unauthorized");
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return decoded.id;
  }

  const reviewSchema = z.object({
    productId: z.number().int().positive(),
    rating: z.number().int().min(1).max(5),
    title: z.string().max(100).optional(),
    comment: z.string().max(500).optional()
  });

  // POST /api/reviews - SECURED
  router.post('/', upload.array('photos', 4), async (req, res) => {
    try {
      const userId = getUserIdFromToken(req); // body se nahi
      const parsed = reviewSchema.safeParse({
        productId: Number(req.body.productId),
        rating: Number(req.body.rating),
        title: req.body.title,
        comment: req.body.comment
      });
      if(!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
      const { productId, rating, title, comment } = parsed.data;

      // File-type check (Point 25)
      if(req.files?.length){
        for(const f of req.files){
          const type = await fileType.fileTypeFromBuffer(f.buffer);
          if(!type || !['image/jpeg','image/png','image/webp'].includes(type.mime)){
            return res.status(400).json({ error: "Only jpeg/png/webp allowed" });
          }
        }
      }

      const product = await prisma.product.findUnique({ where: { id: productId } });
      if (!product) return res.status(404).json({ error: "Product not found" });

      const existing = await prisma.review.findUnique({
        where: { userId_productId: { userId, productId } }
      });
      if (existing) return res.status(400).json({ error: "You already reviewed" });

      // Point 22: Verified purchase check - DELIVERED/COMPLETED/PAID
      let isVerified = false;
      const ordered = await prisma.order.findFirst({
        where: { userId, status: { in: ["DELIVERED", "COMPLETED", "PAID"] }, items: { some: { productId } } }
      });
      if (ordered) isVerified = true;

      const review = await prisma.review.create({
        data: { userId, productId, rating, title: title || null, comment: comment || null, isVerifiedPurchase: isVerified }
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
      if(e.message === "Unauthorized") return res.status(401).json({ error: "Invalid token" });
      console.log("Review create error:", e);
      res.status(500).json({ error: e.message });
    }
  });

  // GET product - public, no auth needed
  router.get('/product/:productId', async (req, res) => {
    try {
      const pid = parseInt(req.params.productId);
      if(isNaN(pid)) return res.status(400).json({ error: "Invalid productId" });
      const reviews = await prisma.review.findMany({ where: { productId: pid }, include: { images: true, user: { include: { profile: true } } }, orderBy: { createdAt: 'desc' } });
      const stats = await prisma.review.aggregate({ where: { productId: pid }, _avg: { rating: true }, _count: { rating: true } });
      const breakdown = await prisma.review.groupBy({ by: ['rating'], where: { productId: pid }, _count: { rating: true } });
      res.json({ avgRating: stats._avg.rating ? Number(stats._avg.rating.toFixed(1)) : 0, totalReviews: stats._count.rating, breakdown, reviews });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // GET user - IDOR FIX
  router.get('/user/:userId', async (req, res) => {
    try {
      const tokenUserId = getUserIdFromToken(req);
      const paramUserId = parseInt(req.params.userId);
      if(tokenUserId !== paramUserId){
        const user = await prisma.user.findUnique({ where: { id: tokenUserId } });
        if(user.role !== 'ADMIN') return res.status(403).json({ error: "Access denied" });
      }
      const reviews = await prisma.review.findMany({ where: { userId: paramUserId }, include: { images: true, product: { include: { images: true } } }, orderBy: { createdAt: 'desc' } });
      res.json(reviews);
    } catch (e) { if(e.message === "Unauthorized") return res.status(401).json({ error: "Invalid token" }); res.status(500).json({ error: e.message }); }
  });

  // PUT - IDOR + JWT
  router.put('/:id', upload.array('photos', 4), async (req, res) => {
    try {
      const userId = getUserIdFromToken(req);
      const review = await prisma.review.findUnique({ where: { id: parseInt(req.params.id) } });
      if (!review) return res.status(404).json({ error: "Not found" });
      if (review.userId !== userId) return res.status(403).json({ error: "Not yours" });
      
      const data = {};
      if (req.body.rating) data.rating = parseInt(req.body.rating);
      if (req.body.title !== undefined) data.title = req.body.title || null;
      if (req.body.comment !== undefined) data.comment = req.body.comment || null;
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

  // DELETE - IDOR + JWT
  router.delete('/:id', async (req, res) => {
    try {
      const userId = getUserIdFromToken(req);
      const review = await prisma.review.findUnique({ where: { id: parseInt(req.params.id) }, include: { images: true } });
      if (!review) return res.status(404).json({ error: "Not found" });
      if (review.userId !== userId) return res.status(403).json({ error: "Not yours" });
      for (const img of review.images) { if (img.publicId) try { await cloudinary.uploader.destroy(img.publicId); } catch {} }
      await prisma.review.delete({ where: { id: review.id } });
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  return router;
};