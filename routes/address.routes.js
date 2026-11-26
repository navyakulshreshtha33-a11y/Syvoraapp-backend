// const express = require('express');

// module.exports = function (prisma) {
//   const router = express.Router();

//   // 1. ADD NEW ADDRESS
//   router.post('/address', async (req, res) => {
//     try {
//       const { userId, name, phone, addressLine, city, state, pincode, isDefault } = req.body;

//       if (!userId || !name || !phone || !addressLine || !city || !state || !pincode) {
//         return res.status(400).json({ error: "All required fields (userId, name, phone, addressLine, city, state, pincode) must be provided" });
//       }

//       // Agar naye address ko isDefault: true banaya hai, toh user ke baaki saare addresses ko isDefault: false kar do
//       if (isDefault) {
//         await prisma.address.updateMany({
//           where: { userId: Number(userId) },
//           data: { isDefault: false }
//         });
//       }

//       const newAddress = await prisma.address.create({
//         data: {
//           userId: Number(userId),
//           name,
//           phone,
//           addressLine,
//           city,
//           state,
//           pincode,
//           isDefault: isDefault || false
//         }
//       });

//       res.status(201).json({ message: "Address added successfully!", address: newAddress });
//     } catch (error) {
//       console.error("Add Address Error:", error);
//       res.status(500).json({ error: "Internal Server Error" });
//     }
//   });

//   // 2. GET ALL ADDRESSES FOR A USER
//   router.get('/address/user/:userId', async (req, res) => {
//     try {
//       const { userId } = req.params;

//       const addresses = await prisma.address.findMany({
//         where: { userId: Number(userId) },
//         orderBy: [
//           { isDefault: 'desc' },
//           { createdAt: 'desc' }
//         ]
//       });

//       res.json(addresses);
//     } catch (error) {
//       console.error("Get Addresses Error:", error);
//       res.status(500).json({ error: "Internal Server Error" });
//     }
//   });

//   // 3. UPDATE AN EXISTING ADDRESS
//   router.put('/address/:id', async (req, res) => {
//     try {
//       const { id } = req.params;
//       const { userId, name, phone, addressLine, city, state, pincode, isDefault } = req.body;

//       if (isDefault && userId) {
//         await prisma.address.updateMany({
//           where: { userId: Number(userId) },
//           data: { isDefault: false }
//         });
//       }

//       const updatedAddress = await prisma.address.update({
//         where: { id: Number(id) },
//         data: {
//           ...(name && { name }),
//           ...(phone && { phone }),
//           ...(addressLine && { addressLine }),
//           ...(city && { city }),
//           ...(state && { state }),
//           ...(pincode && { pincode }),
//           ...(isDefault !== undefined && { isDefault })
//         }
//       });

//       res.json({ message: "Address updated successfully!", address: updatedAddress });
//     } catch (error) {
//       console.error("Update Address Error:", error);
//       res.status(500).json({ error: "Internal Server Error" });
//     }
//   });

//   // 4. SET DEFAULT ADDRESS
//   router.patch('/address/:id/default', async (req, res) => {
//     try {
//       const { id } = req.params;
//       const { userId } = req.body;

//       if (!userId) {
//         return res.status(400).json({ error: "userId is required in body" });
//       }

//       // Purane saare addresses ko non-default karo
//       await prisma.address.updateMany({
//         where: { userId: Number(userId) },
//         data: { isDefault: false }
//       });

//       // Target address ko default set karo
//       const updatedAddress = await prisma.address.update({
//         where: { id: Number(id) },
//         data: { isDefault: true }
//       });

//       res.json({ message: "Default address updated successfully!", address: updatedAddress });
//     } catch (error) {
//       console.error("Set Default Address Error:", error);
//       res.status(500).json({ error: "Internal Server Error" });
//     }
//   });

//   // 5. DELETE AN ADDRESS
//   router.delete('/address/:id', async (req, res) => {
//     try {
//       const { id } = req.params;

//       await prisma.address.delete({
//         where: { id: Number(id) }
//       });

//       res.json({ message: "Address deleted successfully!" });
//     } catch (error) {
//       console.error("Delete Address Error:", error);
//       res.status(500).json({ error: "Internal Server Error" });
//     }
//   });

//   return router;
// };




















const express = require('express');
const jwt = require('jsonwebtoken');

module.exports = function (prisma) {
  const router = express.Router();

  function getUserIdFromToken(req) {
    const authHeader = req.headers.authorization;
    if (!authHeader) throw new Error("Unauthorized");
    const token = authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : authHeader;
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const id = Number(decoded.id ?? decoded.userId);
    if (!Number.isInteger(id) || id <= 0) throw new Error("Unauthorized");
    return id;
  }

  function isTokenAuthError(err) {
    return (
      err?.message === "Unauthorized" ||
      err?.name === "JsonWebTokenError" ||
      err?.name === "TokenExpiredError"
    );
  }

  function handleRouteError(res, error, logLabel) {
    if (logLabel) console.error(logLabel, error);
    if (isTokenAuthError(error)) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    return res.status(500).json({ error: "Internal Server Error" });
  }

  function isValidPhone(phone) {
    const digits = String(phone || '').replace(/\D/g, '');
    return digits.length >= 10 && digits.length <= 15;
  }

  function isValidPincode(pincode) {
    return /^[1-9][0-9]{5}$/.test(String(pincode || '').trim());
  }

  // 1. ADD NEW ADDRESS
  router.post('/address', async (req, res) => {
    try {
      const userId = getUserIdFromToken(req);
      const { name, phone, addressLine, city, state, pincode, isDefault } = req.body || {};

      if (!name || !phone || !addressLine || !city || !state || !pincode) {
        return res.status(400).json({
          error: "All required fields (name, phone, addressLine, city, state, pincode) must be provided"
        });
      }

      const cleanPhone = String(phone).trim();
      const cleanPincode = String(pincode).trim();

      if (!isValidPhone(cleanPhone)) {
        return res.status(400).json({ error: "Please enter a valid phone number" });
      }
      if (!isValidPincode(cleanPincode)) {
        return res.status(400).json({ error: "Please enter a valid 6-digit pincode" });
      }

      const shouldBeDefault = Boolean(isDefault);

      const newAddress = await prisma.$transaction(async (tx) => {
        if (shouldBeDefault) {
          await tx.address.updateMany({
            where: { userId },
            data: { isDefault: false }
          });
        }

        return tx.address.create({
          data: {
            userId,
            name: String(name).trim(),
            phone: cleanPhone,
            addressLine: String(addressLine).trim(),
            city: String(city).trim(),
            state: String(state).trim(),
            pincode: cleanPincode,
            isDefault: shouldBeDefault
          }
        });
      });

      res.status(201).json({ message: "Address added successfully!", address: newAddress });
    } catch (error) {
      return handleRouteError(res, error, "Add Address Error:");
    }
  });

  // 2. GET ALL ADDRESSES FOR A USER
  router.get('/address/user/:userId', async (req, res) => {
    try {
      const tokenUserId = getUserIdFromToken(req);
      const paramUserId = Number(req.params.userId);
      if (!Number.isInteger(paramUserId) || paramUserId <= 0) {
        return res.status(400).json({ error: "Invalid user ID" });
      }

      if (tokenUserId !== paramUserId) {
        const currentUser = await prisma.user.findUnique({
          where: { id: tokenUserId },
          select: { role: true }
        });
        if (!currentUser || currentUser.role !== 'ADMIN') {
          return res.status(403).json({ error: "Access denied" });
        }
      }

      const addresses = await prisma.address.findMany({
        where: { userId: paramUserId },
        orderBy: [
          { isDefault: 'desc' },
          { createdAt: 'desc' }
        ]
      });

      res.json(addresses);
    } catch (error) {
      return handleRouteError(res, error, "Get Addresses Error:");
    }
  });

  // 3. UPDATE AN EXISTING ADDRESS
  router.put('/address/:id', async (req, res) => {
    try {
      const userId = getUserIdFromToken(req);
      const addressId = Number(req.params.id);
      if (!Number.isInteger(addressId) || addressId <= 0) {
        return res.status(400).json({ error: "Invalid address ID" });
      }

      const existing = await prisma.address.findUnique({ where: { id: addressId } });
      if (!existing) {
        return res.status(404).json({ error: "Address not found" });
      }
      if (Number(existing.userId) !== userId) {
        return res.status(403).json({ error: "Access denied: not your address" });
      }

      const { name, phone, addressLine, city, state, pincode, isDefault } = req.body || {};
      const updateData = {};

      if (name !== undefined) {
        const val = String(name).trim();
        if (!val) return res.status(400).json({ error: "Name cannot be empty" });
        updateData.name = val;
      }
      if (phone !== undefined) {
        const val = String(phone).trim();
        if (!isValidPhone(val)) return res.status(400).json({ error: "Please enter a valid phone number" });
        updateData.phone = val;
      }
      if (addressLine !== undefined) {
        const val = String(addressLine).trim();
        if (!val) return res.status(400).json({ error: "Address line cannot be empty" });
        updateData.addressLine = val;
      }
      if (city !== undefined) {
        const val = String(city).trim();
        if (!val) return res.status(400).json({ error: "City cannot be empty" });
        updateData.city = val;
      }
      if (state !== undefined) {
        const val = String(state).trim();
        if (!val) return res.status(400).json({ error: "State cannot be empty" });
        updateData.state = val;
      }
      if (pincode !== undefined) {
        const val = String(pincode).trim();
        if (!isValidPincode(val)) return res.status(400).json({ error: "Please enter a valid 6-digit pincode" });
        updateData.pincode = val;
      }
      if (isDefault !== undefined) {
        updateData.isDefault = Boolean(isDefault);
      }

      const updatedAddress = await prisma.$transaction(async (tx) => {
        if (updateData.isDefault) {
          await tx.address.updateMany({
            where: { userId },
            data: { isDefault: false }
          });
        }
        return tx.address.update({
          where: { id: addressId },
          data: updateData
        });
      });

      res.json({ message: "Address updated successfully!", address: updatedAddress });
    } catch (error) {
      return handleRouteError(res, error, "Update Address Error:");
    }
  });

  // 4. SET DEFAULT ADDRESS
  router.patch('/address/:id/default', async (req, res) => {
    try {
      const userId = getUserIdFromToken(req);
      const addressId = Number(req.params.id);
      if (!Number.isInteger(addressId) || addressId <= 0) {
        return res.status(400).json({ error: "Invalid address ID" });
      }

      const existing = await prisma.address.findUnique({ where: { id: addressId } });
      if (!existing) {
        return res.status(404).json({ error: "Address not found" });
      }
      if (Number(existing.userId) !== userId) {
        return res.status(403).json({ error: "Access denied: not your address" });
      }

      const updatedAddress = await prisma.$transaction(async (tx) => {
        await tx.address.updateMany({
          where: { userId },
          data: { isDefault: false }
        });

        return tx.address.update({
          where: { id: addressId },
          data: { isDefault: true }
        });
      });

      res.json({ message: "Default address updated successfully!", address: updatedAddress });
    } catch (error) {
      return handleRouteError(res, error, "Set Default Address Error:");
    }
  });

  // 5. DELETE AN ADDRESS
  router.delete('/address/:id', async (req, res) => {
    try {
      const userId = getUserIdFromToken(req);
      const addressId = Number(req.params.id);
      if (!Number.isInteger(addressId) || addressId <= 0) {
        return res.status(400).json({ error: "Invalid address ID" });
      }

      const existing = await prisma.address.findUnique({ where: { id: addressId } });
      if (!existing) {
        return res.status(404).json({ error: "Address not found" });
      }
      if (Number(existing.userId) !== userId) {
        return res.status(403).json({ error: "Access denied: not your address" });
      }

      await prisma.address.delete({
        where: { id: addressId }
      });

      res.json({ message: "Address deleted successfully!" });
    } catch (error) {
      return handleRouteError(res, error, "Delete Address Error:");
    }
  });

  return router;
};