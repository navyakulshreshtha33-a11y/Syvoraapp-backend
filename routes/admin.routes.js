const express = require('express');
const jwt = require('jsonwebtoken');

module.exports = function (prisma) {
  const router = express.Router();

  // --- Admin Verification Helper ---
  async function verifyAdmin(req) {
    const authHeader = req.headers.authorization;
    if (!authHeader) throw new Error("Unauthorized");
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    const user = await prisma.user.findUnique({ where: { id: decoded.id } });
    if (!user || user.role !== 'ADMIN') throw new Error("Access denied: Admins only");
    return user.id;
  }

  // =========================================================================
  // ADMIN DASHBOARD - 4 DABBE ANALYTICS API
  // =========================================================================
  router.get('/admin/analytics', async (req, res) => {
    try {
      await verifyAdmin(req);

      // 1. Total Try-Ons Count (Dabba 1)
      const totalTryOns = await prisma.tryOn.count();

      // 2. Total Orders & Total Revenue (Dabba 2)
      const orders = await prisma.order.findMany({
        select: { totalAmount: true, shippingPincode: true, shippingCity: true }
      });
      const totalOrders = orders.length;
      const totalRevenue = orders.reduce((sum, order) => sum + order.totalAmount, 0);

      // 3. Top Pincodes / Areas (Dabba 3 - Kahan se sabse zyada orders aa rahe hain)
      const pincodeMap = {};
      orders.forEach(o => {
        if (o.shippingPincode) {
          pincodeMap[o.shippingPincode] = (pincodeMap[o.shippingPincode] || 0) + 1;
        }
      });
      const topPincodes = Object.entries(pincodeMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5) // Top 5 areas
        .map(([pincode, count]) => ({ pincode, orderCount: count }));

      // 4. Try-On vs Orders Insights (Dabba 4 - Konsa product try-on hua par order nahi convert hua)
      // Sabse zyada try-on hone wale garments aur unka product mapping nikalna
      const popularTryOns = await prisma.tryOn.groupBy({
        by: ['garmentId'],
        _count: { garmentId: true },
        orderBy: { _count: { garmentId: 'desc' } },
        take: 5
      });

      const garmentInsights = [];
      for (const t of popularTryOns) {
        const garment = await prisma.garment.findUnique({
          where: { id: t.garmentId },
          include: { product: true }
        });
        if (garment) {
          garmentInsights.live = {
            garmentName: garment.name,
            tryOnCount: t._count.garmentId,
            productId: garment.productId || null
          };
          garmentInsights.push(garmentInsights.live);
        }
      }

      res.json({
        success: true,
        analytics: {
          totalTryOns,                  // 1. Try-On count
          totalOrders,                  // 2. Total Orders
          totalRevenue: parseFloat(totalRevenue.toFixed(2)), // 2. Total Paisa
          topPincodes,                  // 3. Top Areas/Pincodes
          garmentInsights               // 4. Try-On product trends
        }
      });

    } catch (error) {
      console.error("Admin Analytics Error:", error.message);
      if (error.message.includes("Unauthorized") || error.message.includes("Access denied")) {
        return res.status(403).json({ error: error.message });
      }
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  return router;
};