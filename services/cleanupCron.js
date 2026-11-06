require('dotenv').config();
const cloudinary = require('./cloudinary');

let prismaInstance = null;
let resendInstance = null; // Resend ko cron file mein laane ke liye taki mail bheja ja sake

async function cleanupExpiredTryOns(externalPrisma = null, externalResend = null) {
  const prisma = externalPrisma || prismaInstance;
  const resend = externalResend || resendInstance;

  if(!prisma){ console.log("[CRON] Skip - no prisma instance yet"); return; }

  console.log("[CRON] Checking expired VTO, Logs, Pending Payments & Event Reminders...");
  
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

    // 4. RAZORPAY PENDING PAYMENT - RESERVED STOCK RELEASE (10 min)
    try{
      const tenMinsAgo = new Date(Date.now() - 10 * 60 * 1000);
      const pendingOrders = await prisma.order.findMany({
        where: { status: "PAYMENT_PENDING", createdAt: { lt: tenMinsAgo } },
        include: { items: true }
      });

      for(const order of pendingOrders){
        try{
          for(const item of order.items){
            await prisma.productSizeChart.updateMany({
              where: { productId: item.productId, size: item.size },
              data: { reservedStock: { decrement: item.quantity } }
            }).catch(()=>{});
          }
          await prisma.order.update({ where: { id: order.id }, data: { status: "FAILED" } });
          await prisma.payment.update({ where: { orderId: order.id }, data: { status: "FAILED" } }).catch(()=>{});
          console.log(`[CRON] Released reserved stock for Order ${order.id}`);
        }catch(e){ console.error(`[CRON] Pending order release fail ${order.id}:`, e.message); }
      }
    }catch(e){ console.error("[CRON] pending payment release error:", e.message); }

    // 5. === NEW: EVENT PLANNER REMINDERS (10 DAYS BEFORE EVENT) ===
    try {
      if (resend) {
        // Calculate date exactly 10 days from now
        const tenDaysFromNowStart = new Date();
        tenDaysFromNowStart.setDate(tenDaysFromNowStart.getDate() + 10);
        tenDaysFromNowStart.setHours(0, 0, 0, 0); // Midnight start

        const tenDaysFromNowEnd = new Date(tenDaysFromNowStart);
        tenDaysFromNowEnd.setHours(23, 59, 59, 999); // Midnight end

        // Find events happening 10 days from today where reminder has NOT been sent yet
        const upcomingEvents = await prisma.calendarEvent.findMany({
          where: {
            eventDate: {
              gte: tenDaysFromNowStart,
              lte: tenDaysFromNowEnd
            },
            reminderSent: false // Ye ensure karega ki email bas ek hi baar jaye
          },
          include: { user: { include: { profile: true } } }
        });

        for (const event of upcomingEvents) {
          if (event.user && event.user.email) {
            try {
              await resend.emails.send({
                from: "Syvora Events <onboarding@resend.dev>", // Ya apna verified domain (events@syvora.in) use karna
                to: [event.user.email],
                subject: `✨ Ready for your ${event.title}? Only 10 Days Left!`,
                html: `
                  <div style="font-family: Arial, sans-serif; padding: 20px; color: #3D2B1F; background: #FAF7F2; border-radius: 10px;">
                    <h2 style="color: #4A3024;">Hi ${event.user.profile?.name || 'there'}!</h2>
                    <p>Just a quick reminder that your event <strong>"${event.title}"</strong> is coming up on <strong>${event.eventDate.toDateString()}</strong>!</p>
                    <p>It's just 10 days away. If you haven't sorted out your outfit yet, now is the perfect time to explore Syvora's latest collections.</p>
                    <p>Don't wait till the last minute!</p>
                    <a href="https://syvora.app" style="display: inline-block; padding: 10px 20px; background-color: #4A3024; color: #FFF; text-decoration: none; border-radius: 5px; margin-top: 10px;">Shop Your Look Now</a>
                    <p style="margin-top: 20px; color: #8B6B4A; font-weight: bold;">Team Syvora</p>
                  </div>
                `
              });
              
              // Mark as reminder sent so we don't spam them tomorrow
              await prisma.calendarEvent.update({
                where: { id: event.id },
                data: { reminderSent: true }
              });

              console.log(`[CRON] Event Reminder Sent to ${event.user.email} for ${event.title}`);
            } catch (mailErr) {
              console.error(`[CRON] Failed to send event reminder for Event ID ${event.id}:`, mailErr.message);
            }
          }
        }
      }
    } catch (eventErr) {
      console.error("[CRON] Event Planner reminder error:", eventErr.message);
    }

  } catch (outerErr) {
    console.error("⚠️ [CRON] Outer error (skip, server will run):", outerErr.code || outerErr.message);
    return;
  }
}

// Ensure resend is passed when starting the cron from index.js/server.js
function startCleanupCron(prisma = null, resend = null) {
  if(prisma) prismaInstance = prisma;
  if(resend) resendInstance = resend;
  
  console.log("✅ Cleanup cron scheduled - first run in 15 sec");
  setTimeout(() => { cleanupExpiredTryOns(prismaInstance, resendInstance); }, 15000);
  setInterval(() => { cleanupExpiredTryOns(prismaInstance, resendInstance); }, 60 * 1000); 
}

module.exports = { startCleanupCron, cleanupExpiredTryOns };