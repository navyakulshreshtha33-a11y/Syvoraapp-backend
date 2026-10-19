// const express = require('express');
// const router = express.Router();
// const cron = require('node-cron');
// const cloudinary = require('../config/cloudinary');

// module.exports = (prisma) => {

//   // --- CRON JOB: Runs every hour ---
//   cron.schedule('0 * * * *', async () => {
//     console.log('Running hourly VTO cleanup cron job...');
//     try {
//       const now = new Date();
      
//       // Find expired try-ons that are not deleted yet
//       const expiredTryOns = await prisma.tryOn.findMany({
//         where: {
//           autoDeleteAt: { lt: now },
//           status: { not: 'DELETED' }
//         }
//       });

//       for (const item of expiredTryOns) {
//         try {
//           // Delete result image from Cloudinary if exists
//           if (item.resultPublicId) {
//             await cloudinary.uploader.destroy(item.resultPublicId);
//           }
          
//           // Mark as DELETED in DB
//           await prisma.tryOn.update({
//             where: { id: item.id },
//             data: { status: 'DELETED', resultUrl: null, resultPublicId: null }
//           });
//         } catch (err) {
//           console.error(`Failed to delete TryOn ID ${item.id}:`, err);
//         }
//       }
//       console.log(`Cleaned up ${expiredTryOns.length} expired VTO items.`);
//     } catch (error) {
//       console.error('Cron job error:', error);
//     }
//   });


//   // --- INSTANT DELETE API: DELETE /api/photo/:tryOnId ---
//   router.delete('/photo/:tryOnId', async (req, res) => {
//     try {
//       const { tryOnId } = req.params;

//       const tryOn = await prisma.tryOn.findUnique({
//         where: { id: tryOnId }
//       });

//       if (!tryOn) {
//         return res.status(404).json({ error: "Try-on record not found" });
//       }

//       // Delete images from Cloudinary
//       if (tryOn.resultPublicId) {
//         await cloudinary.uploader.destroy(tryOn.resultPublicId);
//       }

//       // Update status to DELETED in Database
//       const updatedTryOn = await prisma.tryOn.update({
//         where: { id: tryOnId },
//         data: { 
//           status: 'DELETED', 
//           resultUrl: null, 
//           resultPublicId: null 
//         }
//       });

//       res.json({ message: "Try-on asset deleted successfully", updatedTryOn });
//     } catch (error) {
//       console.error("Instant Delete Error:", error);
//       res.status(500).json({ error: "Internal Server Error" });
//     }
//   });

//   return router;
// };
















// const express = require('express');
// const router = express.Router();
// const cron = require('node-cron');
// const cloudinary = require('../config/cloudinary');

// // MODAL_CONFIG server.js se aayega
// module.exports = (prisma, MODAL_CONFIG) => {

//   const MODAL_TRYON_URL = MODAL_CONFIG?.TRYON_URL || "https://navyakulshreshtha33--syvora-catvton-app-tryon-endpoint.modal.run";
//   const MODAL_HEALTH_URL = MODAL_CONFIG?.HEALTH_URL || "https://navyakulshreshtha33--syvora-catvton-app-health-endpoint.modal.run";

//   // --- 1. NEW: TRY-ON API ---
//   router.post('/vto/tryon', async (req, res) => {
//     try {
//       const { person_image_url, garment_image_url, category, userId, personPublicId, garmentPublicId } = req.body;

//       if (!person_image_url || !garment_image_url) {
//         return res.status(400).json({ error: "person_image_url and garment_image_url required" });
//       }

//       // 1. DB me entry banao - PROCESSING
//       const tryOnRecord = await prisma.tryOn.create({
//         data: {
//           userId: userId ? Number(userId) : null,
//           personImageUrl: person_image_url,
//           garmentImageUrl: garment_image_url,
//           category: category || "upper_body",
//           status: "PROCESSING",
//           autoDeleteAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 ghante baad auto delete
//         }
//       });

//       console.log(`[VTO] Calling Modal for TryOn ID: ${tryOnRecord.id}`);

//       // 2. Modal ko call karo
//       const modalRes = await fetch(MODAL_TRYON_URL, {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify({
//           person_image_url,
//           garment_image_url,
//           category: category || "upper_body"
//         })
//       });

//       const modalData = await modalRes.json();

//       if (modalData.error) {
//         await prisma.tryOn.update({
//           where: { id: tryOnRecord.id },
//           data: { status: "FAILED" }
//         });
//         return res.status(500).json({ error: modalData.error });
//       }

//       // 3. Result ko DB me update karo
//       const updated = await prisma.tryOn.update({
//         where: { id: tryOnRecord.id },
//         data: {
//           resultUrl: modalData.result_cloudinary_url,
//           resultPublicId: modalData.resultPublicId,
//           status: "COMPLETED"
//         }
//       });

//       res.json({
//         success: true,
//         tryOnId: updated.id,
//         resultUrl: updated.resultUrl,
//         resultPublicId: updated.resultPublicId,
//         autoDeleteAt: updated.autoDeleteAt
//       });

//     } catch (error) {
//       console.error("VTO TryOn Error:", error);
//       res.status(500).json({ error: "VTO failed: " + error.message });
//     }
//   });

//   // --- 2. NEW: VTO HEALTH ---
//   router.get('/vto/health', async (req, res) => {
//     try {
//       const response = await fetch(MODAL_HEALTH_URL);
//       const data = await response.json();
//       res.json({ backend: "OK", modal: data });
//     } catch (e) {
//       res.json({ backend: "OK", modal: "DOWN", error: e.message });
//     }
//   });

//   // --- 3. TERA PURANA CODE: CRON JOB ---
//   cron.schedule('0 * * * *', async () => {
//     console.log('Running hourly VTO cleanup cron job...');
//     try {
//       const now = new Date();
//       const expiredTryOns = await prisma.tryOn.findMany({
//         where: {
//           autoDeleteAt: { lt: now },
//           status: { not: 'DELETED' }
//         }
//       });

//       for (const item of expiredTryOns) {
//         try {
//           if (item.resultPublicId) {
//             await cloudinary.uploader.destroy(item.resultPublicId);
//           }
//           await prisma.tryOn.update({
//             where: { id: item.id },
//             data: { status: 'DELETED', resultUrl: null, resultPublicId: null }
//           });
//         } catch (err) {
//           console.error(`Failed to delete TryOn ID ${item.id}:`, err);
//         }
//       }
//       console.log(`Cleaned up ${expiredTryOns.length} expired VTO items.`);
//     } catch (error) {
//       console.error('Cron job error:', error);
//     }
//   });

//   // --- 4. TERA PURANA CODE: INSTANT DELETE ---
//   router.delete('/photo/:tryOnId', async (req, res) => {
//     try {
//       const { tryOnId } = req.params;
//       const tryOn = await prisma.tryOn.findUnique({
//         where: { id: tryOnId }
//       });

//       if (!tryOn) {
//         return res.status(404).json({ error: "Try-on record not found" });
//       }

//       if (tryOn.resultPublicId) {
//         await cloudinary.uploader.destroy(tryOn.resultPublicId);
//       }

//       const updatedTryOn = await prisma.tryOn.update({
//         where: { id: tryOnId },
//         data: { 
//           status: 'DELETED', 
//           resultUrl: null, 
//           resultPublicId: null 
//         }
//       });

//       res.json({ message: "Try-on asset deleted successfully", updatedTryOn });
//     } catch (error) {
//       console.error("Instant Delete Error:", error);
//       res.status(500).json({ error: "Internal Server Error" });
//     }
//   });

//   return router;
// };



// const express = require('express');
// const multer = require('multer');
// const { client } = require('@gradio/client');
// const cloudinary = require('../services/cloudinary');
// const { Pool } = require('pg');
// const { PrismaPg } = require('@prisma/adapter-pg');
// const { PrismaClient } = require('../generated/client');

// const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
// const adapter = new PrismaPg(pool);
// const prisma = new PrismaClient({ adapter });
// const vtoQueue = require('../services/vtoQueue');

// const router = express.Router();
// const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// const VTO_BLOCKED_CATEGORIES = ['lingerie', 'saree', 'sari', 'lehenga', 'bikini', 'bra', 'panty', 'innerwear'];

// async function getGradioClientWithRetry(url, retries = 5) {
//   for (let i = 0; i < retries; i++) {
//     try {
//       console.log(`[VTO] Connecting to HF Space... attempt ${i+1}`);
//       const app = await client(url);
//       return app;
//     } catch (e) {
//       console.log(`[VTO] HF Space 503/404, retry in 5 sec... ${e.message}`);
//       await new Promise(r => setTimeout(r, 5000));
//     }
//   }
//   throw new Error("HF Space is sleeping, try again after 1 min");
// }

// router.post('/tryon', upload.single('personPhoto'), async (req, res) => {
//   const { userId, garmentId } = req.body;
//   if (!req.file ||!garmentId ||!userId) {
//     return res.status(400).json({ error: "personPhoto, garmentId, userId chahiye" });
//   }
//   try {
//     const garment = await prisma.garment.findUnique({ where: { id: parseInt(garmentId) } });
//     if (!garment) return res.status(404).json({ error: "Garment nahi mila" });

//     if (VTO_BLOCKED_CATEGORIES.includes((garment.category || '').toLowerCase())) {
//       return res.status(400).json({ error: `VTO not available for ${garment.category}`, vtoAvailable: false });
//     }

//     const uploadRes = await new Promise((resolve, reject) => {
//       cloudinary.uploader.upload_stream({ folder: 'syvora/user_photos' }, (err, result) => err? reject(err) : resolve(result)).end(req.file.buffer);
//     });

//     const userPhoto = await prisma.userPhoto.create({
//       data: { userId: parseInt(userId), cloudinaryPublicId: uploadRes.public_id, url: uploadRes.secure_url }
//     });

//     const tryOn = await prisma.tryOn.create({
//       data: {
//         userId: parseInt(userId), userPhotoId: userPhoto.id, garmentId: garment.id,
//         status: 'PROCESSING', autoDeleteAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
//       }
//     });

//     res.json({ success: true, tryOnId: tryOn.id, status: 'PROCESSING', vtoAvailable: true });

//     vtoQueue.addJob({
//       task: async () => {
//         const app = await getGradioClientWithRetry("https://yisol-idm-vton.hf.space");

//         // Buffer se Blob banana - yehi tera bug tha
//         const [personRes, garmentRes] = await Promise.all([
//           fetch(userPhoto.url),
//           fetch(garment.imageUrl)
//         ]);
//         const personBlob = await personRes.blob();
//         const garmentBlob = await garmentRes.blob();

//         console.log("[VTO] Predicting with IDM-VTON...");

//         const result = await app.predict("/tryon", [
//           { background: personBlob, layers: [], composite: null },
//           garmentBlob,
//           `a ${garment.category || 'upper body'} garment, high quality`,
//           true,
//           true,
//           30,
//           42
//         ]);

//         console.log("[VTO] HF RAW:", JSON.stringify(result.data).substring(0, 800));

//         const hfImageUrl = result.data?.[0]?.url || result.data?.[0];
//         if (!hfImageUrl) throw new Error("HF ne image nahi di: " + JSON.stringify(result.data));
//         return hfImageUrl;
//       },
//       onDone: async (hfImageUrl) => {
//         try {
//           console.log("[VTO] Downloading HF result...");
//           // HF ka URL temp hota hai, direct Cloudinary upload fail hota hai
//           const hfRes = await fetch(hfImageUrl);
//           const hfBuffer = Buffer.from(await hfRes.arrayBuffer());

//           const finalUpload = await new Promise((resolve, reject) => {
//             cloudinary.uploader.upload_stream({ folder: 'syvora/tryon_results' }, (err, result) => err? reject(err) : resolve(result)).end(hfBuffer);
//           });

//           await prisma.tryOn.update({
//             where: { id: tryOn.id },
//             data: { resultUrl: finalUpload.secure_url, resultPublicId: finalUpload.public_id, status: 'COMPLETED' }
//           });
//           console.log("[VTO] COMPLETED:", finalUpload.secure_url);
//         } catch (err) {
//           console.log("[VTO] Cloudinary upload fail:", err.message);
//           await prisma.tryOn.update({ where: { id: tryOn.id }, data: { status: 'FAILED' } });
//         }
//       },
//       onError: async (err) => {
//         console.log("[VTO] Job Error:", err.message);
//         await prisma.tryOn.update({ where: { id: tryOn.id }, data: { status: 'FAILED' } });
//       }
//     });

//   } catch (e) {
//     console.log("VTO ERROR:", e);
//     res.status(500).json({ error: e.message });
//   }
// });

// router.get('/result/:tryOnId', async (req, res) => {
//   const tryOn = await prisma.tryOn.findUnique({ where: { id: req.params.tryOnId } });
//   if (!tryOn) return res.status(404).json({ error: "Not found" });
//   res.json(tryOn);
// });

// router.get('/my/:userId', async (req, res) => {
//   const tryOns = await prisma.tryOn.findMany({
//     where: { userId: parseInt(req.params.userId), status: { not: 'DELETED' } },
//     orderBy: { createdAt: 'desc' },
//     include: { garment: true }
//   });
//   res.json(tryOns);
// });

// router.delete('/:tryOnId', async (req, res) => {
//   const { userId } = req.body;
//   const tryOn = await prisma.tryOn.findUnique({ where: { id: req.params.tryOnId }, include: { userPhoto: true } });
//   if (!tryOn) return res.status(404).json({ error: "Not found" });
//   if (tryOn.userId!== parseInt(userId)) return res.status(403).json({ error: "Not yours" });
//   if (tryOn.resultPublicId) await cloudinary.uploader.destroy(tryOn.resultPublicId);
//   if (tryOn.userPhoto?.cloudinaryPublicId) await cloudinary.uploader.destroy(tryOn.userPhoto.cloudinaryPublicId);
//   await prisma.tryOn.update({ where: { id: tryOn.id }, data: { status: 'DELETED', resultUrl: null, resultPublicId: null } });
//   res.json({ success: true, message: "Deleted successfully" });
// });

// router.patch('/:tryOnId/public', async (req, res) => {
//   const { isPublic, userId } = req.body;
//   const tryOn = await prisma.tryOn.findUnique({ where: { id: req.params.tryOnId } });
//   if (!tryOn || tryOn.userId!== parseInt(userId)) return res.status(403).json({ error: "Not allowed" });
//   const updated = await prisma.tryOn.update({ where: { id: req.params.tryOnId }, data: { isPublic: Boolean(isPublic) } });
//   res.json({ success: true, isPublic: updated.isPublic });
// });

// module.exports = router;

// const express = require('express');
// const multer = require('multer');
// const { Client } = require("@gradio/client");
// const cloudinary = require('../services/cloudinary');
// const { Pool } = require('pg');
// const { PrismaPg } = require('@prisma/adapter-pg');
// const { PrismaClient } = require('../generated/client');

// const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
// const adapter = new PrismaPg(pool);
// const prisma = new PrismaClient({ adapter });
// const vtoQueue = require('../services/vtoQueue');

// const router = express.Router();
// const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// // FREE LEFFA - NO TOKEN NEEDED, BEST FOR INDIAN WEAR
// const HF_SPACE_URL = "franciszzj/Leffa";
// let cachedApp = null;
// let lastUsed = 0;

// function mapCategoryForLeffa(cat) {
//   const c = (cat || '').toLowerCase();
//   if (c.includes('saree') || c.includes('sari') || c.includes('lehenga') || c.includes('gown') || c.includes('anarkali') || c.includes('dress')) return 'dresses';
//   if (c.includes('jean') || c.includes('pant') || c.includes('trouser') || c.includes('salwar') || c.includes('lower') || c.includes('bottom') || c.includes('skirt')) return 'lower_body';
//   return 'upper_body'; // kurti, kurta, top default
// }

// const VTO_BLOCKED_CATEGORIES = ['saree','lehenga','lingerie', 'bikini', 'bra', 'panty', 'innerwear'];

// async function getGradioClient() {
//   if (cachedApp && (Date.now() - lastUsed) < 10 * 60 * 1000) {
//     lastUsed = Date.now();
//     return cachedApp;
//   }
//   console.log("[VTO] Connecting Leffa (FREE)...");
//   cachedApp = await Client.connect(HF_SPACE_URL);
//   lastUsed = Date.now();
//   console.log("[VTO] Leffa Connected");
//   return cachedApp;
// }

// // Warmup
// (async()=>{ try{ cachedApp = await Client.connect(HF_SPACE_URL); lastUsed=Date.now(); console.log("[VTO] Warmup DONE"); }catch(e){ console.log("[VTO] Warmup fail", e.message); } })();

// router.post('/tryon', upload.single('personPhoto'), async (req, res) => {
//   const { userId, garmentId } = req.body;
//   if (!req.file || !garmentId || !userId) return res.status(400).json({ error: "personPhoto, garmentId, userId chahiye" });

//   try {
//     const garment = await prisma.garment.findUnique({ where: { id: parseInt(garmentId) } });
//     if (!garment) return res.status(404).json({ error: "Garment nahi mila" });
//     if (VTO_BLOCKED_CATEGORIES.includes((garment.category||'').toLowerCase())) {
//       return res.status(400).json({ error: `VTO not allowed for ${garment.category}` });
//     }

//     const uploadRes = await new Promise((resolve,reject)=>{
//       cloudinary.uploader.upload_stream({ folder: 'syvora/user_photos' }, (err,result)=> err?reject(err):resolve(result)).end(req.file.buffer);
//     });

//     const userPhoto = await prisma.userPhoto.create({
//       data: { userId: parseInt(userId), cloudinaryPublicId: uploadRes.public_id, url: uploadRes.secure_url }
//     });

//     const tryOn = await prisma.tryOn.create({
//       data: { userId: parseInt(userId), userPhotoId: userPhoto.id, garmentId: garment.id, status: 'PROCESSING', autoDeleteAt: new Date(Date.now() + 24*60*60*1000) }
//     });

//     res.json({ success: true, tryOnId: tryOn.id, status: 'PROCESSING', categoryUsed: mapCategoryForLeffa(garment.category) });

//     vtoQueue.addJob({
//       task: async () => {
//         const app = await getGradioClient();
//         const categoryForLeffa = mapCategoryForLeffa(garment.category);
//         console.log(`[VTO] LEFFA Predicting ${garment.category} -> ${categoryForLeffa}`);

//         // Leffa expects garment first, person second
//         const result = await app.predict("/leffa_predict_vt", [
//           garment.imageUrl,
//           userPhoto.url,
//           categoryForLeffa
//         ]);

//         let hfImageUrl = result.data?.[0]?.url || result.data?.[0];
//         if (typeof hfImageUrl !== 'string') hfImageUrl = hfImageUrl?.url;
//         if (!hfImageUrl) throw new Error("Leffa ne image nahi diya");
//         return hfImageUrl;
//       },
//       onDone: async (hfImageUrl) => {
//         try {
//           const hfRes = await fetch(hfImageUrl);
//           const hfBuffer = Buffer.from(await hfRes.arrayBuffer());
//           const finalUpload = await new Promise((resolve,reject)=>{
//             cloudinary.uploader.upload_stream({ folder: 'syvora/tryon_results' }, (err,result)=> err?reject(err):resolve(result)).end(hfBuffer);
//           });
//           await prisma.tryOn.update({ where: { id: tryOn.id }, data: { resultUrl: finalUpload.secure_url, resultPublicId: finalUpload.public_id, status: 'COMPLETED' } });
//           console.log("[VTO] COMPLETED", tryOn.id);
//         } catch(err){
//           await prisma.tryOn.update({ where: { id: tryOn.id }, data: { status: 'FAILED' } });
//         }
//       },
//       onError: async (err) => {
//         console.log("[VTO] Error:", err.message);
//         if(err.message.includes('Queue') || err.message.includes('Space')) cachedApp = null;
//         await prisma.tryOn.update({ where: { id: tryOn.id }, data: { status: 'FAILED' } });
//       }
//     });

//   } catch(e){ console.log("VTO ERROR:", e); res.status(500).json({ error: e.message }); }
// });

// router.get('/result/:tryOnId', async (req,res)=>{
//   const tryOn = await prisma.tryOn.findUnique({ where: { id: req.params.tryOnId } });
//   if(!tryOn) return res.status(404).json({ error: "Not found" });
//   res.json(tryOn);
// });

// router.delete('/:tryOnId', async (req,res)=>{
//   const { userId } = req.body;
//   const tryOn = await prisma.tryOn.findUnique({ where: { id: req.params.tryOnId }, include: { userPhoto: true } });
//   if(!tryOn) return res.status(404).json({ error: "Not found" });
//   if(tryOn.userId !== parseInt(userId)) return res.status(403).json({ error: "Not yours" });
//   if(tryOn.resultPublicId) await cloudinary.uploader.destroy(tryOn.resultPublicId);
//   if(tryOn.userPhoto?.cloudinaryPublicId) await cloudinary.uploader.destroy(tryOn.userPhoto.cloudinaryPublicId);
//   await prisma.tryOn.update({ where: { id: tryOn.id }, data: { status: 'DELETED', resultUrl: null, resultPublicId: null } });
//   await prisma.userPhoto.update({ where: { id: tryOn.userPhotoId }, data: { isDeleted: true } });
//   res.json({ success: true });
// });

// module.exports = router;

















const express = require('express');
const multer = require('multer');
const { Client, handle_file } = require("@gradio/client");
const cloudinary = require('../services/cloudinary');
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('../generated/client');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });
const vtoQueue = require('../services/vtoQueue');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const HF_SPACE_URL = "franciszzj/Leffa";
let cachedApp = null;
let lastUsed = 0;

function mapCategoryForLeffa(cat) {
  const c = (cat || '').toLowerCase();
  if (c.includes('dress') || c.includes('saree') || c.includes('sari') || c.includes('lehenga') || c.includes('gown') || c.includes('anarkali')) return 'dresses';
  if (c.includes('jean') || c.includes('pant') || c.includes('trouser') || c.includes('salwar') || c.includes('lower') || c.includes('bottom') || c.includes('skirt')) return 'lower_body';
  return 'upper_body';
}

async function getGradioClient(forceNew = false) {
  if (!forceNew && cachedApp && (Date.now() - lastUsed) < 10 * 60 * 1000) {
    lastUsed = Date.now();
    return cachedApp;
  }
  console.log("[VTO] Connecting Leffa...");
  cachedApp = await Client.connect(HF_SPACE_URL, { hf_token: process.env.HF_TOKEN || undefined });
  lastUsed = Date.now();
  console.log("[VTO] Leffa Connected");
  return cachedApp;
}

// Warmup
(async()=>{ try{ cachedApp = await Client.connect(HF_SPACE_URL); lastUsed=Date.now(); console.log("[VTO] Warmup DONE"); }catch(e){ console.log("[VTO] Warmup fail", e.message); } })();

async function fetchToBlob(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`Image fetch failed ${res.status} for ${url}`);
  const ab = await res.arrayBuffer();
  return new Blob([ab]);
}

router.post('/tryon', upload.single('personPhoto'), async (req, res) => {
  const { userId, garmentId } = req.body;
  if (!req.file || !garmentId || !userId) return res.status(400).json({ error: "personPhoto, garmentId, userId chahiye" });

  const personBuffer = Buffer.from(req.file.buffer);
  const personMime = req.file.mimetype;

  try {
    // FIX: Garment nahi mila toh Product se fallback
    let garment = await prisma.garment.findUnique({ where: { id: parseInt(garmentId) } });
    
    if (!garment) {
      console.log(`[VTO] Garment ${garmentId} not found in garment table, trying Product table`);
      const product = await prisma.product.findUnique({ where: { id: parseInt(garmentId) } });
      if (!product) return res.status(404).json({ error: "Garment/Product nahi mila" });
      
      garment = {
        id: product.id,
        category: 'kurti',
        imageUrl: product.imageUrl || product.images?.[0]?.url || product.images?.[0] || null
      };
      if (!garment.imageUrl) {
        // Try find first image from images json
        try {
          const imgs = typeof product.images === 'string' ? JSON.parse(product.images) : product.images;
          garment.imageUrl = Array.isArray(imgs) ? (imgs[0]?.url || imgs[0]) : null;
        } catch {}
      }
    }

    if (!garment.imageUrl) return res.status(404).json({ error: "Garment image missing" });

    const uploadRes = await new Promise((resolve,reject)=>{
      cloudinary.uploader.upload_stream({ folder: 'syvora/user_photos' }, (err,result)=> err?reject(err):resolve(result)).end(personBuffer);
    });

    const userPhoto = await prisma.userPhoto.create({
      data: { userId: parseInt(userId), cloudinaryPublicId: uploadRes.public_id, url: uploadRes.secure_url }
    });

    const tryOn = await prisma.tryOn.create({
      data: { 
        userId: parseInt(userId), 
        userPhotoId: userPhoto.id, 
        garmentId: Number.isInteger(garment.id) ? garment.id : parseInt(garmentId), 
        status: 'PROCESSING', 
        autoDeleteAt: new Date(Date.now() + 24*60*60*1000) 
      }
    });

    res.json({ success: true, tryOnId: tryOn.id, status: 'PROCESSING', categoryUsed: mapCategoryForLeffa(garment.category) });

    vtoQueue.addJob({
      task: async () => {
        let app;
        try { app = await getGradioClient(); } 
        catch (e) { console.log("[VTO] Reconnecting...", e.message); app = await getGradioClient(true); }

        const categoryForLeffa = mapCategoryForLeffa(garment.category);
        console.log(`[VTO] START ${tryOn.id} | ${garment.category} -> ${categoryForLeffa} | img: ${garment.imageUrl.substring(0,100)}`);

        const garmentBlob = await fetchToBlob(garment.imageUrl);
        const personBlob = new Blob([personBuffer], { type: personMime });

        const result = await app.predict("/leffa_predict_vt", [
          handle_file(personBlob),
          handle_file(garmentBlob),
          categoryForLeffa
        ]);

        console.log("[VTO] Raw result:", JSON.stringify(result.data).substring(0, 800));
        
        let hfImageUrl = result.data?.[0]?.url || result.data?.[0];
        if (typeof hfImageUrl === 'object' && hfImageUrl !== null) hfImageUrl = hfImageUrl.url;
        
        if (!hfImageUrl || typeof hfImageUrl !== 'string') {
          throw new Error("Leffa output invalid: " + JSON.stringify(result.data).slice(0, 500));
        }
        
        return hfImageUrl;
      },
      onDone: async (hfImageUrl) => {
        try {
          console.log("[VTO] Downloading result:", hfImageUrl);
          const hfRes = await fetch(hfImageUrl);
          const hfBuffer = Buffer.from(await hfRes.arrayBuffer());
          const finalUpload = await new Promise((resolve,reject)=>{
            cloudinary.uploader.upload_stream({ folder: 'syvora/tryon_results' }, (err,result)=> err?reject(err):resolve(result)).end(hfBuffer);
          });
          await prisma.tryOn.update({ where: { id: tryOn.id }, data: { resultUrl: finalUpload.secure_url, resultPublicId: finalUpload.public_id, status: 'COMPLETED' } });
          console.log("[VTO] COMPLETED", tryOn.id);
        } catch(err){
          console.error("[VTO] onDone error", err);
          await prisma.tryOn.update({ where: { id: tryOn.id }, data: { status: 'FAILED' } });
        }
      },
      onError: async (err) => {
        console.error("[VTO] FAILED", tryOn.id, err.message);
        cachedApp = null;
        await prisma.tryOn.update({ where: { id: tryOn.id }, data: { status: 'FAILED' } });
      }
    });

  } catch(e){ console.error("VTO ERROR:", e); if(!res.headersSent) res.status(500).json({ error: e.message }); }
});

router.get('/result/:tryOnId', async (req,res)=>{
  const tryOn = await prisma.tryOn.findUnique({ where: { id: Number(req.params.tryOnId) } });
  if(!tryOn) return res.status(404).json({ error: "Not found" });
  res.json(tryOn);
});

router.delete('/:tryOnId', async (req,res)=>{
  const { userId } = req.body;
  const tryOn = await prisma.tryOn.findUnique({ where: { id: Number(req.params.tryOnId) }, include: { userPhoto: true } });
  if(!tryOn) return res.status(404).json({ error: "Not found" });
  if(tryOn.userId !== parseInt(userId)) return res.status(403).json({ error: "Not yours" });
  if(tryOn.resultPublicId) await cloudinary.uploader.destroy(tryOn.resultPublicId).catch(()=>{});
  if(tryOn.userPhoto?.cloudinaryPublicId) await cloudinary.uploader.destroy(tryOn.userPhoto.cloudinaryPublicId).catch(()=>{});
  await prisma.tryOn.update({ where: { id: tryOn.id }, data: { status: 'DELETED', resultUrl: null, resultPublicId: null } });
  await prisma.userPhoto.update({ where: { id: tryOn.userPhotoId }, data: { isDeleted: true } });
  res.json({ success: true });
});

module.exports = router;