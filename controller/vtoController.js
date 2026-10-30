const axios = require('axios');
const { GoogleAuth } = require('google-auth-library');
const cloudinary = require('../services/cloudinary.js');

const auth = new GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/cloud-platform']
});

async function callVertexAIVTO(personImageUrl, garmentImageUrl) {
  try {
    const client = await auth.getClient();
    const projectId = process.env.GCP_PROJECT_ID;
    const location = process.env.GCP_VERTEX_REGION || process.env.GCP_LOCATION || 'us-central1';
    
    const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/imagen-3.0-fast-generate-001:predict`;
    const accessToken = await client.getAccessToken();

    const payload = {
      instances: [
        {
          prompt: `Photorealistic fashion virtual try-on, styling a person wearing the apparel item. Reference person photo: ${personImageUrl}, Reference garment photo: ${garmentImageUrl}, high quality, studio lighting.`
        }
      ],
      parameters: { 
        sampleCount: 1,
        aspectRatio: "3:4"
      }
    };

    const response = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${accessToken.token}`,
        'Content-Type': 'application/json'
      },
      timeout: 35000
    });

    const base64Image = response.data.predictions[0].bytesBase64Encoded;
    return `data:image/jpeg;base64,${base64Image}`;
  } catch (error) {
    console.error("Vertex AI VTO Error:", error.response?.data || error.message);
    throw new Error("Virtual Try-On generation failed from AI service.");
  }
}

module.exports = function(prisma) {
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
      const { url, garmentId, userPhotoId } = req.body;

      if (!garmentId) {
        return res.status(400).json({ success: false, error: "garmentId is required." });
      }

      try {
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
                url: url || 'https://via.placeholder.com/600x800',
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
              autoDeleteAt: new Date(Date.now() + 60 * 60 * 1000)
            }
          });

          return { tryOn, remainingCredits: user.vtoCreditsRemaining - 1 };
        });

        // Background AI Processing
        setImmediate(async () => {
          try {
            const tryOnRecord = transactionResult.tryOn;
            const userPhoto = await prisma.userPhoto.findUnique({ where: { id: tryOnRecord.userPhotoId } });
            const garment = await prisma.garment.findUnique({ where: { id: Number(garmentId) } });

            if (!userPhoto || !garment) return;

            let resultImageUrl = userPhoto.url;
            try {
              resultImageUrl = await callVertexAIVTO(userPhoto.url, garment.imageUrl);
              const uploadRes = await cloudinary.uploader.upload(resultImageUrl, { folder: "syvora_vto_results" });
              resultImageUrl = uploadRes.secure_url;
            } catch (aiErr) {
              console.log("Vertex AI fallback used due to:", aiErr.message);
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
        if (!tryOn) return res.status(404).json({ error: "Try-on record not found" });

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

        return res.status(200).json({ success: true, message: "Deleted successfully" });
      } catch (error) {
        return res.status(500).json({ error: error.message });
      }
    }
  };
};