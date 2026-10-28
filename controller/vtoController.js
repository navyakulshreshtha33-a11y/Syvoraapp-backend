const axios = require('axios');
const { GoogleAuth } = require('google-auth-library');
const cloudinary = require('../utils/cloudinary'); // Aapka configured cloudinary utility path

// Google Auth setup for Vertex AI / Agent Platform API
const auth = new GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/cloud-platform']
});

async function callVertexAIVTO(personImageUrl, garmentImageUrl) {
  try {
    const client = await auth.getClient();
    const projectId = process.env.GCP_PROJECT_ID;
    const location = process.env.GCP_LOCATION || 'us-central1';
    
    // Vertex AI / Agent Platform endpoint for image generation / virtual try-on
    const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/imagegeneration:predict`;

    const accessToken = await client.getAccessToken();

    const payload = {
      instances: [
        {
          prompt: "Photorealistic virtual try-on, precise garment fitting on person maintaining realistic lighting and pose.",
          personImage: { imageUri: personImageUrl },
          garmentImage: { imageUri: garmentImageUrl }
        }
      ],
      parameters: {
        sampleCount: 1
      }
    };

    const response = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${accessToken.token}`,
        'Content-Type': 'application/json'
      },
      timeout: 35000 // 35 seconds timeout for AI model inference
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
    // 1. Register User Photo (Saved after frontend/direct Cloudinary upload)
    uploadUserPhoto: async (req, res) => {
      try {
        const userId = req.user.id; // Extracted safely from JWT middleware
        const { url, cloudinaryPublicId } = req.body;

        if (!url || !cloudinaryPublicId) {
          return res.status(400).json({ success: false, error: "Cloudinary image details are required." });
        }

        // DPDP Act compliance: 1 hour expiration for sensitive user biometric/photos
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

        const userPhoto = await prisma.userPhoto.create({
          data: {
            userId,
            url,
            cloudinaryPublicId,
            expiresAt,
            consent: true
          }
        });

        res.status(201).json({
          success: true,
          message: "User photo uploaded successfully",
          userPhotoId: userPhoto.id,
          expiresAt: userPhoto.expiresAt
        });
      } catch (error) {
        console.error("Upload User Photo Error:", error);
        res.status(500).json({ success: false, error: error.message });
      }
    },

    // 2. Perform Virtual Try-On (Atomic Transaction + Credits & Vertex AI)
    performTryOn: async (req, res) => {
      const userId = req.user.id;
      const { userPhotoId, garmentId } = req.body;

      if (!userPhotoId || !garmentId) {
        return res.status(400).json({ success: false, error: "userPhotoId and garmentId are required." });
      }

      try {
        // Step 1: Atomic transaction to check & deduct credits safely (prevents race conditions)
        const transactionResult = await prisma.$transaction(async (tx) => {
          const user = await tx.user.findUnique({ where: { id: userId } });
          if (!user) throw new Error("User not found");

          if (user.vtoCreditsRemaining <= 0) {
            const err = new Error("Free trials exhausted. Please purchase a VTO credit pack.");
            err.statusCode = 403;
            err.requiresPayment = true;
            throw err;
          }

          // Decrement 1 credit
          await tx.user.update({
            where: { id: userId },
            data: { vtoCreditsRemaining: { decrement: 1 } }
          });

          // Create TryOn record in PROCESSING state
          const tryOn = await tx.tryOn.create({
            data: {
              userId,
              userPhotoId,
              garmentId: Number(garmentId),
              status: "PROCESSING",
              autoDeleteAt: new Date(Date.now() + 60 * 60 * 1000) // 1 hour cleanup sync
            }
          });

          return { tryOnId: tryOn.id, remainingCredits: user.vtoCreditsRemaining - 1 };
        });

        // Step 2: Fetch user photo & garment details outside transaction for AI processing
        const userPhoto = await prisma.userPhoto.findUnique({ where: { id: userPhotoId } });
        const garment = await prisma.garment.findUnique({ where: { id: Number(garmentId) } });

        if (!userPhoto || !garment) {
          return res.status(404).json({ success: false, error: "User photo or garment not found." });
        }

        // Step 3: Call Vertex AI VTO Model
        const resultImageUrl = await callVertexAIVTO(userPhoto.url, garment.imageUrl);

        // Step 4: Upload result to Cloudinary
        const uploadRes = await cloudinary.uploader.upload(resultImageUrl, {
          folder: "syvora_vto_results"
        });

        // Step 5: Update TryOn record to COMPLETED
        const completedTryOn = await prisma.tryOn.update({
          where: { id: transactionResult.tryOnId },
          data: {
            resultUrl: uploadRes.secure_url,
            resultPublicId: uploadRes.public_id,
            status: "COMPLETED"
          }
        });

        res.status(200).json({
          success: true,
          message: "Virtual try-on generated successfully!",
          tryOn: completedTryOn,
          creditsRemaining: transactionResult.remainingCredits
        });

      } catch (error) {
        console.error("VTO Execution Error:", error);
        res.status(error.statusCode || 500).json({
          success: false,
          error: error.message,
          requiresPayment: error.requiresPayment || false
        });
      }
    },

    // 3. Manual Delete User Photo / TryOn Data (DPDP User Right to Erasure)
    deleteUserPhoto: async (req, res) => {
      try {
        const userId = req.user.id;
        const { photoId } = req.params;

        const photo = await prisma.userPhoto.findFirst({
          where: { id: photoId, userId }
        });

        if (!photo) {
          return res.status(404).json({ success: false, error: "Photo not found or unauthorized." });
        }

        // Delete from Cloudinary
        if (photo.cloudinaryPublicId) {
          await cloudinary.uploader.destroy(photo.cloudinaryPublicId).catch(() => {});
        }

        // Mark as deleted in database
        await prisma.userPhoto.update({
          where: { id: photoId },
          data: { isDeleted: true }
        });

        res.status(200).json({ success: true, message: "Photo deleted securely." });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    }
  };
};