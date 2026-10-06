const express = require('express');

module.exports = function (prisma) {
  const router = express.Router();

  // =========================================================================
  // 1. ADD / UPDATE REVIEW (With Automatic Verified Purchase Check)
  // =========================================================================
  router.post('/reviews', async (req, res) => {
    try {
      const { userId, productId, rating, title, comment, images } = req.body;

      if (!userId || !productId || !rating) {
        return res.status(400).json({ error: "userId, productId aur rating required hain." });
      }

      if (rating < 1 || rating > 5) {
        return res.status(400).json({ error: "Rating 1 se 5 ke beech honi chahiye." });
      }

      // Check if user has actually bought and received this product
      const existingOrder = await prisma.order.findFirst({
        where: {
          userId: Number(userId),
          status: { in: ["DELIVERED", "CONFIRMED", "SHIPPED"] },
          items: {
            some: { productId: Number(productId) }
          }
        }
      });

      const isVerifiedPurchase = Boolean(existingOrder);

      // Upsert Review (Create if new, Update if already exists)
      const review = await prisma.review.upsert({
        where: {
          userId_productId: {
            userId: Number(userId),
            productId: Number(productId)
          }
        },
        update: {
          rating: Number(rating),
          title,
          comment,
          isVerifiedPurchase,
          images: images && images.length > 0 ? {
            deleteMany: {}, // Purani images clear karke naye add karo
            create: images.map(url => ({ imageUrl: url }))
          } : undefined
        },
        create: {
          userId: Number(userId),
          productId: Number(productId),
          rating: Number(rating),
          title,
          comment,
          isVerifiedPurchase,
          images: images && images.length > 0 ? {
            create: images.map(url => ({ imageUrl: url }))
          } : undefined
        },
        include: {
          images: true,
          user: {
            select: {
              id: true,
              profile: { select: { name: true } }
            }
          }
        }
      });

      res.status(200).json({
        success: true,
        message: "Review successfully save ho gaya!",
        review
      });
    } catch (error) {
      console.error("❌ Add Review Error:", error);
      res.status(500).json({ error: "Review submit karne me issue aaya." });
    }
  });

  // =========================================================================
  // 2. GET PRODUCT REVIEWS & RATING STATS (With Breakdown)
  // =========================================================================
  router.get('/reviews/product/:productId', async (req, res) => {
    try {
      const { productId } = req.params;
      const { page = 1, limit = 10, ratingFilter } = req.query;

      const skip = (Number(page) - 1) * Number(limit);

      // Where filter dynamically set karenge
      const whereCondition = {
        productId: Number(productId),
        ...(ratingFilter ? { rating: Number(ratingFilter) } : {})
      };

      // Reviews list with Pagination
      const [reviews, totalCount, allRatings] = await Promise.all([
        prisma.review.findMany({
          where: whereCondition,
          take: Number(limit),
          skip: Number(skip),
          orderBy: { createdAt: 'desc' },
          include: {
            images: true,
            user: {
              select: {
                id: true,
                profile: { select: { name: true } }
              }
            }
          }
        }),
        prisma.review.count({ where: whereCondition }),
        // Stats calculate karne ke liye saare ratings fetch karenge
        prisma.review.findMany({
          where: { productId: Number(productId) },
          select: { rating: true }
        })
      ]);

      // Rating Statistics Calculation
      const totalReviews = allRatings.length;
      let averageRating = 0;
      const ratingBreakdown = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

      if (totalReviews > 0) {
        const sum = allRatings.reduce((acc, curr) => {
          ratingBreakdown[curr.rating] = (ratingBreakdown[curr.rating] || 0) + 1;
          return acc + curr.rating;
        }, 0);
        averageRating = Number((sum / totalReviews).toFixed(1));
      }

      res.status(200).json({
        success: true,
        stats: {
          averageRating,
          totalReviews,
          ratingBreakdown
        },
        pagination: {
          currentPage: Number(page),
          totalPages: Math.ceil(totalCount / Number(limit)),
          totalFilteredReviews: totalCount
        },
        reviews
      });
    } catch (error) {
      console.error("❌ Fetch Reviews Error:", error);
      res.status(500).json({ error: "Reviews fetch karne me error aaya." });
    }
  });

  // =========================================================================
  // 3. DELETE A REVIEW
  // =========================================================================
  router.delete('/reviews/:reviewId', async (req, res) => {
    try {
      const { reviewId } = req.params;
      const { userId } = req.body; // User verification

      const review = await prisma.review.findUnique({
        where: { id: Number(reviewId) }
      });

      if (!review) {
        return res.status(404).json({ error: "Review nahi mila." });
      }

      // Check ownership (Only author or Admin can delete)
      if (userId && review.userId !== Number(userId)) {
        return res.status(403).json({ error: "Aap is review ko delete nahi kar sakte." });
      }

      await prisma.review.delete({
        where: { id: Number(reviewId) }
      });

      res.status(200).json({
        success: true,
        message: "Review delete ho gaya."
      });
    } catch (error) {
      console.error("❌ Delete Review Error:", error);
      res.status(500).json({ error: "Review delete karne me error aaya." });
    }
  });

  return router;
};