// const express = require('express');
// const jwt = require('jsonwebtoken');

// module.exports = function (prisma) {
//   const router = express.Router();

//   // --- Admin Verification Helper ---
//   async function verifyAdmin(req) {
//     const authHeader = req.headers.authorization;
//     if (!authHeader) throw new Error("Unauthorized");
//     const token = authHeader.split(' ')[1];
//     const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
//     const user = await prisma.user.findUnique({ where: { id: decoded.id } });
//     if (!user || user.role !== 'ADMIN') throw new Error("Access denied: Admins only");
//     return user.id;
//   }

//   // =========================================================================
//   // ADMIN DASHBOARD - 4 DABBE ANALYTICS API
//   // =========================================================================
//   router.get('/admin/analytics', async (req, res) => {
//     try {
//       await verifyAdmin(req);

//       // 1. Total Try-Ons Count (Dabba 1)
//       const totalTryOns = await prisma.tryOn.count();

//       // 2. Total Orders & Total Revenue (Dabba 2)
//       const orders = await prisma.order.findMany({
//         select: { totalAmount: true, shippingPincode: true, shippingCity: true }
//       });
//       const totalOrders = orders.length;
//       const totalRevenue = orders.reduce((sum, order) => sum + order.totalAmount, 0);

//       // 3. Top Pincodes / Areas (Dabba 3 - Kahan se sabse zyada orders aa rahe hain)
//       const pincodeMap = {};
//       orders.forEach(o => {
//         if (o.shippingPincode) {
//           pincodeMap[o.shippingPincode] = (pincodeMap[o.shippingPincode] || 0) + 1;
//         }
//       });
//       const topPincodes = Object.entries(pincodeMap)
//         .sort((a, b) => b[1] - a[1])
//         .slice(0, 5) // Top 5 areas
//         .map(([pincode, count]) => ({ pincode, orderCount: count }));

//       // 4. Try-On vs Orders Insights (Dabba 4 - Konsa product try-on hua par order nahi convert hua)
//       // Sabse zyada try-on hone wale garments aur unka product mapping nikalna
//       const popularTryOns = await prisma.tryOn.groupBy({
//         by: ['garmentId'],
//         _count: { garmentId: true },
//         orderBy: { _count: { garmentId: 'desc' } },
//         take: 5
//       });

//       const garmentInsights = [];
//       for (const t of popularTryOns) {
//         const garment = await prisma.garment.findUnique({
//           where: { id: t.garmentId },
//           include: { product: true }
//         });
//         if (garment) {
//           garmentInsights.live = {
//             garmentName: garment.name,
//             tryOnCount: t._count.garmentId,
//             productId: garment.productId || null
//           };
//           garmentInsights.push(garmentInsights.live);
//         }
//       }

//       res.json({
//         success: true,
//         analytics: {
//           totalTryOns,                  // 1. Try-On count
//           totalOrders,                  // 2. Total Orders
//           totalRevenue: parseFloat(totalRevenue.toFixed(2)), // 2. Total Paisa
//           topPincodes,                  // 3. Top Areas/Pincodes
//           garmentInsights               // 4. Try-On product trends
//         }
//       });

//     } catch (error) {
//       console.error("Admin Analytics Error:", error.message);
//       if (error.message.includes("Unauthorized") || error.message.includes("Access denied")) {
//         return res.status(403).json({ error: error.message });
//       }
//       res.status(500).json({ error: "Internal Server Error" });
//     }
//   });

//   return router;
// };
















const express = require('express');
const jwt = require('jsonwebtoken');

module.exports = function (prisma, sendNotification) {
  const router = express.Router();

  // --- Admin Verification Helper ---
  async function verifyAdmin(req) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) throw new Error("Unauthorized");
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await prisma.user.findUnique({ where: { id: Number(decoded.id) } });
    if (!user || user.role !== 'ADMIN') throw new Error("Access denied: Admins only");
    return user.id;
  }

  function handleAdminError(res, error, logLabel) {
    if (logLabel) console.error(logLabel, error);
    if (
      error.message === "Unauthorized" ||
      error.name === "JsonWebTokenError" ||
      error.name === "TokenExpiredError"
    ) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (error.message === "Access denied: Admins only") {
      return res.status(403).json({ error: error.message });
    }
    return res.status(500).json({ error: "Internal Server Error" });
  }

  async function notifyUserSafe(payload) {
    if (typeof sendNotification !== 'function') return;
    try {
      await sendNotification(payload);
    } catch (err) {
      console.error("⚠️ Admin notification error:", err.message);
    }
  }

  // =========================================================================
  // ADMIN DASHBOARD - 4 DABBE ANALYTICS API
  // =========================================================================
  router.get('/admin/analytics', async (req, res) => {
    try {
      await verifyAdmin(req);

      const totalTryOns = await prisma.tryOn.count();

      const orders = await prisma.order.findMany({
        select: { totalAmount: true, shippingPincode: true, shippingCity: true }
      });
      const totalOrders = orders.length;
      const totalRevenue = orders.reduce((sum, order) => sum + order.totalAmount, 0);

      const pincodeMap = {};
      orders.forEach(o => {
        if (o.shippingPincode) {
          pincodeMap[o.shippingPincode] = (pincodeMap[o.shippingPincode] || 0) + 1;
        }
      });
      const topPincodes = Object.entries(pincodeMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([pincode, count]) => ({ pincode, orderCount: count }));

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
          garmentInsights.push({
            garmentName: garment.name,
            tryOnCount: t._count.garmentId,
            productId: garment.productId || null
          });
        }
      }

      res.json({
        success: true,
        analytics: {
          totalTryOns,
          totalOrders,
          totalRevenue: parseFloat(totalRevenue.toFixed(2)),
          topPincodes,
          garmentInsights
        }
      });
    } catch (error) {
      return handleAdminError(res, error, "Admin Analytics Error:");
    }
  });

  // =========================================================================
  // STORE CONFIG - COD HANDLING FEE
  // =========================================================================
  router.get('/admin/store-config/cod-fee', async (req, res) => {
    try {
      await verifyAdmin(req);
      const config = await prisma.storeConfig.findFirst({ where: { id: 1 } });
      return res.json({ codFee: config?.codFee ?? 0, config });
    } catch (error) {
      return handleAdminError(res, error, "Get COD Fee Error:");
    }
  });

  router.patch('/admin/store-config/cod-fee', async (req, res) => {
    try {
      await verifyAdmin(req);
      const numericFee = Number(req.body?.codFee);
      if (!Number.isFinite(numericFee) || numericFee < 0 || numericFee > 1000) {
        return res.status(400).json({ error: "codFee must be a valid number between 0 and 1000" });
      }

      const roundedFee = parseFloat(numericFee.toFixed(2));
      const existing = await prisma.storeConfig.findFirst({ where: { id: 1 } });

      const updatedConfig = existing
        ? await prisma.storeConfig.update({
            where: { id: existing.id },
            data: { codFee: roundedFee }
          })
        : await prisma.storeConfig.create({
            data: { id: 1, codFee: roundedFee }
          });

      return res.json({
        message: "COD fee updated successfully",
        codFee: updatedConfig.codFee,
        config: updatedConfig
      });
    } catch (error) {
      return handleAdminError(res, error, "Update COD Fee Error:");
    }
  });

  // =========================================================================
  // ADMIN RETURN / EXCHANGE / DAMAGED-REFUND MANAGEMENT
  // =========================================================================
  const ALLOWED_RETURN_STATUSES = [
    'REQUESTED',
    'APPROVED',
    'PICKUP_SCHEDULED',
    'RECEIVED',
    'INSPECTED',
    'EXCHANGE_DISPATCHED',
    'REFUND_INITIATED',
    'COMPLETED',
    'REJECTED'
  ];

  router.get('/admin/returns', async (req, res) => {
    try {
      await verifyAdmin(req);
      const where = {};
      if (req.query?.status && String(req.query.status).toUpperCase() !== 'ALL') {
        where.status = String(req.query.status).toUpperCase();
      }
      if (req.query?.type && String(req.query.type).toUpperCase() !== 'ALL') {
        where.type = String(req.query.type).toUpperCase();
      }

      const requests = await prisma.returnRequest.findMany({
        where,
        include: {
          user: { include: { profile: true } },
          order: { select: { id: true, status: true, shippingName: true, shippingPhone: true, shippingCity: true } },
          orderItem: { include: { product: { include: { images: true, brand: true } } } }
        },
        orderBy: { createdAt: 'desc' }
      });

      return res.json({ count: requests.length, requests });
    } catch (error) {
      return handleAdminError(res, error, "Admin List Returns Error:");
    }
  });

  router.patch('/admin/returns/:returnId/status', async (req, res) => {
    try {
      await verifyAdmin(req);
      const returnId = Number(req.params.returnId);
      if (!Number.isInteger(returnId) || returnId <= 0) {
        return res.status(400).json({ error: "Invalid return request ID" });
      }

      const existing = await prisma.returnRequest.findUnique({
        where: { id: returnId },
        include: {
          orderItem: { include: { product: true } }
        }
      });
      if (!existing) {
        return res.status(404).json({ error: "Return request not found" });
      }

      const nextStatus = req.body?.status ? String(req.body.status).toUpperCase() : null;
      if (!nextStatus || !ALLOWED_RETURN_STATUSES.includes(nextStatus)) {
        return res.status(400).json({ error: "Invalid return status" });
      }

      if (existing.type === 'REFUND' && nextStatus === 'EXCHANGE_DISPATCHED') {
        return res.status(400).json({ error: "Cannot dispatch exchange for a REFUND request" });
      }
      if (existing.type === 'EXCHANGE' && nextStatus === 'REFUND_INITIATED') {
        return res.status(400).json({ error: "Cannot initiate refund for an EXCHANGE request" });
      }

      const updateData = { status: nextStatus };
      if (typeof req.body?.adminNote === 'string') {
        updateData.adminNote = req.body.adminNote.trim() || null;
      }
      if (typeof req.body?.refundRef === 'string') {
        updateData.refundRef = req.body.refundRef.trim() || null;
      }

      const updated = await prisma.returnRequest.update({
        where: { id: returnId },
        data: updateData,
        include: {
          orderItem: { include: { product: true } }
        }
      });

      await notifyUserSafe({
        userId: existing.userId,
        title: `${existing.type === 'REFUND' ? 'Refund' : 'Exchange'} Update — ${nextStatus}`,
        message: `Your ${existing.type.toLowerCase()} request for Order #SYV-${existing.orderId} is now ${nextStatus}.`,
        orderId: existing.orderId,
        productId: existing.orderItem?.productId || null
      });

      return res.json({
        message: "Return request updated successfully",
        returnRequest: updated
      });
    } catch (error) {
      return handleAdminError(res, error, "Admin Update Return Error:");
    }
  });

  return router;
};