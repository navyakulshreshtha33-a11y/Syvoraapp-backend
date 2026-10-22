require('dotenv').config();
const cloudinary = require('./cloudinary');

// Baby - same prisma use karenge jo server.js me hai, alag pool nahi banayenge
let prismaInstance = null;

async function cleanupExpiredTryOns(externalPrisma = null) {
  const prisma = externalPrisma || prismaInstance;
  
  // Agar prisma hi nahi mila toh skip
  if(!prisma){
    console.log("[CRON] Skip - no prisma instance yet");
    return;
  }

  console.log("[CRON] Checking expired VTO & Logs...");
  
  try {
    // 1. VTO Photos - 1hr DPDP (Point 28) - FIXED QUERY
    const expired = await prisma.tryOn.findMany({
      where: { 
        status: { not: 'DELETED' },
        createdAt: { lt: new Date(Date.now() - 60*60*1000) } // 1 hr purana
      },
      include: { userPhoto: true },
      take: 20 // baby ek baar me 20 hi delete karenge, DB load nahi
    });

    for (const item of expired) {
      try {
        if (item.resultPublicId) {
          await cloudinary.uploader.destroy(item.resultPublicId).catch(()=>{});
        }
        if (item.userPhoto?.cloudinaryPublicId) {
          await cloudinary.uploader.destroy(item.userPhoto.cloudinaryPublicId).catch(()=>{});
        }
        
        await prisma.tryOn.update({ 
          where: { id: item.id }, 
          data: { status: 'DELETED', resultUrl: null, resultPublicId: null } 
        }).catch(()=>{});
        
        if(item.userPhoto){
          await prisma.userPhoto.update({ 
            where: { id: item.userPhoto.id }, 
            data: { isDeleted: true } 
          }).catch(()=>{});
        }
        
        console.log(`[CRON] VTO Deleted: ${item.id}`);
        
        // RAM clear - Point 27
        if(global.gc) global.gc();
        
      } catch (e) {
        console.error(`[CRON] Fail ${item.id}:`, e.message);
      }
    }

    // Direct expired UserPhoto without TryOn
    try{
      const orphanPhotos = await prisma.userPhoto.findMany({
        where: { expiresAt: { lt: new Date() }, isDeleted: false },
        take: 20
      });
      for(const p of orphanPhotos){
        try{
          if(p.cloudinaryPublicId) await cloudinary.uploader.destroy(p.cloudinaryPublicId).catch(()=>{});
          await prisma.userPhoto.update({ where: { id: p.id }, data: { isDeleted: true } }).catch(()=>{});
        }catch(e){}
      }
    }catch(e){ console.error("[CRON] orphanPhotos error:", e.message); }

    // 2. DataAccessLog 180 days retention (Point 32)
    try{
      const deletedLogs = await prisma.dataAccessLog.deleteMany({ 
        where: { createdAt: { lt: new Date(Date.now()-180*24*60*60*1000) } } 
      });
      if(deletedLogs.count>0) console.log(`[CRON] Logs deleted: ${deletedLogs.count}`);
    }catch(e){ console.error("[CRON] logs error:", e.message); }

    // 3. Orders anonymize after 180 days (Point 32)
    try{
      await prisma.order.updateMany({
        where: { createdAt: { lt: new Date(Date.now()-180*24*60*60*1000) }, status: "DELIVERED" },
        data: { shippingName: "DELETED", shippingPhone: "DELETED", shippingLine: "DELETED", shippingCity: "DELETED" }
      });
    }catch(e){ console.error("[CRON] order anon error:", e.message); }

  } catch (outerErr) {
    // YEHI MAIN FIX HAI BABY - outer catch se kabhi exit nahi hoga
    console.error("⚠️ [CRON] Outer error (skip, server will run):", outerErr.code || outerErr.message);
    return;
  }
}

function startCleanupCron(prisma = null) {
  if(prisma) prismaInstance = prisma;
  
  console.log("✅ Cleanup cron scheduled - first run in 15 sec");
  
  // Baby 15 sec wait - DB ko connect hone de
  setTimeout(() => {
    cleanupExpiredTryOns(prismaInstance);
  }, 15000);
  
  // Har 1 ghante
  setInterval(() => {
    cleanupExpiredTryOns(prismaInstance);
  }, 60 * 60 * 1000);
}

module.exports = { startCleanupCron, cleanupExpiredTryOns };