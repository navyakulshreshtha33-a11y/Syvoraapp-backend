const express = require('express');
const multer = require('multer');
const cloudinary = require('../services/cloudinary');
const { z } = require('zod');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('../generated/client');
const fileType = require('file-type');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
const vtoQueue = require('../services/vtoQueue');
const { callVertexVirtualTryOn } = require('../services/vertexVto');

const router = express.Router();
const upload = multer({ 
  storage: multer.memoryStorage(), 
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if(['image/jpeg','image/png','image/webp'].includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only jpeg/png/webp allowed'));
  }
});

// --- Security: per-user limit 10 tryon/day ---
const userTryOnMap = new Map();
function checkUserLimit(userId){
  const key = `${userId}_${new Date().toISOString().slice(0,10)}`;
  const count = userTryOnMap.get(key) || 0;
  if(count >= 10) return false;
  userTryOnMap.set(key, count + 1);
  return true;
}

function mapCategoryForVertex(cat){
  const c = (cat || '').toLowerCase();
  if(c.includes('saree') || c.includes('lehenga') || c.includes('gown') || c.includes('dress')) return 'dresses';
  if(c.includes('jean') || c.includes('pant') || c.includes('trouser') || c.includes('skirt') || c.includes('lower')) return 'lower_body';
  return 'upper_body';
}

function toPrismaCategory(cat){ 
  return 'Kurti'; 
}

const tryonSchema = z.object({ garmentId: z.string().min(1) });

function verifyUser(req){
  const authHeader = req.headers.authorization;
  if(!authHeader) throw new Error("Unauthorized");
  const token = authHeader.split(' ')[1];
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  return decoded.id;
}

router.post('/tryon', upload.single('personPhoto'), async (req, res) => {
  try {
    const parsed = tryonSchema.safeParse(req.body);
    if(!parsed.success) return res.status(400).json({ error: parsed.error.issues });
    if(!req.file) return res.status(400).json({ error: "personPhoto chahiye" });
    
    const type = await fileType.fileTypeFromBuffer(req.file.buffer);
    if(!type || !['image/jpeg','image/png','image/webp'].includes(type.mime)){
      return res.status(400).json({ error: "Invalid file type" });
    }

    let userId;
    try { userId = verifyUser(req); }
    catch(e) { return res.status(401).json({ error: "Invalid token" }); }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ error: "User nahi mila" });
    
    if (user.vtoCreditsRemaining <= 0) {
      return res.status(403).json({ 
        error: "No free VTO credits left", 
        code: "CREDITS_EXHAUSTED",
        message: "Aapke free try-on credits khatam ho gaye hain." 
      });
    }

    if(!checkUserLimit(userId)) return res.status(429).json({ error: "Daily limit 10 try-on reached" });

    const existing = await prisma.tryOn.findFirst({ 
      where: { userId, garmentId: parseInt(req.body.garmentId), createdAt: { gte: new Date(Date.now() - 2*60*1000) }, status: 'PROCESSING' } 
    });
    if(existing) return res.json({ success: true, tryOnId: existing.id, status: 'PROCESSING', message: "Already processing" });

    const personBuffer = Buffer.from(req.file.buffer);

    let garment = await prisma.garment.findUnique({ where: { id: parseInt(req.body.garmentId) } });
    if(!garment){
      const product = await prisma.product.findUnique({ where: { id: parseInt(req.body.garmentId) }, include: { images: true } });
      if(!product) return res.status(404).json({ error: "Garment nahi mila" });
      garment = { id: product.id, category: 'kurti', imageUrl: product.images?.[0]?.imageUrl || product.images?.[0]?.url };
    }

    const uploadRes = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream({ folder: 'syvora/user_photos', public_id: `user_${userId}_${Date.now()}`, resource_type: 'image' }, (err, result) => err ? reject(err) : resolve(result)).end(personBuffer);
    });

    const userPhoto = await prisma.userPhoto.create({ data: { userId, cloudinaryPublicId: uploadRes.public_id, url: uploadRes.secure_url } });

    let finalGarmentId = garment.id;
    const realCheck = await prisma.garment.findUnique({ where: { id: garment.id } });
    if(!realCheck){
      let brand = await prisma.brand.findFirst(); 
      if(!brand) brand = await prisma.brand.create({ data: { name: 'Syvora Default' } });
      const temp = await prisma.garment.create({ data: { brandId: brand.id, name: 'Temp-' + garment.id, category: toPrismaCategory(garment.category), imageUrl: garment.imageUrl, cloudinaryPublicId: 'fallback_' + Date.now() } });
      finalGarmentId = temp.id;
    }

    const tryOn = await prisma.tryOn.create({ data: { userId, userPhotoId: userPhoto.id, garmentId: finalGarmentId, status: 'PROCESSING', autoDeleteAt: new Date(Date.now() + 60*60*1000) } });

    await prisma.user.update({
      where: { id: userId },
      data: { vtoCreditsRemaining: { decrement: 1 } }
    });

    res.json({ success: true, tryOnId: tryOn.id, status: 'PROCESSING', creditsRemaining: user.vtoCreditsRemaining - 1 });

    const personBufferForQueue = Buffer.from(personBuffer);
    personBuffer.fill(0);

    vtoQueue.addJob({
      task: async() => {
        console.log(`[Vertex VTO] START job for TryOn ID: ${tryOn.id}`);
        const gRes = await fetch(garment.imageUrl);
        const garmentBuffer = Buffer.from(await gRes.arrayBuffer());
        const categoryForVertex = mapCategoryForVertex(garment.category);
        const generatedBuffer = await callVertexVirtualTryOn(personBufferForQueue, garmentBuffer, categoryForVertex);
        return generatedBuffer;
      },
      onDone: async(finalBuffer) => {
        try {
          const finalUpload = await new Promise((resolve, reject) => {
            cloudinary.uploader.upload_stream({ folder: 'syvora/tryon_results', public_id: `tryon_${tryOn.id}` }, (err, r) => err ? reject(err) : resolve(r)).end(finalBuffer);
          });
          await prisma.tryOn.update({ 
            where: { id: tryOn.id }, 
            data: { resultUrl: finalUpload.secure_url, resultPublicId: finalUpload.public_id, status: 'COMPLETED' } 
          });
          personBufferForQueue.fill(0);
          console.log("[Vertex VTO] COMPLETED successfully for:", tryOn.id);
        } catch(err) { 
          await prisma.tryOn.update({ where: { id: tryOn.id }, data: { status: 'FAILED' } }); 
        }
      },
      onError: async(err) => {
        console.error("[Vertex VTO] FAILED for:", tryOn.id, err.message); 
        personBufferForQueue.fill(0);
        await prisma.tryOn.update({ where: { id: tryOn.id }, data: { status: 'FAILED' } });
      }
    });

  } catch(e) { 
    console.error("VTO ERROR:", e); 
    if(!res.headersSent) res.status(500).json({ error: e.message }); 
  }
});

router.get('/result/:tryOnId', async(req, res) => {
  try {
    const userId = verifyUser(req);
    const tryOn = await prisma.tryOn.findUnique({ where: { id: String(req.params.tryOnId) } });
    if(!tryOn) return res.status(404).json({ error: "Not found" });
    if(tryOn.userId !== userId) return res.status(403).json({ error: "Access denied" });
    res.json(tryOn);
  } catch(e) { return res.status(401).json({ error: "Unauthorized" }); }
});

module.exports = router;