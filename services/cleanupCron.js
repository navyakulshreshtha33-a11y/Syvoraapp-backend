require('dotenv').config();
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('../generated/client');
const cloudinary = require('./cloudinary');

const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function cleanupExpiredTryOns() {
  console.log("[CRON] Checking expired VTO & Logs...");
  
  // 1. VTO Photos - 1hr DPDP (Point 28)
  const expired = await prisma.tryOn.findMany({
    where: { 
      userPhoto: { expiresAt: { lt: new Date() }, isDeleted: false },
      status: { not: 'DELETED' } 
    },
    include: { userPhoto: true }
  });

  for (const item of expired) {
    try {
      if (item.resultPublicId) await cloudinary.uploader.destroy(item.resultPublicId);
      if (item.userPhoto?.cloudinaryPublicId) await cloudinary.uploader.destroy(item.userPhoto.cloudinaryPublicId);
      await prisma.tryOn.update({ where: { id: item.id }, data: { status: 'DELETED', resultUrl: null, resultPublicId: null } });
      await prisma.userPhoto.update({ where: { id: item.userPhoto.id }, data: { isDeleted: true } });
      // RAM clear Point 27
      console.log(`[CRON] VTO Deleted: ${item.id}`);
    } catch (e) {
      console.error(`[CRON] Fail ${item.id}:`, e.message);
    }
  }

  // Direct expired UserPhoto without TryOn
  const orphanPhotos = await prisma.userPhoto.findMany({
    where: { expiresAt: { lt: new Date() }, isDeleted: false }
  });
  for(const p of orphanPhotos){
    try{
      if(p.cloudinaryPublicId) await cloudinary.uploader.destroy(p.cloudinaryPublicId);
      await prisma.userPhoto.update({ where: { id: p.id }, data: { isDeleted: true } });
    }catch(e){}
  }

  // 2. DataAccessLog 180 days retention (Point 32)
  try{
    const deletedLogs = await prisma.dataAccessLog.deleteMany({ 
      where: { createdAt: { lt: new Date(Date.now()-180*24*60*60*1000) } } 
    });
    if(deletedLogs.count>0) console.log(`[CRON] Logs deleted: ${deletedLogs.count}`);
  }catch(e){}

  // 3. Orders anonymize after 180 days (Point 32)
  try{
    await prisma.order.updateMany({
      where: { createdAt: { lt: new Date(Date.now()-180*24*60*60*1000) }, status: "DELIVERED" },
      data: { shippingName: "DELETED", shippingPhone: "DELETED", shippingLine: "DELETED", shippingCity: "DELETED" }
    });
  }catch(e){}
}

function startCleanupCron() {
  cleanupExpiredTryOns();
  setInterval(cleanupExpiredTryOns, 60 * 60 * 1000); // har 1 ghante
}

module.exports = { startCleanupCron };