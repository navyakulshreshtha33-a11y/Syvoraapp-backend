
// const express = require('express');
// const multer = require('multer');
// const { Client, handle_file } = require("@gradio/client");
// const cloudinary = require('../services/cloudinary');
// const { Pool } = require('pg');
// const { PrismaPg } = require('@prisma/adapter-pg');
// const { PrismaClient } = require('../generated/client');

// const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
// const adapter = new PrismaPg(pool);
// const prisma = new PrismaClient({ adapter });
// const vtoQueue = require('../services/vtoQueue');
// const { cleanPersonBuffer, isPlainBackground } = require('../services/personCleaner');

// const router = express.Router();
// const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// const HF_SPACE_URL = "franciszzj/Leffa";
// let cachedApp = null;
// let lastUsed = 0;

// // --- 3 TOKEN ROTATION ---
// const TOKENS = [
//   process.env.TOKEN1,
//   process.env.TOKEN2,
//   process.env.TOKEN3
// ].filter(Boolean);

// let tokenIndex = 0;

// function getNextToken() {
//   if (TOKENS.length === 0) return undefined;
//   const token = TOKENS[tokenIndex % TOKENS.length];
//   tokenIndex = (tokenIndex + 1) % TOKENS.length;
//   return token;
// }

// function mapCategoryForLeffa(cat) {
//   const c = (cat || '').toLowerCase();
//   if (c.includes('dress') || c.includes('saree') || c.includes('anarkali') || c.includes('gown') || c.includes('lehenga')) return 'dresses';
//   if (c.includes('jean') || c.includes('pant') || c.includes('trouser') || c.includes('skirt') || c.includes('lower')) return 'lower_body';
//   return 'upper_body';
// }

// function toPrismaCategory(cat) {
//   const c = (cat || '').toLowerCase();
//   if (c.includes('dress')) return 'Dress';
//   if (c.includes('jean')) return 'Jeans';
//   if (c.includes('pant')) return 'Pant';
//   if (c.includes('kurti') || c.includes('kurta')) return 'Kurti';
//   if (c.includes('top')) return 'Top';
//   if (c.includes('tshirt') || c.includes('t-shirt')) return 'Tshirt';
//   return 'Kurti';
// }

// async function getGradioClient(forceNew = false) {
//   if (!forceNew && cachedApp && (Date.now() - lastUsed) < 10 * 60 * 1000) {
//     lastUsed = Date.now();
//     return cachedApp;
//   }
//   const token = getNextToken();
//   cachedApp = await Client.connect(HF_SPACE_URL, { hf_token: token });
//   lastUsed = Date.now();
//   console.log(`[VTO] Connected with token #${tokenIndex} / ${TOKENS.length}`);
//   return cachedApp;
// }

// (async()=>{ 
//   try{ 
//     const token = getNextToken();
//     cachedApp = await Client.connect(HF_SPACE_URL, { hf_token: token }); 
//     lastUsed=Date.now(); 
//     console.log(`[VTO] Warmup DONE with token: ${!!token}, Total tokens: ${TOKENS.length}`); 
//   }catch(e){ 
//     console.log("[VTO] Warmup fail", e.message); 
//   } 
// })();

// async function fetchToBlob(url) {
//   const res = await fetch(url);
//   if (!res.ok) throw new Error(`Image fetch failed ${res.status}`);
//   return new Blob([await res.arrayBuffer()]);
// }

// router.post('/tryon', upload.single('personPhoto'), async (req, res) => {
//   const { userId, garmentId } = req.body;
//   if (!req.file || !garmentId || !userId) return res.status(400).json({ error: "personPhoto, garmentId, userId chahiye" });

//   let personBuffer = Buffer.from(req.file.buffer);
//   const personMime = req.file.mimetype;

//   try {
//     const plain = await isPlainBackground(personBuffer);
//     if (plain) {
//       console.log("[VTO] Background already plain, skipping cleaner ✅");
//     } else {
//       console.log("[VTO] Background messy, cleaning...");
//       personBuffer = await cleanPersonBuffer(personBuffer);
//       console.log("[VTO] Clean DONE, new size:", personBuffer.length);
//     }
//   } catch(e) {
//     console.log("[VTO] BG check fail, using original:", e.message);
//   }

//   try {
//     let garment = await prisma.garment.findUnique({ where: { id: parseInt(garmentId) } });
//     if (!garment) {
//       const product = await prisma.product.findUnique({ where: { id: parseInt(garmentId) }, include: { images: true } });
//       if (!product) return res.status(404).json({ error: "Garment/Product nahi mila" });
//       const img = product.images?.[0]?.imageUrl || product.images?.[0]?.url;
//       garment = { id: product.id, category: toPrismaCategory('kurti'), imageUrl: img };
//     }

//     const uploadRes = await new Promise((resolve,reject)=>{
//       cloudinary.uploader.upload_stream({ folder: 'syvora/user_photos' }, (err,result)=> err?reject(err):resolve(result)).end(personBuffer);
//     });

//     const userPhoto = await prisma.userPhoto.create({
//       data: { userId: parseInt(userId), cloudinaryPublicId: uploadRes.public_id, url: uploadRes.secure_url }
//     });

//     let finalGarmentId = garment.id;
//     const realGarmentCheck = await prisma.garment.findUnique({ where: { id: garment.id } });
//     if (!realGarmentCheck) {
//       let brand = await prisma.brand.findFirst();
//       if(!brand) brand = await prisma.brand.create({ data: { name: 'Syvora Default' } });
      
//       const tempGarment = await prisma.garment.create({
//         data: { 
//           brandId: brand.id, 
//           name: 'Temp-'+garment.id, 
//           category: toPrismaCategory(garment.category), 
//           imageUrl: garment.imageUrl, 
//           cloudinaryPublicId: 'fallback_'+Date.now() 
//         }
//       });
//       finalGarmentId = tempGarment.id;
//     }

//     const tryOn = await prisma.tryOn.create({
//       data: { userId: parseInt(userId), userPhotoId: userPhoto.id, garmentId: finalGarmentId, status: 'PROCESSING', autoDeleteAt: new Date(Date.now() + 24*60*60*1000) }
//     });

//     res.json({ success: true, tryOnId: tryOn.id, status: 'PROCESSING' });

//     vtoQueue.addJob({
//       task: async () => {
//         let app;
//         try { app = await getGradioClient(); } catch (e) { app = await getGradioClient(true); }
//         const categoryForLeffa = mapCategoryForLeffa(garment.category);
//         console.log(`[VTO] START ${tryOn.id} -> ${categoryForLeffa}`);

//         const garmentBlob = await fetchToBlob(garment.imageUrl);
//         const personBlob = new Blob([personBuffer], { type: personMime });

//         const result = await app.predict("/leffa_predict_vt", [
//           handle_file(personBlob),
//           handle_file(garmentBlob),
//           false, 30, 2.5, 42, "viton_hd", categoryForLeffa, false
//         ]);

//         let hfImageUrl = result.data?.[0]?.url || result.data?.[0];
//         if (typeof hfImageUrl === 'object') hfImageUrl = hfImageUrl.url;
//         if (!hfImageUrl) throw new Error("Leffa output invalid");
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
//         console.error("[VTO] FAILED", tryOn.id, err.message);
//         cachedApp = null;
//         await prisma.tryOn.update({ where: { id: tryOn.id }, data: { status: 'FAILED' } });
//       }
//     });

//   } catch(e){ console.error("VTO ERROR:", e); if(!res.headersSent) res.status(500).json({ error: e.message }); }
// });

// router.get('/result/:tryOnId', async (req,res)=>{
//   try {
//     const tryOn = await prisma.tryOn.findUnique({ where: { id: String(req.params.tryOnId) } });
//     if(!tryOn) return res.status(404).json({ error: "Not found" });
//     res.json(tryOn);
//   } catch(e) { res.status(500).json({ error: e.message }); }
// });

// router.delete('/:tryOnId', async (req,res)=>{
//   try {
//     const id = String(req.params.tryOnId);
//     await prisma.tryOn.delete({ where: { id } });
//     res.json({ success: true, message: "Deleted" });
//   } catch(e) { res.status(500).json({ error: e.message }); }
// });

// module.exports = router;











const express = require('express');
const multer = require('multer');
const { Client, handle_file } = require("@gradio/client");
const cloudinary = require('../services/cloudinary');
const { z } = require('zod');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('../generated/client');
const fileType = require('file-type'); // naya

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
const vtoQueue = require('../services/vtoQueue');
const { cleanPersonBuffer, isPlainBackground } = require('../services/personCleaner');
const { cleanGarmentBuffer } = require('../services/garmentCleaner');

const router = express.Router();
const upload = multer({ 
  storage: multer.memoryStorage(), 
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req,file,cb) => {
    if(['image/jpeg','image/png','image/webp'].includes(file.mimetype)) cb(null,true);
    else cb(new Error('Only jpeg/png/webp allowed'));
  }
});

// --- Security: per-user limit 10 tryon/day ---
const userTryOnMap = new Map();
function checkUserLimit(userId){
  const key = `${userId}_${new Date().toISOString().slice(0,10)}`;
  const count = userTryOnMap.get(key) || 0;
  if(count >= 10) return false;
  userTryOnMap.set(key, count+1);
  return true;
}

const HF_SPACE_URL = "franciszzj/Leffa";
let cachedApp = null; let lastUsed = 0;
const TOKENS = [process.env.TOKEN1, process.env.TOKEN2, process.env.TOKEN3].filter(Boolean);
let tokenIndex = 0;
function getNextToken(){ if(!TOKENS.length) return undefined; const t=TOKENS[tokenIndex%TOKENS.length]; tokenIndex=(tokenIndex+1)%TOKENS.length; return t; }

function mapCategoryForLeffa(cat){
  const c=(cat||'').toLowerCase();
  if(c.includes('saree')||c.includes('lehenga')||c.includes('anarkali')||c.includes('gown')||c.includes('dress')) return 'dresses';
  if(c.includes('jean')||c.includes('pant')||c.includes('trouser')||c.includes('skirt')||c.includes('lower')||c.includes('sharara')||c.includes('palazzo')) return 'lower_body';
  return 'upper_body';
}
function toPrismaCategory(cat){ const c=(cat||'').toLowerCase(); if(c.includes('kurti')||c.includes('kurta')) return 'Kurti'; return 'Kurti'; }

async function getGradioClient(forceNew=false){
  if(!forceNew && cachedApp && (Date.now()-lastUsed)<10*60*1000){ lastUsed=Date.now(); return cachedApp; }
  cachedApp = await Client.connect(HF_SPACE_URL, { hf_token: getNextToken() });
  lastUsed=Date.now(); return cachedApp;
}
(async()=>{ try{ cachedApp=await Client.connect(HF_SPACE_URL,{hf_token:getNextToken()}); lastUsed=Date.now(); console.log("[VTO] Warmup DONE"); }catch(e){ console.log("[VTO] Warmup fail",e.message);} })();

async function fetchToBlob(url){
  const res=await fetch(url); if(!res.ok) throw new Error(`Image fetch failed ${res.status}`); return new Blob([await res.arrayBuffer()]);
}

const tryonSchema = z.object({ garmentId: z.string().min(1) }); // userId hata diya - JWT se ayega

// --- FIXED: JWT se userId - IDOR FIX (Point 17) ---
function verifyUser(req){
  const authHeader = req.headers.authorization;
  if(!authHeader) throw new Error("Unauthorized");
  const token = authHeader.split(' ')[1];
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  return decoded.id; // id hi use karenge
}

router.post('/tryon', upload.single('personPhoto'), async (req,res)=>{
  try{
    const parsed = tryonSchema.safeParse(req.body);
    if(!parsed.success) return res.status(400).json({error: parsed.error.issues});
    if(!req.file) return res.status(400).json({error: "personPhoto chahiye"});
    
    // --- SECURITY CHECK 1: REAL MIME CHECK (Point 25) ---
    const type = await fileType.fileTypeFromBuffer(req.file.buffer);
    if(!type || !['image/jpeg','image/png','image/webp'].includes(type.mime)){
      return res.status(400).json({error: "Invalid file type"});
    }

    let userId;
    try{ userId = verifyUser(req); }
    catch(e){ return res.status(401).json({error: "Invalid token"}); }

    if(!checkUserLimit(userId)) return res.status(429).json({error: "Daily limit 10 try-on reached"});

    const existing = await prisma.tryOn.findFirst({ where: { userId, garmentId: parseInt(req.body.garmentId), createdAt: { gte: new Date(Date.now()-2*60*1000) }, status: 'PROCESSING' } });
    if(existing) return res.json({ success:true, tryOnId: existing.id, status: 'PROCESSING', message: "Already processing" });

    let personBuffer = Buffer.from(req.file.buffer);
    const personMime = req.file.mimetype;

    try{
      const plain = await isPlainBackground(personBuffer);
      if(!plain) personBuffer = await cleanPersonBuffer(personBuffer);
    }catch(e){ console.log("[VTO] BG check fail",e.message); }

    let garment = await prisma.garment.findUnique({ where: { id: parseInt(req.body.garmentId) } });
    if(!garment){
      const product = await prisma.product.findUnique({ where: { id: parseInt(req.body.garmentId) }, include: { images: true } });
      if(!product) return res.status(404).json({error: "Garment nahi mila"});
      garment = { id: product.id, category: 'kurti', imageUrl: product.images?.[0]?.imageUrl || product.images?.[0]?.url };
    }

    const uploadRes = await new Promise((resolve,reject)=>{
      cloudinary.uploader.upload_stream({ folder: 'syvora/user_photos', public_id: `user_${userId}_${Date.now()}`, resource_type: 'image' }, (err,result)=> err?reject(err):resolve(result)).end(personBuffer);
    });

    const userPhoto = await prisma.userPhoto.create({ data: { userId, cloudinaryPublicId: uploadRes.public_id, url: uploadRes.secure_url } });

    let finalGarmentId = garment.id;
    const realCheck = await prisma.garment.findUnique({ where: { id: garment.id } });
    if(!realCheck){
      let brand = await prisma.brand.findFirst(); if(!brand) brand = await prisma.brand.create({ data: { name: 'Syvora Default' } });
      const temp = await prisma.garment.create({ data: { brandId: brand.id, name: 'Temp-'+garment.id, category: toPrismaCategory(garment.category), imageUrl: garment.imageUrl, cloudinaryPublicId: 'fallback_'+Date.now() } });
      finalGarmentId = temp.id;
    }

    const tryOn = await prisma.tryOn.create({ data: { userId, userPhotoId: userPhoto.id, garmentId: finalGarmentId, status: 'PROCESSING', autoDeleteAt: new Date(Date.now()+60*60*1000) } });

    res.json({ success:true, tryOnId: tryOn.id, status:'PROCESSING' });

    const personBufferForQueue = Buffer.from(personBuffer);
    personBuffer.fill(0);

    vtoQueue.addJob({
      task: async()=>{
        let app; try{ app=await getGradioClient(); }catch(e){ app=await getGradioClient(true); }
        const categoryForLeffa = mapCategoryForLeffa(garment.category);
        console.log(`[VTO] START ${tryOn.id} -> ${categoryForLeffa}`);

        let garmentBlob = await fetchToBlob(garment.imageUrl);
        try{
          const gRes = await fetch(garment.imageUrl);
          const gBuf = Buffer.from(await gRes.arrayBuffer());
          const cleanedGarment = await cleanGarmentBuffer(gBuf);
          garmentBlob = new Blob([cleanedGarment], {type: 'image/jpeg'});
          gBuf.fill(0);
        }catch(e){ console.log("[VTO] Garment clean skip", e.message); }

        const personBlob = new Blob([personBufferForQueue], { type: personMime });
        const result = await app.predict("/leffa_predict_vt", [handle_file(personBlob), handle_file(garmentBlob), false, 30, 2.5, 42, "viton_hd", categoryForLeffa, false]);
        let hfImageUrl = result.data?.[0]?.url || result.data?.[0]; if(typeof hfImageUrl==='object') hfImageUrl=hfImageUrl.url; if(!hfImageUrl) throw new Error("Leffa output invalid"); return hfImageUrl;
      },
      onDone: async(hfImageUrl)=>{
        try{
          const hfRes=await fetch(hfImageUrl); const hfBuffer=Buffer.from(await hfRes.arrayBuffer());
          const finalUpload=await new Promise((resolve,reject)=>{ cloudinary.uploader.upload_stream({ folder: 'syvora/tryon_results', public_id: `tryon_${tryOn.id}` }, (err,r)=> err?reject(err):resolve(r)).end(hfBuffer); });
          await prisma.tryOn.update({ where: { id: tryOn.id }, data: { resultUrl: finalUpload.secure_url, resultPublicId: finalUpload.public_id, status: 'COMPLETED' } });
          personBufferForQueue.fill(0);
          console.log("[VTO] COMPLETED",tryOn.id);
        }catch(err){ await prisma.tryOn.update({ where: { id: tryOn.id }, data: { status: 'FAILED' } }); }
      },
      onError: async(err)=>{
        console.error("[VTO] FAILED",tryOn.id,err.message); cachedApp=null; personBufferForQueue.fill(0);
        await prisma.tryOn.update({ where: { id: tryOn.id }, data: { status: 'FAILED' } });
      }
    });

  }catch(e){ console.error("VTO ERROR:",e); if(!res.headersSent) res.status(500).json({error:e.message}); }
});

// --- FIXED: IDOR in result (Point 17) ---
router.get('/result/:tryOnId', async(req,res)=>{
  try{
    const userId = verifyUser(req);
    const tryOn = await prisma.tryOn.findUnique({ where: { id: String(req.params.tryOnId) } });
    if(!tryOn) return res.status(404).json({error:"Not found"});
    if(tryOn.userId !== userId) return res.status(403).json({error: "Access denied"}); // IDOR FIX
    res.json(tryOn);
  }catch(e){ return res.status(401).json({error: "Unauthorized"}); }
});

module.exports = router;