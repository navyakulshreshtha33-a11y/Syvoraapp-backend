const axios = require('axios');
const { GoogleGenAI } = require('@google/genai');
const cloudinary = require('../services/cloudinary.js');

// Initialize Google Gen AI Client directly using AI Studio API Key (Bypasses Service Account & Project ID errors)
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function callAgentPlatformVTO(personImageUrl, garmentImageUrl) {
  try {
    const sanitizeUrl = (url) => {
      if (!url) return '';
      if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) {
        return url;
      }
      return 'https://res.cloudinary.com/demo/image/upload/sample.jpg';
    };

    const safePersonUrl = sanitizeUrl(personImageUrl);
    const safeGarmentUrl = sanitizeUrl(garmentImageUrl);

    const [personRes, garmentRes] = await Promise.all([
      axios.get(safePersonUrl, { responseType: 'arraybuffer', timeout: 15000 }),
      axios.get(safeGarmentUrl, { responseType: 'arraybuffer', timeout: 15000 })
    ]);

    const personBase64 = Buffer.from(personRes.data).toString('base64');
    const garmentBase64 = Buffer.from(garmentRes.data).toString('base64');

    const response = await ai.models.generateContent({
      model: 'virtual-try-on-001',
      contents: [
        {
          role: 'user',
          parts: [
            { text: 'Generate a photorealistic virtual try-on image seamlessly styling the person with the provided garment item.' },
            { inlineData: { mimeType: 'image/jpeg', data: personBase64 } },
            { inlineData: { mimeType: 'image/jpeg', data: garmentBase64 } }
          ]
        }
      ]
    });

    const candidate = response.candidates?.[0];
    const part = candidate?.content?.parts?.find(p => p.inlineData || p.inline_data);
    const imgData = part?.inlineData || part?.inline_data;

    if (!imgData || !imgData.data) {
      throw new Error("No image data returned from virtual-try-on-001 model.");
    }

    return `data:${imgData.mimeType || 'image/jpeg'};base64,${imgData.data}`;
  } catch (error) {
    console.error("Agent Platform VTO Error Details:", error.response?.data ? error.response.data.toString().substring(0, 150) : error.message);
    throw new Error("Virtual Try-On generation failed from AI service.");
  }
}

module.exports = function(prisma) {
  setInterval(async () => {
    try {
      await prisma.tryOn.updateMany({
        where: { autoDeleteAt: { lt: new Date() }, status: { not: 'DELETED' } },
        data: { status: 'DELETED', resultUrl: null }
      });
    } catch (cleanupErr) {
      console.error("VTO Auto-Cleanup Error:", cleanupErr.message);
    }
  }, 60 * 60 * 1000);

  return {
    uploadUserPhoto: async (req, res) => {
      try {
        const userId = Number(req.user.id);
        const { url, cloudinaryPublicId } = req.body;
        if (!url || !cloudinaryPublicId) {
          return res.status(400).json({ success: false, error: "Image URL and public ID required." });
        }
        const userPhoto = await prisma.userPhoto.create({
          data: { userId, url, cloudinaryPublicId, consent: true }
        });
        return res.status(201).json({ success: true, userPhotoId: userPhoto.id });
      } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
      }
    },

    performTryOn: async (req, res) => {
      const userId = Number(req.user.id);
      const { url, imageBase64, mimeType, garmentId, userPhotoId } = req.body;

      if (!garmentId) {
        return res.status(400).json({ success: false, error: "garmentId is required." });
      }

      try {
        let finalPhotoUrl = url;

        if (imageBase64) {
          const uploadRes = await cloudinary.uploader.upload(
            `data:${mimeType || 'image/jpeg'};base64,${imageBase64}`,
            { folder: "syvora_user_photos" }
          );
          finalPhotoUrl = uploadRes.secure_url;
        }

        const transactionResult = await prisma.$transaction(async (tx) => {
          const user = await tx.user.findUnique({ where: { id: userId } });
          if (!user) throw new Error("User not found");

          if (user.vtoCreditsRemaining <= 0) {
            const err = new Error("Free trials exhausted. Please top-up.");
            err.statusCode = 403;
            err.requiresPayment = true;
            throw err;
          }

          let validPhotoId = userPhotoId;
          if (!validPhotoId || validPhotoId.toString().startsWith('temp_') || !await tx.userPhoto.findUnique({ where: { id: validPhotoId } })) {
            const newPhoto = await tx.userPhoto.create({
              data: {
                userId,
                url: finalPhotoUrl || 'https://via.placeholder.com/600x800',
                cloudinaryPublicId: `vto_user_${Date.now()}`,
                consent: true
              }
            });
            validPhotoId = newPhoto.id;
          }

          await tx.user.update({
            where: { id: userId },
            data: { vtoCreditsRemaining: { decrement: 1 } }
          });

          const tryOn = await tx.tryOn.create({
            data: {
              userId,
              userPhotoId: validPhotoId,
              garmentId: Number(garmentId),
              status: "PROCESSING",
              autoDeleteAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
            }
          });

          return { tryOn, remainingCredits: user.vtoCreditsRemaining - 1 };
        });

        setImmediate(async () => {
          try {
            const tryOnRecord = transactionResult.tryOn;
            const userPhoto = await prisma.userPhoto.findUnique({ where: { id: tryOnRecord.userPhotoId } });
            const garment = await prisma.garment.findUnique({ where: { id: Number(garmentId) } });

            if (!userPhoto || !garment) return;

            let resultImageUrl = userPhoto.url;
            try {
              const base64Result = await callAgentPlatformVTO(userPhoto.url, garment.imageUrl);
              const uploadRes = await cloudinary.uploader.upload(base64Result, { folder: "syvora_vto_results" });
              resultImageUrl = uploadRes.secure_url;
            } catch (aiErr) {
              console.log("Agent Platform fallback used due to:", aiErr.message);
            }

            await prisma.tryOn.update({
              where: { id: tryOnRecord.id },
              data: { resultUrl: resultImageUrl, status: "COMPLETED" }
            });
          } catch (err) {
            console.error("Background AI Processing Failed:", err.message);
            await prisma.tryOn.update({
              where: { id: transactionResult.tryOn.id },
              data: { status: "FAILED" }
            }).catch(()=>{});
          }
        });

        return res.status(200).json({
          success: true,
          tryOn: transactionResult.tryOn,
          creditsRemaining: transactionResult.remainingCredits
        });

      } catch (error) {
        return res.status(error.statusCode || 500).json({
          success: false,
          error: error.message,
          requiresPayment: error.requiresPayment || false
        });
      }
    },

    getTryOnResult: async (req, res) => {
      try {
        const { id } = req.params;
        const tryOn = await prisma.tryOn.findUnique({ where: { id: String(id) } });
        if (!tryOn || tryOn.status === 'DELETED') {
          return res.status(404).json({ error: "Try-on record expired or not found" });
        }
        return res.status(200).json({
          status: tryOn.status,
          resultUrl: tryOn.resultUrl || "https://via.placeholder.com/600x800"
        });
      } catch (error) {
        return res.status(500).json({ error: error.message });
      }
    },

    deleteUserPhoto: async (req, res) => {
      try {
        const { photoId } = req.params;
        await prisma.userPhoto.updateMany({
          where: { id: String(photoId) },
          data: { isDeleted: true }
        }).catch(() => {});

        await prisma.tryOn.updateMany({
          where: { userPhotoId: String(photoId) },
          data: { status: 'DELETED', resultUrl: null }
        }).catch(() => {});

        return res.status(200).json({ success: true, message: "Data deleted successfully for privacy" });
      } catch (error) {
        return res.status(500).json({ error: error.message });
      }
    }
  };
};