// const express = require('express');
// const router = express.Router();

// module.exports = (prisma, verifyAdmin) => {

//   router.post('/', verifyAdmin, async (req, res) => {
//     try {
//       const { shopName, ownerName, description, phone, email, city } = req.body;
//       if (!shopName) return res.status(400).json({ error: "shopName required" });
//       const retailer = await prisma.retailer.create({ data: { shopName, ownerName, description, phone, email, city } });
//       res.status(201).json(retailer);
//     } catch (e) { res.status(500).json({ error: e.message }); }
//   });

//   router.get('/', async (req, res) => {
//     try {
//       const { search, city } = req.query;
//       const where = {};
//       if (search) where.shopName = { contains: search, mode: 'insensitive' };
//       if (city) where.city = { contains: city, mode: 'insensitive' };
//       const retailers = await prisma.retailer.findMany({
//         where,
//         include: { outlets: true, _count: { select: { products: true } } },
//         orderBy: { shopName: 'asc' }
//       });
//       res.json(retailers);
//     } catch (e) { res.status(500).json({ error: e.message }); }
//   });

//   router.get('/:id', async (req, res) => {
//     try {
//       const retailer = await prisma.retailer.findUnique({
//         where: { id: Number(req.params.id) },
//         include: { outlets: true, products: { include: { category: true, images: true } } }
//       });
//       if (!retailer) return res.status(404).json({ error: "Retailer not found" });
//       res.json(retailer);
//     } catch (e) { res.status(500).json({ error: e.message }); }
//   });

//   router.post('/:id/outlets', verifyAdmin, async (req, res) => {
//     try {
//       const { outletName, addressLine, city, state, pincode, landmark, phone, isMain } = req.body;
//       const outlet = await prisma.retailerOutlet.create({
//         data: { retailerId: Number(req.params.id), outletName, addressLine, city, state, pincode, landmark, phone, isMain: Boolean(isMain) }
//       });
//       res.status(201).json(outlet);
//     } catch (e) { res.status(500).json({ error: e.message }); }
//   });

//   router.get('/:id/products', async (req, res) => {
//     try {
//       const products = await prisma.product.findMany({
//         where: { retailerId: Number(req.params.id) },
//         include: { images: true, category: true }
//       });
//       res.json(products);
//     } catch (e) { res.status(500).json({ error: e.message }); }
//   });

//   router.delete('/:id', verifyAdmin, async (req, res) => {
//     await prisma.retailer.delete({ where: { id: Number(req.params.id) } });
//     res.json({ message: "Retailer deleted" });
//   });

//   return router;
// };




















const express = require('express');
const router = express.Router();

module.exports = (prisma, verifyAdmin) => {
  function parsePositiveInt(val) {
    const num = Number(val);
    return Number.isInteger(num) && num > 0 ? num : null;
  }

  function cleanOptionalString(val, maxLen) {
    if (val === undefined || val === null) return null;
    if (typeof val !== 'string') return undefined;
    const trimmed = val.trim();
    if (!trimmed) return null;
    return trimmed.slice(0, maxLen);
  }

  function isValidEmail(val) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);
  }

  function isValidPhone(val) {
    return /^[0-9+\-\s()]{7,20}$/.test(val);
  }

  router.post('/', verifyAdmin, async (req, res) => {
    try {
      const { shopName, ownerName, description, phone, email, city } = req.body || {};
      if (!shopName || typeof shopName !== 'string' || !shopName.trim()) {
        return res.status(400).json({ error: "shopName required" });
      }

      const cleanShopName = shopName.trim().slice(0, 120);
      const cleanOwner = cleanOptionalString(ownerName, 100);
      const cleanDesc = cleanOptionalString(description, 500);
      const cleanPhone = cleanOptionalString(phone, 20);
      const cleanEmail = cleanOptionalString(email, 120);
      const cleanCity = cleanOptionalString(city, 80);

      if (
        cleanOwner === undefined ||
        cleanDesc === undefined ||
        cleanPhone === undefined ||
        cleanEmail === undefined ||
        cleanCity === undefined
      ) {
        return res.status(400).json({ error: "Invalid field data types" });
      }

      if (cleanEmail && !isValidEmail(cleanEmail.toLowerCase())) {
        return res.status(400).json({ error: "Invalid email format" });
      }
      if (cleanPhone && !isValidPhone(cleanPhone)) {
        return res.status(400).json({ error: "Invalid phone number" });
      }

      const retailer = await prisma.retailer.create({
        data: {
          shopName: cleanShopName,
          ownerName: cleanOwner,
          description: cleanDesc,
          phone: cleanPhone,
          email: cleanEmail ? cleanEmail.toLowerCase() : null,
          city: cleanCity
        }
      });
      res.status(201).json(retailer);
    } catch (e) {
      console.error("Create Retailer Error:", e.message);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  router.get('/', async (req, res) => {
    try {
      const { search, city } = req.query;
      const where = {};
      if (search) {
        const q = String(search).trim().slice(0, 80);
        if (q) where.shopName = { contains: q, mode: 'insensitive' };
      }
      if (city) {
        const c = String(city).trim().slice(0, 80);
        if (c) where.city = { contains: c, mode: 'insensitive' };
      }
      const retailers = await prisma.retailer.findMany({
        where,
        include: { outlets: true, _count: { select: { products: true } } },
        orderBy: { shopName: 'asc' }
      });
      res.json(retailers);
    } catch (e) {
      console.error("Get Retailers Error:", e.message);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  router.get('/:id', async (req, res) => {
    try {
      const retailerId = parsePositiveInt(req.params.id);
      if (!retailerId) {
        return res.status(400).json({ error: "Invalid retailer ID" });
      }
      const retailer = await prisma.retailer.findUnique({
        where: { id: retailerId },
        include: { outlets: true, products: { include: { category: true, images: true } } }
      });
      if (!retailer) return res.status(404).json({ error: "Retailer not found" });
      res.json(retailer);
    } catch (e) {
      console.error("Get Retailer By ID Error:", e.message);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  router.post('/:id/outlets', verifyAdmin, async (req, res) => {
    try {
      const retailerId = parsePositiveInt(req.params.id);
      if (!retailerId) {
        return res.status(400).json({ error: "Invalid retailer ID" });
      }

      const retailer = await prisma.retailer.findUnique({
        where: { id: retailerId },
        select: { id: true }
      });
      if (!retailer) {
        return res.status(404).json({ error: "Retailer not found" });
      }

      const { outletName, addressLine, city, state, pincode, landmark, phone, isMain } = req.body || {};
      if (!outletName || typeof outletName !== 'string' || !outletName.trim()) {
        return res.status(400).json({ error: "outletName required" });
      }

      const cleanName = outletName.trim().slice(0, 120);
      const cleanAddress = cleanOptionalString(addressLine, 250);
      const cleanCity = cleanOptionalString(city, 80);
      const cleanState = cleanOptionalString(state, 80);
      const cleanPincode = cleanOptionalString(pincode, 12);
      const cleanLandmark = cleanOptionalString(landmark, 150);
      const cleanPhone = cleanOptionalString(phone, 20);

      if (
        cleanAddress === undefined ||
        cleanCity === undefined ||
        cleanState === undefined ||
        cleanPincode === undefined ||
        cleanLandmark === undefined ||
        cleanPhone === undefined
      ) {
        return res.status(400).json({ error: "Invalid outlet field types" });
      }

      if (cleanPincode && !/^[1-9][0-9]{5}$/.test(cleanPincode)) {
        return res.status(400).json({ error: "Invalid 6-digit Indian pincode" });
      }
      if (cleanPhone && !isValidPhone(cleanPhone)) {
        return res.status(400).json({ error: "Invalid phone number" });
      }

      const outlet = await prisma.retailerOutlet.create({
        data: {
          retailerId,
          outletName: cleanName,
          addressLine: cleanAddress,
          city: cleanCity,
          state: cleanState,
          pincode: cleanPincode,
          landmark: cleanLandmark,
          phone: cleanPhone,
          isMain: Boolean(isMain)
        }
      });
      res.status(201).json(outlet);
    } catch (e) {
      console.error("Create Outlet Error:", e.message);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  router.get('/:id/products', async (req, res) => {
    try {
      const retailerId = parsePositiveInt(req.params.id);
      if (!retailerId) {
        return res.status(400).json({ error: "Invalid retailer ID" });
      }
      const products = await prisma.product.findMany({
        where: { retailerId },
        include: { images: true, category: true }
      });
      res.json(products);
    } catch (e) {
      console.error("Get Retailer Products Error:", e.message);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  router.delete('/:id', verifyAdmin, async (req, res) => {
    try {
      const retailerId = parsePositiveInt(req.params.id);
      if (!retailerId) {
        return res.status(400).json({ error: "Invalid retailer ID" });
      }

      const existing = await prisma.retailer.findUnique({
        where: { id: retailerId },
        include: {
          _count: { select: { products: true, outlets: true } }
        }
      });
      if (!existing) {
        return res.status(404).json({ error: "Retailer not found" });
      }

      if (existing._count?.products > 0) {
        return res.status(409).json({
          error: "Cannot delete retailer while products are still assigned to it"
        });
      }

      await prisma.$transaction(async (tx) => {
        if (tx.retailerOutlet) {
          await tx.retailerOutlet.deleteMany({ where: { retailerId } });
        }
        await tx.retailer.delete({ where: { id: retailerId } });
      });

      res.json({ message: "Retailer deleted" });
    } catch (e) {
      console.error("Delete Retailer Error:", e.message);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  return router;
};