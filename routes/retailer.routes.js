const express = require('express');
const router = express.Router();

module.exports = (prisma, verifyAdmin) => {

  router.post('/', verifyAdmin, async (req, res) => {
    try {
      const { shopName, ownerName, description, phone, email, city } = req.body;
      if (!shopName) return res.status(400).json({ error: "shopName required" });
      const retailer = await prisma.retailer.create({ data: { shopName, ownerName, description, phone, email, city } });
      res.status(201).json(retailer);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.get('/', async (req, res) => {
    try {
      const { search, city } = req.query;
      const where = {};
      if (search) where.shopName = { contains: search, mode: 'insensitive' };
      if (city) where.city = { contains: city, mode: 'insensitive' };
      const retailers = await prisma.retailer.findMany({
        where,
        include: { outlets: true, _count: { select: { products: true } } },
        orderBy: { shopName: 'asc' }
      });
      res.json(retailers);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.get('/:id', async (req, res) => {
    try {
      const retailer = await prisma.retailer.findUnique({
        where: { id: Number(req.params.id) },
        include: { outlets: true, products: { include: { category: true, images: true } } }
      });
      if (!retailer) return res.status(404).json({ error: "Retailer not found" });
      res.json(retailer);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.post('/:id/outlets', verifyAdmin, async (req, res) => {
    try {
      const { outletName, addressLine, city, state, pincode, landmark, phone, isMain } = req.body;
      const outlet = await prisma.retailerOutlet.create({
        data: { retailerId: Number(req.params.id), outletName, addressLine, city, state, pincode, landmark, phone, isMain: Boolean(isMain) }
      });
      res.status(201).json(outlet);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.get('/:id/products', async (req, res) => {
    try {
      const products = await prisma.product.findMany({
        where: { retailerId: Number(req.params.id) },
        include: { images: true, category: true }
      });
      res.json(products);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.delete('/:id', verifyAdmin, async (req, res) => {
    await prisma.retailer.delete({ where: { id: Number(req.params.id) } });
    res.json({ message: "Retailer deleted" });
  });

  return router;
};