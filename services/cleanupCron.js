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
  console.log("[CRON] Checking expired TryOns...");
  const expired = await prisma.tryOn.findMany({
    where: { autoDeleteAt: { lt: new Date() }, status: { not: 'DELETED' } },
    include: { userPhoto: true }
  });

  for (const item of expired) {
    try {
      if (item.resultPublicId) await cloudinary.uploader.destroy(item.resultPublicId);
      if (item.userPhoto?.cloudinaryPublicId) await cloudinary.uploader.destroy(item.userPhoto.cloudinaryPublicId);
      await prisma.tryOn.update({ where: { id: item.id }, data: { status: 'DELETED', resultUrl: null, resultPublicId: null } });
      await prisma.userPhoto.update({ where: { id: item.userPhotoId }, data: { isDeleted: true } });
      console.log(`[CRON] Deleted: ${item.id}`);
    } catch (e) {
      console.error(`[CRON] Fail ${item.id}:`, e.message);
    }
  }
}

function startCleanupCron() {
  cleanupExpiredTryOns();
  setInterval(cleanupExpiredTryOns, 60 * 60 * 1000);
}

module.exports = { startCleanupCron };