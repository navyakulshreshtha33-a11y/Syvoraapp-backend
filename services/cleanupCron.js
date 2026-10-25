require('dotenv').config();
const cloudinary = require('./cloudinary');

let prismaInstance = null;

async function cleanupExpiredTryOns(externalPrisma = null) {
  const prisma = externalPrisma || prismaInstance;
  if(!prisma){ console.log("[CRON] Skip - no prisma instance yet"); return; }

  console.log("[CRON] Checking expired VTO, Logs & Pending Payments...");
  
  try {
    // 1. VTO Photos - 1hr DPDP
    const expired = await prisma.tryOn.findMany({
      where: { status: { not: 'DELETED' }, createdAt: { lt: new Date(Date.now() - 60*60*1000) } },
      include: { userPhoto: true }, take: 20
    });
    for (const item of expired) {
      try {
        if (item.resultPublicId) await cloudinary.uploader.destroy(item.resultPublicId).catch(()=>{});
        if (item.userPhoto?.cloudinaryPublicId) await cloudinary.uploader.destroy(item.userPhoto.cloudinaryPublicId).catch(()=>{});
        await prisma.tryOn.update({ where: { id: item.id }, data: { status: 'DELETED', resultUrl: null, resultPublicId: null } }).catch(()=>{});
        if(item.userPhoto) await prisma.userPhoto.update({ where: { id: item.userPhoto.id }, data: { isDeleted: true } }).catch(()=>{});
        console.log(`[CRON] VTO Deleted: ${item.id}`);
        if(global.gc) global.gc();
      } catch (e) { console.error(`[CRON] Fail ${item.id}:`, e.message); }
    }

    try{
      const orphanPhotos = await prisma.userPhoto.findMany({ where: { expiresAt: { lt: new Date() }, isDeleted: false }, take: 20 });
      for(const p of orphanPhotos){
        try{ if(p.cloudinaryPublicId) await cloudinary.uploader.destroy(p.cloudinaryPublicId).catch(()=>{}); await prisma.userPhoto.update({ where: { id: p.id }, data: { isDeleted: true } }).catch(()=>{}); }catch(e){}
      }
    }catch(e){ console.error("[CRON] orphanPhotos error:", e.message); }

    // 2. DataAccessLog 180 days
    try{
      const deletedLogs = await prisma.dataAccessLog.deleteMany({ where: { createdAt: { lt: new Date(Date.now()-180*24*60*60*1000) } } });
      if(deletedLogs.count>0) console.log(`[CRON] Logs deleted: ${deletedLogs.count}`);
    }catch(e){ console.error("[CRON] logs error:", e.message); }

    // 3. Orders anonymize
    try{
      await prisma.order.updateMany({
        where: { createdAt: { lt: new Date(Date.now()-180*24*60*60*1000) }, status: "DELIVERED" },
        data: { shippingName: "DELETED", shippingPhone: "DELETED", shippingLine: "DELETED", shippingCity: "DELETED" }
      });
    }catch(e){ console.error("[CRON] order anon error:", e.message); }

    // 4. === NEW: RAZORPAY PENDING PAYMENT - RESERVED STOCK RELEASE (10 min) ===
    try{
      const tenMinsAgo = new Date(Date.now() - 10 * 60 * 1000);
      const pendingOrders = await prisma.order.findMany({
        where: { status: "PAYMENT_PENDING", createdAt: { lt: tenMinsAgo } },
        include: { items: true }
      });

      for(const order of pendingOrders){
        try{
          // Reserved stock wapas karo
          for(const item of order.items){
            // Agar orderItems me item nahi hai to cart se karna padega, but yahan order me items honge verify fail case me
            // Safe check: agar item hai toh release
            await prisma.productSizeChart.updateMany({
              where: { productId: item.productId, size: item.size },
              data: { reservedStock: { decrement: item.quantity } }
            }).catch(()=>{});
          }
          // Order ko fail mark karo
          await prisma.order.update({ where: { id: order.id }, data: { status: "FAILED" } });
          await prisma.payment.update({ where: { orderId: order.id }, data: { status: "FAILED" } }).catch(()=>{});
          console.log(`[CRON] Released reserved stock for Order ${order.id}`);
        }catch(e){ console.error(`[CRON] Pending order release fail ${order.id}:`, e.message); }
      }

      // Extra: Agar cart pe reserve kiya tha aur order hi nahi bana (create-order ke baad crash), to uska bhi release
      // Iske liye hum ProductSizeChart ka reservedStock check karenge jo 10 min se zyada purana hai - manual cleanup ke liye
      // Simple approach: Jo bhi reservedStock > 0 hai aur uska koi PENDING order 10 min purana nahi hai, woh cron next time handle karega

    }catch(e){ console.error("[CRON] pending payment release error:", e.message); }

  } catch (outerErr) {
    console.error("⚠️ [CRON] Outer error (skip, server will run):", outerErr.code || outerErr.message);
    return;
  }
}

function startCleanupCron(prisma = null) {
  if(prisma) prismaInstance = prisma;
  console.log("✅ Cleanup cron scheduled - first run in 15 sec");
  setTimeout(() => { cleanupExpiredTryOns(prismaInstance); }, 15000);
  setInterval(() => { cleanupExpiredTryOns(prismaInstance); }, 60 * 1000); // har 1 min check (payment ke liye)
}

module.exports = { startCleanupCron, cleanupExpiredTryOns };