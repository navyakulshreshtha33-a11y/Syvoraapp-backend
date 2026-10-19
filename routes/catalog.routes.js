

// // const express = require('express');
// // const router = express.Router();
// // const cloudinary = require('../services/cloudinary');

// // // Map Product Category Name -> GarmentCategory Enum
// // const VALID_GARMENT_CATEGORIES = ["Tshirt", "Top", "Shirt", "Kurta", "Dress", "Jeans", "Pant", "Trouser", "Shorts", "Skirt", "Kurti", "Suit"];

// // function mapToGarmentCategory(categoryName) {
// //   if (!categoryName) return "Tshirt";
// //   const formatted = categoryName.charAt(0).toUpperCase() + categoryName.slice(1).toLowerCase();
// //   if (VALID_GARMENT_CATEGORIES.includes(categoryName)) return categoryName;
// //   if (VALID_GARMENT_CATEGORIES.includes(formatted)) return formatted;
// //   // custom mapping
// //   const lower = categoryName.toLowerCase();
// //   if (lower.includes("t-shirt") || lower.includes("tshirt")) return "Tshirt";
// //   if (lower.includes("jean")) return "Jeans";
// //   return "Tshirt"; // default fallback
// // }

// // module.exports = (prisma, verifyAdmin) => {

// //   // ========== BRANDS ==========
// //   router.post('/brands', verifyAdmin, async (req, res) => {
// //     try {
// //       const { name, description, instagramUrl, websiteUrl } = req.body;
// //       if (!name) return res.status(400).json({ error: "Brand name is required" });
// //       const brand = await prisma.brand.create({ data: { name, description, instagramUrl, websiteUrl } });
// //       res.status(201).json({ message: "Brand created!", brand });
// //     } catch (e) { res.status(500).json({ error: e.message }); }
// //   });

// //   router.get('/brands', async (req, res) => {
// //     const brands = await prisma.brand.findMany({ include: { _count: { select: { products: true } } } });
// //     res.json(brands);
// //   });

// //   // ========== CATEGORIES ==========
// //   router.post('/categories', verifyAdmin, async (req, res) => {
// //     try {
// //       const { name } = req.body;
// //       if (!name) return res.status(400).json({ error: "Category name is required" });
// //       const category = await prisma.category.create({ data: { name } });
// //       res.status(201).json({ message: "Category created!", category });
// //     } catch (e) { res.status(500).json({ error: e.message }); }
// //   });

// //   router.get('/categories', async (req, res) => {
// //     const categories = await prisma.category.findMany({ include: { _count: { select: { products: true } } } });
// //     res.json(categories);
// //   });

// //   // ========== PRODUCTS - PRODUCTION FLOW ==========

// //   // CREATE PRODUCT + AUTO GARMENT + AUTO SIZECHART
// //   router.post('/products', verifyAdmin, async (req, res) => {
// //     try {
// //       const { brandId, categoryId, name, description, price, images, sizeChartItems, stock, isOutOfStock } = req.body;
// //       if (!brandId ||!categoryId ||!name ||!price) {
// //         return res.status(400).json({ error: "brandId, categoryId, name, price required" });
// //       }

// //       // 1. Get Category Name for Garment Mapping
// //       const category = await prisma.category.findUnique({ where: { id: Number(categoryId) } });
// //       if (!category) return res.status(404).json({ error: "Category not found" });
// //       const garmentCategory = mapToGarmentCategory(category.name);

// //       // 2. Upload Images to Cloudinary
// //       let imagesToCreate = [];
// //       if (images?.length) {
// //         for (let i = 0; i < images.length; i++) {
// //           const uploaded = await cloudinary.uploader.upload(images[i], { folder: "syvora/products" });
// //           imagesToCreate.push({ imageUrl: uploaded.secure_url, publicId: uploaded.public_id, sortOrder: i });
// //         }
// //       }
// //       if (!imagesToCreate.length) return res.status(400).json({ error: "At least one image required" });

// //       // 3. Transaction: Product + Garment + SizeChart
// //       const result = await prisma.$transaction(async (tx) => {
// //         // Create Product
// //         const product = await tx.product.create({
// //           data: {
// //             brandId: Number(brandId),
// //             categoryId: Number(categoryId),
// //             name, description,
// //             price: parseFloat(price),
// //             stock: stock!== undefined? Number(stock) : 10,
// //             isOutOfStock: isOutOfStock!== undefined? Boolean(isOutOfStock) : false,
// //             images: { create: imagesToCreate }
// //           },
// //           include: { images: true }
// //         });

// //         // Create Garment (for VTO) - Use first image as garment image
// //         const garment = await tx.garment.create({
// //           data: {
// //             brandId: Number(brandId),
// //             name: name,
// //             category: garmentCategory,
// //             imageUrl: product.images[0].imageUrl,
// //             cloudinaryPublicId: product.images[0].publicId || "syvora/products",
// //             productId: product.id
// //           }
// //         });

// //         // Create GarmentSizeCharts if provided
// //         if (sizeChartItems?.length) {
// //           for (const item of sizeChartItems) {
// //             await tx.garmentSizeChart.create({
// //               data: {
// //                 garmentId: garment.id,
// //                 size: item.size,
// //                 chest: Number(item.chest),
// //                 waist: Number(item.waist),
// //                 hips: Number(item.hips),
// //                 length: item.length? Number(item.length) : null,
// //                 inStock: item.inStock!== undefined? Boolean(item.inStock) : true
// //               }
// //             });
// //           }
// //         }

// //         // Return full product with everything
// //         return await tx.product.findUnique({
// //           where: { id: product.id },
// //           include: {
// //             brand: true,
// //             category: true,
// //             images: true,
// //             garments: { include: { sizeCharts: true } }
// //           }
// //         });
// //       });

// //       // Format for Frontend Compatibility
// //       const allSizeCharts = result.garments.flatMap(g => g.sizeCharts);
// //       res.status(201).json({
// //         message: "Product + Garment + SizeChart Created!",
// //         product: {
// //          ...result,
// //           garmentId: result.garments[0]?.id, // Frontend ko direct garmentId de diya
// //           sizeChart: { items: allSizeCharts }
// //         }
// //       });

// //     } catch (error) {
// //       console.error("CREATE PRODUCT ERROR:", error);
// //       res.status(500).json({ error: error.message });
// //     }
// //   });

// //   // GET ALL PRODUCTS - PRODUCTION READY FOR USER
// //   router.get('/products', async (req, res) => {
// //     try {
// //       const products = await prisma.product.findMany({
// //         include: {
// //           brand: true,
// //           category: true,
// //           images: true,
// //           garments: { include: { sizeCharts: true } }
// //         },
// //         orderBy: { createdAt: 'desc' }
// //       });

// //       const formatted = products.map(p => {
// //         const allSizeCharts = p.garments.flatMap(g => g.sizeCharts);
// //         return {
// //          ...p,
// //           garmentId: p.garments[0]?.id || null, // Frontend ke liye easy
// //           sizeChart: { items: allSizeCharts },
// //           computedIsOutOfStock: p.isOutOfStock || (allSizeCharts.length > 0 &&!allSizeCharts.some(sc => sc.inStock))
// //         };
// //       });

// //       res.json(formatted);
// //     } catch (e) { res.status(500).json({ error: e.message }); }
// //   });

// //   // GET SINGLE PRODUCT - FOR USER FRONTEND
// //   router.get('/products/:id', async (req, res) => {
// //     try {
// //       const product = await prisma.product.findUnique({
// //         where: { id: Number(req.params.id) },
// //         include: { brand: true, category: true, images: true, garments: { include: { sizeCharts: true } } }
// //       });
// //       if (!product) return res.status(404).json({ error: "Product not found" });

// //       const allSizeCharts = product.garments.flatMap(g => g.sizeCharts);

// //       res.json({
// //        ...product,
// //         garmentId: product.garments[0]?.id || null,
// //         sizeChart: { items: allSizeCharts },
// //         computedIsOutOfStock: product.isOutOfStock
// //       });
// //     } catch (e) { res.status(500).json({ error: e.message }); }
// //   });

// //   // UPDATE PRODUCT + GARMENT + SIZECHART
// //   router.put('/products/:id', verifyAdmin, async (req, res) => {
// //     try {
// //       const productId = Number(req.params.id);
// //       const { brandId, categoryId, name, description, price, images, sizeChartItems, stock, isOutOfStock } = req.body;

// //       const existing = await prisma.product.findUnique({ where: { id: productId }, include: { images: true, garments: true } });
// //       if (!existing) return res.status(404).json({ error: "Product not found" });

// //       await prisma.$transaction(async (tx) => {
// //         // Update Images if provided
// //         if (images && images.length > 0) {
// //           for (const img of existing.images) {
// //             if (img.publicId) { try { await cloudinary.uploader.destroy(img.publicId); } catch (e) {} }
// //           }
// //           await tx.productImage.deleteMany({ where: { productId } });
// //           let newImages = [];
// //           for (let i = 0; i < images.length; i++) {
// //             if (images[i].startsWith('http')) {
// //               newImages.push({ imageUrl: images[i], sortOrder: i, productId });
// //             } else {
// //               const uploaded = await cloudinary.uploader.upload(images[i], { folder: "syvora/products" });
// //               newImages.push({ imageUrl: uploaded.secure_url, publicId: uploaded.public_id, sortOrder: i, productId });
// //             }
// //           }
// //           if (newImages.length) await tx.productImage.createMany({ data: newImages });
// //         }

// //         // Update Product
// //         await tx.product.update({
// //           where: { id: productId },
// //           data: {
// //             brandId: brandId? Number(brandId) : undefined,
// //             categoryId: categoryId? Number(categoryId) : undefined,
// //             name: name || undefined,
// //             description: description || undefined,
// //             price: price? parseFloat(price) : undefined,
// //             stock: stock!== undefined? Number(stock) : undefined,
// //             isOutOfStock: isOutOfStock!== undefined? Boolean(isOutOfStock) : undefined,
// //           }
// //         });

// //         // Update SizeCharts if provided
// //         if (sizeChartItems) {
// //           const garmentId = existing.garments[0]?.id;
// //           if (garmentId) {
// //             await tx.garmentSizeChart.deleteMany({ where: { garmentId } });
// //             for (const item of sizeChartItems) {
// //               await tx.garmentSizeChart.create({
// //                 data: {
// //                   garmentId,
// //                   size: item.size,
// //                   chest: Number(item.chest),
// //                   waist: Number(item.waist),
// //                   hips: Number(item.hips),
// //                   length: item.length? Number(item.length) : null,
// //                   inStock: item.inStock!== undefined? Boolean(item.inStock) : true
// //                 }
// //               });
// //             }
// //           }
// //         }
// //       });

// //       const updated = await prisma.product.findUnique({
// //         where: { id: productId },
// //         include: { brand: true, category: true, images: true, garments: { include: { sizeCharts: true } } }
// //       });

// //       res.json({ message: "Product updated!", product: updated });
// //     } catch (error) { res.status(500).json({ error: error.message }); }
// //   });

// //   // PATCH STOCK
// //   router.patch('/products/:id/stock', verifyAdmin, async (req, res) => {
// //     try {
// //       const productId = Number(req.params.id);
// //       const { isOutOfStock, stock } = req.body;
// //       const product = await prisma.product.update({
// //         where: { id: productId },
// //         data: {
// //           isOutOfStock: isOutOfStock!== undefined? Boolean(isOutOfStock) : undefined,
// //           stock: stock!== undefined? Number(stock) : undefined
// //         }
// //       });

// //       if (isOutOfStock!== undefined) {
// //         await prisma.garmentSizeChart.updateMany({
// //           where: { garment: { productId: productId } },
// //           data: { inStock:!isOutOfStock }
// //         });
// //       }

// //       res.json({ message: isOutOfStock? "Out of Stock" : "In Stock", product });
// //     } catch (e) { res.status(500).json({ error: e.message }); }
// //   });

// //   // DELETE PRODUCT + GARMENT + IMAGES
// //   router.delete('/products/:id', verifyAdmin, async (req, res) => {
// //     try {
// //       const productId = Number(req.params.id);
// //       const existing = await prisma.product.findUnique({ where: { id: productId }, include: { images: true, garments: true } });
// //       if (!existing) return res.status(404).json({ error: "Product not found" });

// //       for (const img of existing.images) {
// //         if (img.publicId) { try { await cloudinary.uploader.destroy(img.publicId); } catch (e) {} }
// //       }

// //       await prisma.productImage.deleteMany({ where: { productId } });
// //       await prisma.garment.deleteMany({ where: { productId } });
// //       await prisma.product.delete({ where: { id: productId } });

// //       res.json({ message: "Product + Garment deleted!" });
// //     } catch (error) { res.status(500).json({ error: error.message }); }
// //   });

// //   return router;
// // };
















// const express = require('express');
// const router = express.Router();
// const cloudinary = require('../services/cloudinary');

// const VALID_GARMENT_CATEGORIES = ["Tshirt", "Top", "Shirt", "Kurta", "Dress", "Jeans", "Pant", "Trouser", "Shorts", "Skirt", "Kurti", "Suit"];

// function mapToGarmentCategory(categoryName) {
//   if (!categoryName) return "Tshirt";
//   if (VALID_GARMENT_CATEGORIES.includes(categoryName)) return categoryName;
//   const formatted = categoryName.charAt(0).toUpperCase() + categoryName.slice(1).toLowerCase();
//   if (VALID_GARMENT_CATEGORIES.includes(formatted)) return formatted;
//   const lower = categoryName.toLowerCase();
//   if (lower.includes("t-shirt") || lower.includes("tshirt")) return "Tshirt";
//   if (lower.includes("jean")) return "Jeans";
//   return "Tshirt";
// }

// module.exports = (prisma, verifyAdmin) => {

//   router.post('/brands', verifyAdmin, async (req, res) => {
//     try {
//       const { name, description, instagramUrl, websiteUrl } = req.body;
//       if (!name) return res.status(400).json({ error: "Brand name is required" });
//       const brand = await prisma.brand.create({ data: { name, description, instagramUrl, websiteUrl } });
//       res.status(201).json({ message: "Brand created!", brand });
//     } catch (e) { res.status(500).json({ error: e.message }); }
//   });

//   router.get('/brands', async (req, res) => {
//     const brands = await prisma.brand.findMany({ include: { _count: { select: { products: true } } } });
//     res.json(brands);
//   });

//   router.post('/categories', verifyAdmin, async (req, res) => {
//     try {
//       const { name } = req.body;
//       if (!name) return res.status(400).json({ error: "Category name is required" });
//       const category = await prisma.category.create({ data: { name } });
//       res.status(201).json({ message: "Category created!", category });
//     } catch (e) { res.status(500).json({ error: e.message }); }
//   });

//   router.get('/categories', async (req, res) => {
//     const categories = await prisma.category.findMany({ include: { _count: { select: { products: true } } } });
//     res.json(categories);
//   });

//   router.post('/products', verifyAdmin, async (req, res) => {
//     try {
//       const { brandId, categoryId, name, description, price, images, sizeChartItems, stock, isOutOfStock, color, fabric, fit, pattern, sleeve, occasion, material } = req.body;
//       if (!brandId || !categoryId || !name || !price) return res.status(400).json({ error: "brandId, categoryId, name, price required" });

//       const category = await prisma.category.findUnique({ where: { id: Number(categoryId) } });
//       if (!category) return res.status(404).json({ error: "Category not found" });
//       const garmentCategory = mapToGarmentCategory(category.name);

//       let imagesToCreate = [];
//       if (images?.length) {
//         for (let i = 0; i < images.length; i++) {
//           const uploaded = await cloudinary.uploader.upload(images[i], { folder: "syvora/products" });
//           imagesToCreate.push({ imageUrl: uploaded.secure_url, publicId: uploaded.public_id, sortOrder: i });
//         }
//       }
//       if (!imagesToCreate.length) return res.status(400).json({ error: "At least one image required" });

//       const result = await prisma.$transaction(async (tx) => {
//         const product = await tx.product.create({
//           data: {
//             brandId: Number(brandId),
//             categoryId: Number(categoryId),
//             name, description, price: parseFloat(price),
//             color, fabric, fit, pattern, sleeve, occasion, material,
//             stock: stock !== undefined ? Number(stock) : 10,
//             isOutOfStock: isOutOfStock !== undefined ? Boolean(isOutOfStock) : false,
//             images: { create: imagesToCreate }
//           },
//           include: { images: true }
//         });

//         await tx.garment.create({
//           data: {
//             brandId: Number(brandId),
//             name: name,
//             category: garmentCategory,
//             imageUrl: product.images[0].imageUrl,
//             cloudinaryPublicId: product.images[0].publicId || "syvora/products",
//             productId: product.id
//           }
//         });

//         if (sizeChartItems?.length) {
//           for (const item of sizeChartItems) {
//             await tx.productSizeChart.create({
//               data: {
//                 productId: product.id,
//                 size: item.size,
//                 chest: item.chest ? Number(item.chest) : null,
//                 waist: item.waist ? Number(item.waist) : null,
//                 hips: item.hips ? Number(item.hips) : null,
//                 length: item.length ? Number(item.length) : null,
//                 shoulder: item.shoulder ? Number(item.shoulder) : null,
//                 inStock: item.inStock !== undefined ? Boolean(item.inStock) : true
//               }
//             });
//           }
//         }

//         return await tx.product.findUnique({
//           where: { id: product.id },
//           include: { brand: true, category: true, images: true, sizeCharts: true, garments: true }
//         });
//       });

//       res.status(201).json({ message: "Product Created!", product: result });
//     } catch (error) {
//       console.error("CREATE PRODUCT ERROR:", error);
//       res.status(500).json({ error: error.message });
//     }
//   });

//   router.get('/products', async (req, res) => {
//     try {
//       const products = await prisma.product.findMany({
//         include: { brand: true, category: true, images: true, sizeCharts: true, garments: true },
//         orderBy: { createdAt: 'desc' }
//       });
//       res.json(products);
//     } catch (e) { res.status(500).json({ error: e.message }); }
//   });

//   router.get('/products/:id', async (req, res) => {
//     try {
//       const product = await prisma.product.findUnique({
//         where: { id: Number(req.params.id) },
//         include: { brand: true, category: true, images: true, sizeCharts: true, garments: true }
//       });
//       if (!product) return res.status(404).json({ error: "Product not found" });
//       res.json(product);
//     } catch (e) { res.status(500).json({ error: e.message }); }
//   });

//   router.put('/products/:id', verifyAdmin, async (req, res) => {
//     try {
//       const productId = Number(req.params.id);
//       const { brandId, categoryId, name, description, price, images, sizeChartItems, stock, isOutOfStock, color, fabric, fit, pattern, sleeve, occasion, material } = req.body;
//       const existing = await prisma.product.findUnique({ where: { id: productId }, include: { images: true } });
//       if (!existing) return res.status(404).json({ error: "Product not found" });

//       await prisma.$transaction(async (tx) => {
//         if (images && images.length > 0) {
//           for (const img of existing.images) {
//             if (img.publicId) { try { await cloudinary.uploader.destroy(img.publicId); } catch (e) {} }
//           }
//           await tx.productImage.deleteMany({ where: { productId } });
//           let newImages = [];
//           for (let i = 0; i < images.length; i++) {
//             if (images[i].startsWith('http')) {
//               newImages.push({ imageUrl: images[i], sortOrder: i, productId });
//             } else {
//               const uploaded = await cloudinary.uploader.upload(images[i], { folder: "syvora/products" });
//               newImages.push({ imageUrl: uploaded.secure_url, publicId: uploaded.public_id, sortOrder: i, productId });
//             }
//           }
//           if (newImages.length) await tx.productImage.createMany({ data: newImages });
//         }
//         await tx.product.update({
//           where: { id: productId },
//           data: { brandId: brandId ? Number(brandId) : undefined, categoryId: categoryId ? Number(categoryId) : undefined, name, description, price: price ? parseFloat(price) : undefined, color, fabric, fit, pattern, sleeve, occasion, material, stock: stock !== undefined ? Number(stock) : undefined, isOutOfStock: isOutOfStock !== undefined ? Boolean(isOutOfStock) : undefined }
//         });
//         if (sizeChartItems) {
//           await tx.productSizeChart.deleteMany({ where: { productId } });
//           for (const item of sizeChartItems) {
//             await tx.productSizeChart.create({ data: { productId, size: item.size, chest: item.chest ? Number(item.chest) : null, waist: item.waist ? Number(item.waist) : null, hips: item.hips ? Number(item.hips) : null, length: item.length ? Number(item.length) : null, shoulder: item.shoulder ? Number(item.shoulder) : null, inStock: item.inStock !== undefined ? Boolean(item.inStock) : true } });
//           }
//         }
//       });
//       const updated = await prisma.product.findUnique({ where: { id: productId }, include: { brand: true, category: true, images: true, sizeCharts: true } });
//       res.json({ message: "Product updated!", product: updated });
//     } catch (error) { res.status(500).json({ error: error.message }); }
//   });

//   router.delete('/products/:id', verifyAdmin, async (req, res) => {
//     try {
//       const productId = Number(req.params.id);
//       const existing = await prisma.product.findUnique({ where: { id: productId }, include: { images: true } });
//       if (!existing) return res.status(404).json({ error: "Product not found" });
//       for (const img of existing.images) { if (img.publicId) { try { await cloudinary.uploader.destroy(img.publicId); } catch (e) {} } }
//       await prisma.productImage.deleteMany({ where: { productId } });
//       await prisma.productSizeChart.deleteMany({ where: { productId } });
//       await prisma.garment.deleteMany({ where: { productId } });
//       await prisma.product.delete({ where: { id: productId } });
//       res.json({ message: "Product deleted!" });
//     } catch (error) { res.status(500).json({ error: error.message }); }
//   });

//   return router;
// };





const express = require('express');
const router = express.Router();
const cloudinary = require('../services/cloudinary');

const VALID_GARMENT_CATEGORIES = ["Tshirt", "Top", "Shirt", "Kurta", "Dress", "Jeans", "Pant", "Trouser", "Shorts", "Skirt", "Kurti", "Suit"];

function mapToGarmentCategory(categoryName) {
  if (!categoryName) return "Tshirt";
  if (VALID_GARMENT_CATEGORIES.includes(categoryName)) return categoryName;
  const formatted = categoryName.charAt(0).toUpperCase() + categoryName.slice(1).toLowerCase();
  if (VALID_GARMENT_CATEGORIES.includes(formatted)) return formatted;
  const lower = categoryName.toLowerCase();
  if (lower.includes("t-shirt") || lower.includes("tshirt")) return "Tshirt";
  if (lower.includes("jean") || lower.includes("baggy") || lower.includes("cargo")) return "Jeans";
  if (lower.includes("anarkali") || lower.includes("kurti")) return "Kurti";
  return "Tshirt";
}

function slugify(text) {
  return text.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') + '-' + Date.now().toString().slice(-4);
}

module.exports = (prisma, verifyAdmin) => {

  router.post('/brands', verifyAdmin, async (req, res) => {
    try {
      const { name, description, instagramUrl, websiteUrl } = req.body;
      if (!name) return res.status(400).json({ error: "Brand name is required" });
      const brand = await prisma.brand.create({ data: { name, description, instagramUrl, websiteUrl } });
      res.status(201).json({ message: "Brand created!", brand });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.get('/brands', async (req, res) => {
    const brands = await prisma.brand.findMany({ include: { _count: { select: { products: true } } } });
    res.json(brands);
  });

  // CATEGORY TREE
  router.post('/categories', verifyAdmin, async (req, res) => {
    try {
      const { name, parentId, description } = req.body;
      if (!name) return res.status(400).json({ error: "Category name is required" });
      let level = 0;
      if (parentId) {
        const parent = await prisma.category.findUnique({ where: { id: Number(parentId) } });
        if (!parent) return res.status(404).json({ error: "Parent not found" });
        level = parent.level + 1;
      }
      const category = await prisma.category.create({
        data: { name, slug: slugify(name), parentId: parentId ? Number(parentId) : null, level, description }
      });
      res.status(201).json({ message: "Category created!", category });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.get('/categories', async (req, res) => {
    const { search, root, parentId } = req.query;
    const where = {};
    if (search) where.name = { contains: search, mode: 'insensitive' };
    if (root === 'true') where.parentId = null;
    if (parentId) where.parentId = Number(parentId);
    const categories = await prisma.category.findMany({ where, include: { _count: { select: { products: true, children: true } }, parent: true, children: true }, orderBy: { level: 'asc' } });
    res.json(categories);
  });

  router.get('/categories/tree', async (req, res) => {
    const all = await prisma.category.findMany({ orderBy: { level: 'asc' } });
    const map = {};
    all.forEach(c => map[c.id] = { ...c, children: [] });
    const roots = [];
    all.forEach(c => {
      if (c.parentId && map[c.parentId]) map[c.parentId].children.push(map[c.id]);
      else if (!c.parentId) roots.push(map[c.id]);
    });
    res.json(roots);
  });

  router.post('/products', verifyAdmin, async (req, res) => {
    try {
      const { brandId, retailerId, categoryId, name, description, price, images, sizeChartItems, stock, isOutOfStock, color, fabric, fit, pattern, sleeve, occasion, material, attributes, tags } = req.body;
      if ((!brandId && !retailerId) || !categoryId || !name || !price) {
        return res.status(400).json({ error: "brandId OR retailerId + categoryId, name, price required" });
      }
      const category = await prisma.category.findUnique({ where: { id: Number(categoryId) } });
      if (!category) return res.status(404).json({ error: "Category not found" });
      const garmentCategory = mapToGarmentCategory(category.name);

      let imagesToCreate = [];
      if (images?.length) {
        for (let i = 0; i < images.length; i++) {
          const uploaded = await cloudinary.uploader.upload(images[i], { folder: "syvora/products" });
          imagesToCreate.push({ imageUrl: uploaded.secure_url, publicId: uploaded.public_id, sortOrder: i });
        }
      }
      if (!imagesToCreate.length) return res.status(400).json({ error: "At least one image required" });

      const result = await prisma.$transaction(async (tx) => {
        const product = await tx.product.create({
          data: {
            brandId: brandId ? Number(brandId) : null,
            retailerId: retailerId ? Number(retailerId) : null,
            sellerType: retailerId ? 'RETAILER' : 'BRAND',
            categoryId: Number(categoryId),
            name, description, price: parseFloat(price),
            color, fabric, fit, pattern, sleeve, occasion, material,
            attributes: attributes || {},
            tags: tags || [],
            stock: stock !== undefined ? Number(stock) : 10,
            isOutOfStock: isOutOfStock !== undefined ? Boolean(isOutOfStock) : false,
            images: { create: imagesToCreate }
          },
          include: { images: true }
        });

        await tx.garment.create({
          data: {
            brandId: brandId ? Number(brandId) : null,
            retailerId: retailerId ? Number(retailerId) : null,
            name: name,
            category: garmentCategory,
            imageUrl: product.images[0].imageUrl,
            cloudinaryPublicId: product.images[0].publicId || "syvora/products",
            productId: product.id
          }
        });

        if (sizeChartItems?.length) {
          for (const item of sizeChartItems) {
            await tx.productSizeChart.create({
              data: {
                productId: product.id,
                size: item.size,
                chest: item.chest ? Number(item.chest) : null,
                waist: item.waist ? Number(item.waist) : null,
                hips: item.hips ? Number(item.hips) : null,
                length: item.length ? Number(item.length) : null,
                shoulder: item.shoulder ? Number(item.shoulder) : null,
                inStock: item.inStock !== undefined ? Boolean(item.inStock) : true
              }
            });
          }
        }
        return await tx.product.findUnique({ where: { id: product.id }, include: { brand: true, retailer: true, category: true, images: true, sizeCharts: true, garments: true } });
      });
      res.status(201).json({ message: "Product Created!", product: result });
    } catch (error) {
      console.error("CREATE PRODUCT ERROR:", error);
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/products', async (req, res) => {
    try {
      const { categoryId, includeChildren, retailerId, brandId, search } = req.query;
      let categoryIds = [];
      if (categoryId) {
        categoryIds.push(Number(categoryId));
        if (includeChildren === 'true') {
          const getChildren = async (pid) => {
            const childs = await prisma.category.findMany({ where: { parentId: pid } });
            for (const c of childs) {
              categoryIds.push(c.id);
              await getChildren(c.id);
            }
          };
          await getChildren(Number(categoryId));
        }
      }
      const where = {};
      if (categoryIds.length) where.categoryId = { in: categoryIds };
      if (retailerId) where.retailerId = Number(retailerId);
      if (brandId) where.brandId = Number(brandId);
      if (search) where.name = { contains: search, mode: 'insensitive' };
      const products = await prisma.product.findMany({ where, include: { brand: true, retailer: true, category: true, images: true, sizeCharts: true, garments: true }, orderBy: { createdAt: 'desc' } });
      res.json(products);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.get('/products/:id', async (req, res) => {
    try {
      const product = await prisma.product.findUnique({ where: { id: Number(req.params.id) }, include: { brand: true, retailer: { include: { outlets: true } }, category: true, images: true, sizeCharts: true, garments: true } });
      if (!product) return res.status(404).json({ error: "Product not found" });
      res.json(product);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.delete('/products/:id', verifyAdmin, async (req, res) => {
    try {
      const productId = Number(req.params.id);
      const existing = await prisma.product.findUnique({ where: { id: productId }, include: { images: true } });
      if (!existing) return res.status(404).json({ error: "Product not found" });
      for (const img of existing.images) { if (img.publicId) { try { await cloudinary.uploader.destroy(img.publicId); } catch (e) {} } }
      await prisma.productImage.deleteMany({ where: { productId } });
      await prisma.productSizeChart.deleteMany({ where: { productId } });
      await prisma.garment.deleteMany({ where: { productId } });
      await prisma.product.delete({ where: { id: productId } });
      res.json({ message: "Product deleted!" });
    } catch (error) { res.status(500).json({ error: error.message }); }
  });

  return router;
};