// const express = require('express');
// const router = express.Router();

// module.exports = (prisma) => {

//   // Brand APIs
//   router.post('/brands', async (req, res) => {
//     try {
//       const { name, description, instagramUrl, websiteUrl } = req.body;
//       if (!name) return res.status(400).json({ error: "Brand name is required" });
//       const brand = await prisma.brand.create({ data: { name, description, instagramUrl, websiteUrl } });
//       res.status(201).json({ message: "Brand created successfully!", brand });
//     } catch (error) {
//       console.error("Create Brand Error:", error);
//       res.status(500).json({ error: "Internal Server Error" });
//     }
//   });

//   router.get('/brands', async (req, res) => {
//     try {
//       const brands = await prisma.brand.findMany({ include: { _count: { select: { products: true } } } });
//       res.json(brands);
//     } catch (error) {
//       console.error("Get Brands Error:", error);
//       res.status(500).json({ error: "Internal Server Error" });
//     }
//   });

//   // Category APIs
//   router.post('/categories', async (req, res) => {
//     try {
//       const { name } = req.body;
//       if (!name) return res.status(400).json({ error: "Category name is required" });
//       const category = await prisma.category.create({ data: { name } });
//       res.status(201).json({ message: "Category created successfully!", category });
//     } catch (error) {
//       console.error("Create Category Error:", error);
//       res.status(500).json({ error: "Internal Server Error" });
//     }
//   });

//   router.get('/categories', async (req, res) => {
//     try {
//       const categories = await prisma.category.findMany({ include: { _count: { select: { products: true } } } });
//       res.json(categories);
//     } catch (error) {
//       console.error("Get Categories Error:", error);
//       res.status(500).json({ error: "Internal Server Error" });
//     }
//   });

//   // Product APIs
//   router.post('/products', async (req, res) => {
//     try {
//       const { brandId, categoryId, name, description, price, images, sizeChartItems } = req.body;
//       if (!brandId || !categoryId || !name || !price) {
//         return res.status(400).json({ error: "Required fields missing" });
//       }

//       const product = await prisma.product.create({
//         data: {
//           brandId: Number(brandId),
//           categoryId: Number(categoryId),
//           name,
//           description,
//           price: parseFloat(price),
//           images: images?.length ? { create: images.map((url, i) => ({ imageUrl: url, sortOrder: i })) } : undefined,
//           sizeChart: sizeChartItems?.length ? {
//             create: { items: { create: sizeChartItems.map(item => ({ sizeLabel: item.sizeLabel, measurementDetails: item.measurementDetails })) } }
//           } : undefined
//         },
//         include: { brand: true, category: true, images: true, sizeChart: { include: { items: true } } }
//       });
//       res.status(201).json({ message: "Product created successfully!", product });
//     } catch (error) {
//       console.error("Create Product Error:", error);
//       res.status(500).json({ error: "Internal Server Error" });
//     }
//   });

//   router.get('/products', async (req, res) => {
//     try {
//       const products = await prisma.product.findMany({
//         include: { brand: true, category: true, images: true, sizeChart: { include: { items: true } } },
//         orderBy: { createdAt: 'desc' }
//       });
//       res.json(products);
//     } catch (error) {
//       console.error("Get Products Error:", error);
//       res.status(500).json({ error: "Internal Server Error" });
//     }
//   });

//   router.get('/products/:id', async (req, res) => {
//     try {
//       const product = await prisma.product.findUnique({
//         where: { id: Number(req.params.id) },
//         include: { brand: true, category: true, images: true, sizeChart: { include: { items: true } } }
//       });
//       if (!product) return res.status(404).json({ error: "Product not found" });
//       res.json(product);
//     } catch (error) {
//       console.error("Get Product Error:", error);
//       res.status(500).json({ error: "Internal Server Error" });
//     }
//   });

//   return router;
// };




const express = require('express');
const router = express.Router();

// Yahan 'verifyAdmin' ko receive kiya hai
module.exports = (prisma, verifyAdmin) => {

  // Brand APIs (Sirf Admin create kar sakta hai)
  router.post('/brands', verifyAdmin, async (req, res) => {
    try {
      const { name, description, instagramUrl, websiteUrl } = req.body;
      if (!name) return res.status(400).json({ error: "Brand name is required" });
      const brand = await prisma.brand.create({ data: { name, description, instagramUrl, websiteUrl } });
      res.status(201).json({ message: "Brand created successfully by Admin!", brand });
    } catch (error) {
      console.error("Create Brand Error:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  router.get('/brands', async (req, res) => {
    try {
      const brands = await prisma.brand.findMany({ include: { _count: { select: { products: true } } } });
      res.json(brands);
    } catch (error) {
      console.error("Get Brands Error:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  // Category APIs (Sirf Admin create kar sakta hai)
  router.post('/categories', verifyAdmin, async (req, res) => {
    try {
      const { name } = req.body;
      if (!name) return res.status(400).json({ error: "Category name is required" });
      const category = await prisma.category.create({ data: { name } });
      res.status(201).json({ message: "Category created successfully by Admin!", category });
    } catch (error) {
      console.error("Create Category Error:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  router.get('/categories', async (req, res) => {
    try {
      const categories = await prisma.category.findMany({ include: { _count: { select: { products: true } } } });
      res.json(categories);
    } catch (error) {
      console.error("Get Categories Error:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  // Product APIs (Sirf Admin product create kar sakta hai)
  router.post('/products', verifyAdmin, async (req, res) => {
    try {
      const { brandId, categoryId, name, description, price, images, sizeChartItems } = req.body;
      if (!brandId || !categoryId || !name || !price) {
        return res.status(400).json({ error: "Required fields missing" });
      }

      const product = await prisma.product.create({
        data: {
          brandId: Number(brandId),
          categoryId: Number(categoryId),
          name,
          description,
          price: parseFloat(price),
          images: images?.length ? { create: images.map((url, i) => ({ imageUrl: url, sortOrder: i })) } : undefined,
          sizeChart: sizeChartItems?.length ? {
            create: { items: { create: sizeChartItems.map(item => ({ sizeLabel: item.sizeLabel, measurementDetails: item.measurementDetails })) } }
          } : undefined
        },
        include: { brand: true, category: true, images: true, sizeChart: { include: { items: true } } }
      });
      res.status(201).json({ message: "Product created successfully by Admin!", product });
    } catch (error) {
      console.error("Create Product Error:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  router.get('/products', async (req, res) => {
    try {
      const products = await prisma.product.findMany({
        include: { brand: true, category: true, images: true, sizeChart: { include: { items: true } } },
        orderBy: { createdAt: 'desc' }
      });
      res.json(products);
    } catch (error) {
      console.error("Get Products Error:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  router.get('/products/:id', async (req, res) => {
    try {
      const product = await prisma.product.findUnique({
        where: { id: Number(req.params.id) },
        include: { brand: true, category: true, images: true, sizeChart: { include: { items: true } } }
      });
      if (!product) return res.status(404).json({ error: "Product not found" });
      res.json(product);
    } catch (error) {
      console.error("Get Product Error:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  return router;
};