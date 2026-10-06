const express = require('express');

module.exports = function (prisma) {
  const router = express.Router();

  // 1. ADD NEW ADDRESS
  router.post('/address', async (req, res) => {
    try {
      const { userId, name, phone, addressLine, city, state, pincode, isDefault } = req.body;

      if (!userId || !name || !phone || !addressLine || !city || !state || !pincode) {
        return res.status(400).json({ error: "All required fields (userId, name, phone, addressLine, city, state, pincode) must be provided" });
      }

      // Agar naye address ko isDefault: true banaya hai, toh user ke baaki saare addresses ko isDefault: false kar do
      if (isDefault) {
        await prisma.address.updateMany({
          where: { userId: Number(userId) },
          data: { isDefault: false }
        });
      }

      const newAddress = await prisma.address.create({
        data: {
          userId: Number(userId),
          name,
          phone,
          addressLine,
          city,
          state,
          pincode,
          isDefault: isDefault || false
        }
      });

      res.status(201).json({ message: "Address added successfully!", address: newAddress });
    } catch (error) {
      console.error("Add Address Error:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  // 2. GET ALL ADDRESSES FOR A USER
  router.get('/address/user/:userId', async (req, res) => {
    try {
      const { userId } = req.params;

      const addresses = await prisma.address.findMany({
        where: { userId: Number(userId) },
        orderBy: [
          { isDefault: 'desc' },
          { createdAt: 'desc' }
        ]
      });

      res.json(addresses);
    } catch (error) {
      console.error("Get Addresses Error:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  // 3. UPDATE AN EXISTING ADDRESS
  router.put('/address/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { userId, name, phone, addressLine, city, state, pincode, isDefault } = req.body;

      if (isDefault && userId) {
        await prisma.address.updateMany({
          where: { userId: Number(userId) },
          data: { isDefault: false }
        });
      }

      const updatedAddress = await prisma.address.update({
        where: { id: Number(id) },
        data: {
          ...(name && { name }),
          ...(phone && { phone }),
          ...(addressLine && { addressLine }),
          ...(city && { city }),
          ...(state && { state }),
          ...(pincode && { pincode }),
          ...(isDefault !== undefined && { isDefault })
        }
      });

      res.json({ message: "Address updated successfully!", address: updatedAddress });
    } catch (error) {
      console.error("Update Address Error:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  // 4. SET DEFAULT ADDRESS
  router.patch('/address/:id/default', async (req, res) => {
    try {
      const { id } = req.params;
      const { userId } = req.body;

      if (!userId) {
        return res.status(400).json({ error: "userId is required in body" });
      }

      // Purane saare addresses ko non-default karo
      await prisma.address.updateMany({
        where: { userId: Number(userId) },
        data: { isDefault: false }
      });

      // Target address ko default set karo
      const updatedAddress = await prisma.address.update({
        where: { id: Number(id) },
        data: { isDefault: true }
      });

      res.json({ message: "Default address updated successfully!", address: updatedAddress });
    } catch (error) {
      console.error("Set Default Address Error:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  // 5. DELETE AN ADDRESS
  router.delete('/address/:id', async (req, res) => {
    try {
      const { id } = req.params;

      await prisma.address.delete({
        where: { id: Number(id) }
      });

      res.json({ message: "Address deleted successfully!" });
    } catch (error) {
      console.error("Delete Address Error:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  return router;
};