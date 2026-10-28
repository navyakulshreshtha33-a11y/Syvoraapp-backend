const axios = require('axios');
const { GoogleAuth } = require('google-auth-library');
const cloudinary = require('../utils/cloudinary'); // Apka configured cloudinary path

const auth = new GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/cloud-platform']
});

async function callVertexAIVTO(personImageUrl, garmentImageUrl) {
  try {
    const client = await auth.getClient();
    const projectId = process.env.GCP_PROJECT_ID;
    const location = process.env.GCP_LOCATION || 'us-central1';
    
    const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/imagegeneration:predict`;
    const accessToken = await client.getAccessToken();

    const payload = {
      instances: [
        {
          prompt: "Photorealistic virtual try-on, precise garment fitting on person.",
          personImage: { imageUri: personImageUrl },
          garmentImage: { imageUri: garmentImageUrl }
        }
      ],
      parameters: { sampleCount: 1 }
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

module.exports = (prisma) => {
  return {
    uploadUserPhoto: async (req, res) => {
      try {
        const userId = req.user.id;
        const { url, cloudinaryPublicId } = req.body;

        if (!url || !cloudinaryPublicId) {
          return res.status(400).json({ success: false, error: "Image URL and public ID required." });
        }

        const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour DPDP

        const userPhoto = await prisma.userPhoto.create({
          data: { userId, url, cloudinaryPublicId, expiresAt, consent: true }
        });

        res.status(201).json({ success: true, userPhotoId: userPhoto.id });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    },

    performTryOn: async (req, res) => {
      const userId = req.user.id;
      const { userPhotoId, garmentId } = req.body;

      if (!userPhotoId || !garmentId) {
        return res.status(400).json({ success: false, error: "userPhotoId and garmentId are required." });
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

          await tx.user.update({
            where: { id: userId },
            data: { vtoCreditsRemaining: { decrement: 1 } }
          });

          const tryOn = await tx.tryOn.create({
            data: {
              userId,
              userPhotoId: userPhotoId.startsWith('temp_') ? (await tx.userPhoto.create({
                data: { userId, url: 'https://via.placeholder.com/300', cloudinaryPublicId: 'temp', expiresAt: new Date(Date.now() + 3600000) }
              })).id : userPhotoId,
              garmentId: Number(garmentId),
              status: "PROCESSING",
              autoDeleteAt: new Date(Date.now() + 60 * 60 * 1000)
            }
          });

          return { tryOn, remainingCredits: user.vtoCreditsRemaining - 1 };
        });

        // Background / Asynchronous Vertex AI Execution
        setImmediate(async () => {
          try {
            const userPhoto = await prisma.userPhoto.findUnique({ where: { id: transactionResult.tryOn.userPhotoId } });
            const garment = await prisma.garment.findUnique({ where: { id: Number(garmentId) } });

            if (!userPhoto || !garment) return;

            const resultImageUrl = await callVertexAIVTO(userPhoto.url, garment.imageUrl);
            const uploadRes = await cloudinary.uploader.upload(resultImageUrl, { folder: "syvora_vto_results" });

            await prisma.tryOn.update({
              where: { id: transactionResult.tryOn.id },
              data: { resultUrl: uploadRes.secure_url, resultPublicId: uploadRes.public_id, status: "COMPLETED" }
            });
          } catch (err) {
            console.error("Background AI Processing Failed:", err.message);
            await prisma.tryOn.update({
              where: { id: transactionResult.tryOn.id },
              data: { status: "FAILED" }
            }).catch(()=>{});
          }
        });

        res.status(200).json({
          success: true,
          tryOn: transactionResult.tryOn,
          creditsRemaining: transactionResult.remainingCredits
        });

      } catch (error) {
        res.status(error.statusCode || 500).json({
          success: false,
          error: error.message,
          requiresPayment: error.requiresPayment || false
        });
      }
    },

    // Added to support frontend polling
    getTryOnResult: async (req, res) => {
      try {
        const { id } = req.params;
       const tryOn = await prisma.tryOn.findFirst({
  where: {
    id,
    userId: Number(req.user.id)
  }
});
        if (!tryOn) return res.status(404).json({ error: "Try-on record not found" });

        res.status(200).json({
          status: tryOn.status,
          resultUrl: tryOn.resultUrl
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    },

    deleteUserPhoto: async (req, res) => {
      try {
        const userId = req.user.id;
        const { photoId } = req.params;
        const photo = await prisma.userPhoto.findFirst({ where: { id: photoId, userId } });

        if (photo && photo.cloudinaryPublicId) {
          await cloudinary.uploader.destroy(photo.cloudinaryPublicId).catch(() => {});
          await prisma.userPhoto.update({ where: { id: photoId }, data: { isDeleted: true } });
        }

        res.status(200).json({ success: true, message: "Deleted successfully" });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    }
  };
};