const express = require('express');

module.exports = function (prisma) {
  const router = express.Router();

  // 1. SAVE / UPDATE MEASUREMENT PROFILE (UPSERT)
  router.post('/measurement', async (req, res) => {
    try {
      const { userId, height, weight, bodyType, fitType } = req.body;

      if (!userId) {
        return res.status(400).json({ error: "userId is required" });
      }

      // Upsert: Profile nahi hai toh create karega, hai toh update karega
      const measurement = await prisma.measurementProfile.upsert({
        where: { userId: Number(userId) },
        update: {
          ...(height !== undefined && { height: parseFloat(height) }),
          ...(weight !== undefined && { weight: parseFloat(weight) }),
          ...(bodyType !== undefined && { bodyType }),
          ...(fitType !== undefined && { fitType })
        },
        create: {
          userId: Number(userId),
          height: height ? parseFloat(height) : null,
          weight: weight ? parseFloat(weight) : null,
          bodyType: bodyType || null,
          fitType: fitType || null
        }
      });

      res.status(200).json({ message: "Measurement profile saved successfully!", measurement });
    } catch (error) {
      console.error("Save Measurement Error:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  // 2. GET USER MEASUREMENT PROFILE
  router.get('/measurement/user/:userId', async (req, res) => {
    try {
      const { userId } = req.params;

      const measurement = await prisma.measurementProfile.findUnique({
        where: { userId: Number(userId) }
      });

      if (!measurement) {
        return res.status(404).json({ error: "Measurement profile not found for this user" });
      }

      res.json(measurement);
    } catch (error) {
      console.error("Get Measurement Error:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  // 3. DELETE MEASUREMENT PROFILE
  router.delete('/measurement/user/:userId', async (req, res) => {
    try {
      const { userId } = req.params;

      await prisma.measurementProfile.delete({
        where: { userId: Number(userId) }
      });

      res.json({ message: "Measurement profile deleted successfully!" });
    } catch (error) {
      console.error("Delete Measurement Error:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  return router;
};