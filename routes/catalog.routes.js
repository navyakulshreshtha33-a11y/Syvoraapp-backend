// const express = require('express');
// const cloudinary = require('../services/cloudinary');
// const { z } = require('zod');

// function slugify(text) {
//   return text.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') + '-' + Date.now().toString().slice(-4);
// }

// module.exports = (prisma, verifyAdmin, transporter) => {
//   const router = express.Router();

//   // --- ZOD SCHEMAS ---
//   const brandSchema = z.object({
//     name: z.string().min(2).max(100),
//     description: z.string().max(500).optional(),
//     instagramUrl: z.string().url().optional().or(z.literal('')),
//     websiteUrl: z.string().url().optional().or(z.literal(''))
//   });

//   const categorySchema = z.object({
//     name: z.string().min(2).max(50),
//     type: z.enum(['TOP_WEAR','BOTTOM_WEAR','DRESS','SAREE','LEHENGA','KURTI']).optional().default('TOP_WEAR'),
//     brandId: z.number().int().positive().optional(),
//     retailerId: z.number().int().positive().optional(),
//     description: z.string().max(500).optional()
//   }).refine(data => data.brandId || data.retailerId, { message: "brandId OR retailerId required" });

//   const productSchema = z.object({
//     brandId: z.number().int().positive().optional(),
//     retailerId: z.number().int().positive().optional(),
//     categoryId: z.number().int().positive(),
//     name: z.string().min(2).max(100),
//     description: z.string().max(2000).optional(),
//     price: z.number().positive().max(100000),
//     stock: z.number().int().min(0).max(10000).optional().default(10),
//     isOutOfStock: z.boolean().optional(),
//     color: z.string().max(30).optional(),
//     fabric: z.string().max(30).optional(),
//     fit: z.string().max(30).optional(),
//     pattern: z.string().max(30).optional(),
//     sleeve: z.string().max(30).optional(),
//     occasion: z.string().max(30).optional(),
//     material: z.string().max(30).optional(),
//     vibeTag: z.string().optional(),
//     images: z.array(z.string()).max(10).optional(), // 🚀 Max images updated from 5 to 10
//     sizeChartItems: z.array(z.object({
//       size: z.string().min(1).max(10),
//       chest: z.any().optional().nullable(),
//       shoulder: z.any().optional().nullable(),
//       length: z.any().optional().nullable(),
//       waist: z.any().optional().nullable(),
//       hips: z.any().optional().nullable(),
//       stock: z.any().optional().nullable()
//     })).optional()
//   });

//   // BRANDS ROUTES
//   router.post('/brands', verifyAdmin, async (req, res) => {
//     try {
//       const parsed = brandSchema.safeParse(req.body);
//       if(!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
//       const { name, description, instagramUrl, websiteUrl } = parsed.data;
//       const brand = await prisma.brand.create({ data: { name, description, instagramUrl: instagramUrl || null, websiteUrl: websiteUrl || null } });
//       res.status(201).json({ message: "Brand created!", brand });
//     } catch (e) { res.status(500).json({ error: e.message }); }
//   });

//   router.get('/brands', async (req, res) => {
//     const brands = await prisma.brand.findMany({ include: { _count: { select: { products: true } } } });
//     res.json(brands);
//   });

//   // CATEGORIES ROUTES
//   router.post('/categories', verifyAdmin, async (req, res) => {
//     try {
//       const parsed = categorySchema.safeParse({
//         name: req.body.name,
//         type: req.body.type,
//         brandId: req.body.brandId ? Number(req.body.brandId) : undefined,
//         retailerId: req.body.retailerId ? Number(req.body.retailerId) : undefined,
//         description: req.body.description
//       });
//       if(!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
      
//       const { name, type, brandId, retailerId, description } = parsed.data;
//       const category = await prisma.category.create({
//         data: { name, slug: slugify(name), type, brandId: brandId || null, retailerId: retailerId || null, description }
//       });
//       res.status(201).json({ message: "Category created!", category });
//     } catch (e) { res.status(500).json({ error: e.message }); }
//   });

//   router.get('/categories', async (req, res) => {
//     try {
//       const { search, brandId, retailerId } = req.query;
//       const where = {};
//       if (search) {
//         const safeSearch = String(search).trim().slice(0,50);
//         if(safeSearch) where.name = { contains: safeSearch, mode: 'insensitive' };
//       }
//       if (brandId && !isNaN(Number(brandId))) where.brandId = Number(brandId);
//       if (retailerId && !isNaN(Number(retailerId))) where.retailerId = Number(retailerId);
      
//       const categories = await prisma.category.findMany({ 
//         where, 
//         include: { _count: { select: { products: true } }, brand: true, retailer: true }, 
//         orderBy: { name: 'asc' } 
//       });
//       res.json(categories);
//     } catch(e){ res.status(500).json({ error: e.message }); }
//   });

//   // PRODUCTS - CREATE
//   router.post('/products', verifyAdmin, async (req, res) => {
//     try {
//       const parsed = productSchema.safeParse({
//         brandId: req.body.brandId ? Number(req.body.brandId) : undefined,
//         retailerId: req.body.retailerId ? Number(req.body.retailerId) : undefined,
//         categoryId: Number(req.body.categoryId),
//         name: req.body.name,
//         description: req.body.description,
//         price: Number(req.body.price),
//         stock: req.body.stock !== undefined ? Number(req.body.stock) : undefined,
//         isOutOfStock: req.body.isOutOfStock,
//         color: req.body.color,
//         fabric: req.body.fabric,
//         fit: req.body.fit,
//         pattern: req.body.pattern,
//         sleeve: req.body.sleeve,
//         occasion: req.body.occasion,
//         material: req.body.material,
//         vibeTag: req.body.vibeTag,
//         images: req.body.images,
//         sizeChartItems: req.body.sizeChartItems
//       });
//       if(!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

//       const { brandId, retailerId, categoryId, name, description, price, images, sizeChartItems, stock, isOutOfStock, color, fabric, fit, pattern, sleeve, occasion, material, vibeTag } = parsed.data;
      
//       if (!brandId && !retailerId) return res.status(400).json({ error: "brandId OR retailerId required" });
      
//       const category = await prisma.category.findUnique({ where: { id: Number(categoryId) } });
//       if (!category) return res.status(404).json({ error: "Category not found" });

//       let imagesToCreate = [];
//       if (images?.length) {
//         for (let i = 0; i < images.length; i++) {
//           const uploaded = await cloudinary.uploader.upload(images[i], {
//             folder: "syvora/products",
//             width: 1000,
//             height: 1000,
//             crop: "fill",
//             fetch_format: "auto",
//             quality: "auto"
//           });
//           imagesToCreate.push({ imageUrl: uploaded.secure_url, publicId: uploaded.public_id, sortOrder: i });
//         }
//       }
//       if (!imagesToCreate.length) return res.status(400).json({ error: "At least one image required for product creation" });

//       const result = await prisma.$transaction(async (tx) => {
//         const product = await tx.product.create({
//           data: {
//             brandId: brandId ? Number(brandId) : null,
//             retailerId: retailerId ? Number(retailerId) : null,
//             sellerType: retailerId ? 'RETAILER' : 'BRAND',
//             categoryId: Number(categoryId),
//             name, description, price,
//             color, fabric, fit, pattern, sleeve, occasion, material,
//             vibeTag: vibeTag || 'Casual',
//             stock: stock !== undefined ? Number(stock) : 10,
//             isOutOfStock: isOutOfStock !== undefined ? Boolean(isOutOfStock) : false,
//             images: { create: imagesToCreate }
//           },
//           include: { images: true }
//         });

//         if (sizeChartItems?.length) {
//           for (const item of sizeChartItems) {
//             if (!item.size || !item.size.trim()) continue;
//             await tx.productSizeChart.create({
//               data: {
//                 productId: product.id,
//                 size: item.size.trim(),
//                 chest: item.chest !== undefined && item.chest !== '' && !isNaN(Number(item.chest)) ? Number(item.chest) : null,
//                 shoulder: item.shoulder !== undefined && item.shoulder !== '' && !isNaN(Number(item.shoulder)) ? Number(item.shoulder) : null,
//                 length: item.length !== undefined && item.length !== '' && !isNaN(Number(item.length)) ? Number(item.length) : null,
//                 waist: item.waist !== undefined && item.waist !== '' && !isNaN(Number(item.waist)) ? Number(item.waist) : null,
//                 hips: item.hips !== undefined && item.hips !== '' && !isNaN(Number(item.hips)) ? Number(item.hips) : null,
//                 stock: item.stock !== undefined && item.stock !== '' && !isNaN(Number(item.stock)) ? Number(item.stock) : 10,
//                 inStock: item.stock !== undefined && item.stock !== '' ? Number(item.stock) > 0 : true
//               }
//             });
//           }
//         }
        
//         return await tx.product.findUnique({ 
//           where: { id: product.id }, 
//           include: { brand: true, retailer: true, category: true, images: true, sizeCharts: true } 
//         });
//       });
//       res.status(201).json({ message: "Product Created!", product: result });
//     } catch (error) {
//       console.error("CREATE PRODUCT ERROR:", error);
//       res.status(500).json({ error: error.message });
//     }
//   });

//   // PRODUCTS - EDIT / UPDATE ROUTE
//   router.put('/products/:id', verifyAdmin, async (req, res) => {
//     try {
//       const productId = Number(req.params.id);
//       if (isNaN(productId)) return res.status(400).json({ error: "Invalid Product ID" });

//       const existingProduct = await prisma.product.findUnique({
//         where: { id: productId },
//         include: { images: true }
//       });
//       if (!existingProduct) return res.status(404).json({ error: "Product not found" });

//       const incomingImages = req.body.images || req.body.newImages;

//       const parsed = productSchema.safeParse({
//         brandId: req.body.brandId ? Number(req.body.brandId) : undefined,
//         retailerId: req.body.retailerId ? Number(req.body.retailerId) : undefined,
//         categoryId: req.body.categoryId ? Number(req.body.categoryId) : existingProduct.categoryId,
//         name: req.body.name,
//         description: req.body.description,
//         price: req.body.price ? Number(req.body.price) : undefined,
//         stock: req.body.stock !== undefined ? Number(req.body.stock) : undefined,
//         isOutOfStock: req.body.isOutOfStock,
//         color: req.body.color,
//         fabric: req.body.fabric,
//         fit: req.body.fit,
//         pattern: req.body.pattern,
//         sleeve: req.body.sleeve,
//         occasion: req.body.occasion,
//         material: req.body.material,
//         vibeTag: req.body.vibeTag,
//         images: incomingImages,
//         sizeChartItems: req.body.sizeChartItems
//       });

//       if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

//       const { brandId, retailerId, categoryId, name, description, price, images, sizeChartItems, stock, isOutOfStock, color, fabric, fit, pattern, sleeve, occasion, material, vibeTag } = parsed.data;

//       const wasOutOfStock = existingProduct.isOutOfStock || existingProduct.stock <= 0;

//       const result = await prisma.$transaction(async (tx) => {
//         let imageUpdateData = {};
//         if (images && images.length > 0) {
//           for (const img of existingProduct.images) {
//             if (img.publicId) {
//               try { await cloudinary.uploader.destroy(img.publicId); } catch (err) {}
//             }
//           }
//           await tx.productImage.deleteMany({ where: { productId } });

//           let newImagesToCreate = [];
//           for (let i = 0; i < images.length; i++) {
//             const uploaded = await cloudinary.uploader.upload(images[i], {
//               folder: "syvora/products",
//               width: 1000,
//               height: 1000,
//               crop: "fill",
//               fetch_format: "auto",
//               quality: "auto"
//             });
//             newImagesToCreate.push({ imageUrl: uploaded.secure_url, publicId: uploaded.public_id, sortOrder: i });
//           }
//           imageUpdateData = { images: { create: newImagesToCreate } };
//         }

//         if (sizeChartItems !== undefined) {
//           await tx.productSizeChart.deleteMany({ where: { productId } });
//           if (sizeChartItems.length > 0) {
//             for (const item of sizeChartItems) {
//               if (!item.size || !item.size.trim()) continue;
//               await tx.productSizeChart.create({
//                 data: {
//                   productId,
//                   size: item.size.trim(),
//                   chest: item.chest !== undefined && item.chest !== '' && !isNaN(Number(item.chest)) ? Number(item.chest) : null,
//                   shoulder: item.shoulder !== undefined && item.shoulder !== '' && !isNaN(Number(item.shoulder)) ? Number(item.shoulder) : null,
//                   length: item.length !== undefined && item.length !== '' && !isNaN(Number(item.length)) ? Number(item.length) : null,
//                   waist: item.waist !== undefined && item.waist !== '' && !isNaN(Number(item.waist)) ? Number(item.waist) : null,
//                   hips: item.hips !== undefined && item.hips !== '' && !isNaN(Number(item.hips)) ? Number(item.hips) : null,
//                   stock: item.stock !== undefined && item.stock !== '' && !isNaN(Number(item.stock)) ? Number(item.stock) : 10,
//                   inStock: item.stock !== undefined && item.stock !== '' ? Number(item.stock) > 0 : true
//                 }
//               });
//             }
//           }
//         }

//         await tx.product.update({
//           where: { id: productId },
//           data: {
//             brandId: brandId !== undefined ? (brandId ? Number(brandId) : null) : undefined,
//             retailerId: retailerId !== undefined ? (retailerId ? Number(retailerId) : null) : undefined,
//             sellerType: retailerId ? 'RETAILER' : (brandId ? 'BRAND' : undefined),
//             categoryId: categoryId ? Number(categoryId) : undefined,
//             name, description, price,
//             color, fabric, fit, pattern, sleeve, occasion, material,
//             vibeTag: vibeTag !== undefined ? vibeTag : undefined,
//             stock: stock !== undefined ? Number(stock) : undefined,
//             isOutOfStock: isOutOfStock !== undefined ? Boolean(isOutOfStock) : undefined,
//             ...imageUpdateData
//           }
//         });

//         return await tx.product.findUnique({
//           where: { id: productId },
//           include: { brand: true, retailer: true, category: true, images: true, sizeCharts: true }
//         });
//       });

//       // BACK-IN-STOCK NOTIFICATION TRIGGER
//       const isNowInStock = !result.isOutOfStock && result.stock > 0;
//       if (wasOutOfStock && isNowInStock) {
//         try {
//           const pendingAlerts = await prisma.stockNotification.findMany({
//             where: { productId, notified: false }
//           });

//           if (pendingAlerts.length > 0) {
//             for (const alert of pendingAlerts) {
//               try {
//                 if (alert.userId && prisma.notification) {
//                   await prisma.notification.create({
//                     data: {
//                       userId: alert.userId,
//                       productId: result.id,
//                       title: "Back in Stock! 🎉",
//                       message: `${result.name} is back in stock. Grab it before it sells out!`
//                     }
//                   });
//                 }
//               } catch (innerErr) {}

//               if (transporter && process.env.EMAIL_USER && alert.email) {
//                 try {
//                   await transporter.sendMail({
//                     from: process.env.EMAIL_USER,
//                     to: alert.email,
//                     subject: `✨ Good News! ${result.name} is Back in Stock on Syvora!`,
//                     html: `
//                       <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
//                         <h2 style="color: #4A3024;">🎉 Item Wapas Stock Me Aa Gaya Hai!</h2>
//                         <p>Aapne jis product ke liye notify karne ko kaha tha, woh ab available hai:</p>
//                         <p><b>Product:</b> ${result.name}</p>
//                         <p><b>Price:</b> ₹${result.price}</p>
//                         <p>Jaldi karein, stock limited ho sakta hai!</p>
//                       </div>
//                     `
//                   });
//                 } catch (mailErr) {
//                   console.error(`Failed to send stock alert to ${alert.email}:`, mailErr);
//                 }
//               }

//               await prisma.stockNotification.update({
//                 where: { id: alert.id },
//                 data: { notified: true }
//               });
//             }
//           }
//         } catch (notifMainErr) {
//           console.error("Stock notification trigger error:", notifMainErr);
//         }
//       }

//       res.json({ message: "Product updated successfully!", product: result });
//     } catch (error) {
//       console.error("UPDATE PRODUCT ERROR:", error);
//       res.status(500).json({ error: error.message });
//     }
//   });

//   // NOTIFY ME - STOCK ALERT REGISTRATION ROUTE
//   router.post('/products/:id/notify', async (req, res) => {
//     try {
//       const productId = Number(req.params.id);
//       const { email, userId } = req.body;

//       if (!email || !email.includes('@')) {
//         return res.status(400).json({ error: "Valid email is required" });
//       }

//       const product = await prisma.product.findUnique({ where: { id: productId } });
//       if (!product) return res.status(404).json({ error: "Product not found" });

//       await prisma.stockNotification.upsert({
//         where: { email_productId: { email, productId } },
//         update: { notified: false },
//         create: { email, productId, userId: userId ? Number(userId) : null }
//       });

//       res.json({ message: "We will notify you when this item is back in stock!" });
//     } catch (error) {
//       res.status(500).json({ error: error.message });
//     }
//   });

//   // 🚀 GET UNREAD NOTIFICATIONS FOR USER (Standard Path)
//   router.get('/notifications/:userId', async (req, res) => {
//     try {
//       const userId = Number(req.params.userId);
//       if (isNaN(userId)) return res.status(400).json({ error: "Invalid User ID" });

//       const notifications = await prisma.notification.findMany({
//         where: { userId: userId, isRead: false },
//         include: { product: { include: { images: true } } },
//         orderBy: { createdAt: 'desc' }
//       });

//       res.json({ success: true, notifications });
//     } catch (error) {
//       res.status(500).json({ error: error.message });
//     }
//   });

//   // 🚀 GET UNREAD NOTIFICATIONS FOR USER (Frontend Matching Route)
//   router.get('/notifications/user/:userId', async (req, res) => {
//     try {
//       const userId = Number(req.params.userId);
//       if (isNaN(userId)) return res.status(400).json({ error: "Invalid User ID" });

//       const notifications = await prisma.notification.findMany({
//         where: { userId: userId, isRead: false },
//         include: { product: { include: { images: true } } },
//         orderBy: { createdAt: 'desc' }
//       });

//       res.json({ success: true, notifications });
//     } catch (error) {
//       res.status(500).json({ error: error.message });
//     }
//   });

//   // 🚀 MARK NOTIFICATION AS READ
//   router.patch('/notifications/:id/read', async (req, res) => {
//     try {
//       const notifId = Number(req.params.id);
//       if (isNaN(notifId)) return res.status(400).json({ error: "Invalid Notification ID" });

//       await prisma.notification.update({
//         where: { id: notifId },
//         data: { isRead: true }
//       });
//       res.json({ success: true, message: "Marked as read" });
//     } catch (error) {
//       res.status(500).json({ error: error.message });
//     }
//   });

//   // GET PRODUCTS (With VibeTag Query Filter Support)
//   router.get('/products', async (req, res) => {
//     try {
//       const { categoryId, retailerId, brandId, vibeTag, search } = req.query;
//       const where = {};
//       if (categoryId && !isNaN(Number(categoryId))) where.categoryId = Number(categoryId);
//       if (retailerId && !isNaN(Number(retailerId))) where.retailerId = Number(retailerId);
//       if (brandId && !isNaN(Number(brandId))) where.brandId = Number(brandId);
//       if (vibeTag) where.vibeTag = String(vibeTag);
//       if (search) {
//         const safeSearch = String(search).trim().slice(0,50);
//         if(safeSearch) where.name = { contains: safeSearch, mode: 'insensitive' };
//       }
      
//       const products = await prisma.product.findMany({ 
//         where, 
//         include: { brand: true, retailer: true, category: true, images: true, sizeCharts: true }, 
//         orderBy: { createdAt: 'desc' } 
//       });
//       res.json(products);
//     } catch (e) { res.status(500).json({ error: e.message }); }
//   });

//   router.get('/products/:id', async (req, res) => {
//     try {
//       const id = Number(req.params.id);
//       if(isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
//       const product = await prisma.product.findUnique({ 
//         where: { id }, 
//         include: { brand: true, retailer: true, category: true, images: true, sizeCharts: true } 
//       });
//       if (!product) return res.status(404).json({ error: "Product not found" });
//       res.json(product);
//     } catch (e) { res.status(500).json({ error: e.page || e.message }); }
//   });

//   router.delete('/products/:id', verifyAdmin, async (req, res) => {
//     try {
//       const productId = Number(req.params.id);
//       if(isNaN(productId)) return res.status(400).json({ error: "Invalid ID" });
//       const existing = await prisma.product.findUnique({ where: { id: productId }, include: { images: true } });
//       if (!existing) return res.status(404).json({ error: "Product not found" });
//       for (const img of existing.images) { if (img.publicId) { try { await cloudinary.uploader.destroy(img.publicId); } catch (e) {} } }
//       await prisma.productImage.deleteMany({ where: { productId } });
//       await prisma.productSizeChart.deleteMany({ where: { productId } });
//       await prisma.stockNotification.deleteMany({ where: { productId } });
//       await prisma.product.delete({ where: { id: productId } });
//       res.json({ message: "Product deleted!" });
//     } catch (error) { res.status(500).json({ error: error.message }); }
//   });

//   return router;
// };





















const express = require('express');
const jwt = require('jsonwebtoken');
const cloudinary = require('../services/cloudinary');
const { z } = require('zod');

const MAX_PRODUCT_IMAGES = 10;

function slugify(text) {
  return (
    String(text || '')
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '') +
    '-' +
    Date.now().toString().slice(-4)
  );
}

function parsePositiveIntId(raw) {
  const num = Number(raw);
  return Number.isInteger(num) && num > 0 ? num : null;
}

function isAllowedImageInput(val) {
  if (typeof val !== 'string') return false;
  const trimmed = val.trim();
  if (!trimmed) return false;

  if (trimmed.startsWith('data:image/')) {
    return /^data:image\/(jpeg|jpg|png|webp);base64,/i.test(trimmed);
  }

  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

function getTokenUser(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Unauthorized');
  }
  const token = authHeader.split(' ')[1];
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  const userId = Number(decoded.id || decoded.userId);
  if (!Number.isInteger(userId) || userId <= 0) {
    throw new Error('Unauthorized');
  }
  return { userId, role: decoded.role };
}

function isTokenError(err) {
  return (
    err?.message === 'Unauthorized' ||
    err?.name === 'JsonWebTokenError' ||
    err?.name === 'TokenExpiredError'
  );
}

module.exports = (prisma, verifyAdmin, transporter) => {
  const router = express.Router();

  // --- ZOD SCHEMAS ---
  const brandSchema = z.object({
    name: z.string().trim().min(2).max(100),
    description: z.string().trim().max(500).optional(),
    instagramUrl: z.string().trim().url().optional().or(z.literal('')),
    websiteUrl: z.string().trim().url().optional().or(z.literal('')),
  });

  const categorySchema = z
    .object({
      name: z.string().trim().min(2).max(50),
      type: z
        .enum(['TOP_WEAR', 'BOTTOM_WEAR', 'DRESS', 'SAREE', 'LEHENGA', 'KURTI'])
        .optional()
        .default('TOP_WEAR'),
      brandId: z.number().int().positive().optional(),
      retailerId: z.number().int().positive().optional(),
      description: z.string().trim().max(500).optional(),
    })
    .refine((data) => Boolean(data.brandId || data.retailerId), {
      message: 'brandId OR retailerId required',
    });

  const productSchema = z.object({
    brandId: z.number().int().positive().optional(),
    retailerId: z.number().int().positive().optional(),
    categoryId: z.number().int().positive(),
    name: z.string().trim().min(2).max(100),
    description: z.string().trim().max(2000).optional(),
    price: z.number().positive().max(100000),
    stock: z.number().int().min(0).max(10000).optional().default(10),
    isOutOfStock: z.boolean().optional(),
    color: z.string().trim().max(30).optional(),
    fabric: z.string().trim().max(30).optional(),
    fit: z.string().trim().max(30).optional(),
    pattern: z.string().trim().max(30).optional(),
    sleeve: z.string().trim().max(30).optional(),
    occasion: z.string().trim().max(30).optional(),
    material: z.string().trim().max(30).optional(),
    vibeTag: z.string().trim().max(40).optional(),
    images: z.array(z.string()).max(MAX_PRODUCT_IMAGES).optional(),
    sizeChartItems: z
      .array(
        z.object({
          size: z.string().trim().min(1).max(10),
          chest: z.any().optional().nullable(),
          shoulder: z.any().optional().nullable(),
          length: z.any().optional().nullable(),
          waist: z.any().optional().nullable(),
          hips: z.any().optional().nullable(),
          stock: z.any().optional().nullable(),
        })
      )
      .optional(),
  });

  // BRANDS ROUTES
  router.post('/brands', verifyAdmin, async (req, res) => {
    try {
      const parsed = brandSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
      const { name, description, instagramUrl, websiteUrl } = parsed.data;
      const brand = await prisma.brand.create({
        data: {
          name,
          description: description || null,
          instagramUrl: instagramUrl || null,
          websiteUrl: websiteUrl || null,
        },
      });
      res.status(201).json({ message: 'Brand created!', brand });
    } catch (e) {
      if (isTokenError(e)) return res.status(401).json({ error: 'Unauthorized' });
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  router.get('/brands', async (req, res) => {
    try {
      const brands = await prisma.brand.findMany({
        include: { _count: { select: { products: true } } },
      });
      res.json(brands);
    } catch (e) {
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  // CATEGORIES ROUTES
  router.post('/categories', verifyAdmin, async (req, res) => {
    try {
      const parsed = categorySchema.safeParse({
        name: req.body.name,
        type: req.body.type,
        brandId: req.body.brandId ? Number(req.body.brandId) : undefined,
        retailerId: req.body.retailerId ? Number(req.body.retailerId) : undefined,
        description: req.body.description,
      });
      if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

      const { name, type, brandId, retailerId, description } = parsed.data;
      const category = await prisma.category.create({
        data: {
          name,
          slug: slugify(name),
          type,
          brandId: brandId || null,
          retailerId: retailerId || null,
          description: description || null,
        },
      });
      res.status(201).json({ message: 'Category created!', category });
    } catch (e) {
      if (isTokenError(e)) return res.status(401).json({ error: 'Unauthorized' });
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  router.get('/categories', async (req, res) => {
    try {
      const { search, brandId, retailerId } = req.query;
      const where = {};
      if (search) {
        const safeSearch = String(search).trim().slice(0, 50);
        if (safeSearch) where.name = { contains: safeSearch, mode: 'insensitive' };
      }
      if (brandId && parsePositiveIntId(brandId)) where.brandId = Number(brandId);
      if (retailerId && parsePositiveIntId(retailerId)) where.retailerId = Number(retailerId);

      const categories = await prisma.category.findMany({
        where,
        include: { _count: { select: { products: true } }, brand: true, retailer: true },
        orderBy: { name: 'asc' },
      });
      res.json(categories);
    } catch (e) {
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  // PRODUCTS - CREATE
  router.post('/products', verifyAdmin, async (req, res) => {
    try {
      const parsed = productSchema.safeParse({
        brandId: req.body.brandId ? Number(req.body.brandId) : undefined,
        retailerId: req.body.retailerId ? Number(req.body.retailerId) : undefined,
        categoryId: Number(req.body.categoryId),
        name: req.body.name,
        description: req.body.description,
        price: Number(req.body.price),
        stock: req.body.stock !== undefined ? Number(req.body.stock) : undefined,
        isOutOfStock: req.body.isOutOfStock,
        color: req.body.color,
        fabric: req.body.fabric,
        fit: req.body.fit,
        pattern: req.body.pattern,
        sleeve: req.body.sleeve,
        occasion: req.body.occasion,
        material: req.body.material,
        vibeTag: req.body.vibeTag,
        images: req.body.images,
        sizeChartItems: req.body.sizeChartItems,
      });
      if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

      const {
        brandId,
        retailerId,
        categoryId,
        name,
        description,
        price,
        images,
        sizeChartItems,
        stock,
        isOutOfStock,
        color,
        fabric,
        fit,
        pattern,
        sleeve,
        occasion,
        material,
        vibeTag,
      } = parsed.data;

      if (!brandId && !retailerId) return res.status(400).json({ error: 'brandId OR retailerId required' });
      if (!images?.length) return res.status(400).json({ error: 'At least one image required for product creation' });
      if (images.some((img) => !isAllowedImageInput(img))) {
        return res.status(400).json({ error: 'Invalid image URL or unsupported image format' });
      }

      const category = await prisma.category.findUnique({ where: { id: Number(categoryId) } });
      if (!category) return res.status(404).json({ error: 'Category not found' });

      const imagesToCreate = [];
      for (let i = 0; i < images.length; i++) {
        const uploaded = await cloudinary.uploader.upload(images[i], {
          folder: 'syvora/products',
          width: 1000,
          height: 1000,
          crop: 'fill',
          fetch_format: 'auto',
          quality: 'auto',
        });
        imagesToCreate.push({ imageUrl: uploaded.secure_url, publicId: uploaded.public_id, sortOrder: i });
      }

      const result = await prisma.$transaction(async (tx) => {
        const product = await tx.product.create({
          data: {
            brandId: brandId ? Number(brandId) : null,
            retailerId: retailerId ? Number(retailerId) : null,
            sellerType: retailerId ? 'RETAILER' : 'BRAND',
            categoryId: Number(categoryId),
            name,
            description: description || null,
            price,
            color: color || null,
            fabric: fabric || null,
            fit: fit || null,
            pattern: pattern || null,
            sleeve: sleeve || null,
            occasion: occasion || null,
            material: material || null,
            vibeTag: vibeTag || 'Casual',
            stock: stock !== undefined ? Number(stock) : 10,
            isOutOfStock: isOutOfStock !== undefined ? Boolean(isOutOfStock) : false,
            images: { create: imagesToCreate },
          },
          include: { images: true },
        });

        if (sizeChartItems?.length) {
          for (const item of sizeChartItems) {
            if (!item.size || !item.size.trim()) continue;
            await tx.productSizeChart.create({
              data: {
                productId: product.id,
                size: item.size.trim(),
                chest:
                  item.chest !== undefined && item.chest !== '' && !isNaN(Number(item.chest))
                    ? Number(item.chest)
                    : null,
                shoulder:
                  item.shoulder !== undefined && item.shoulder !== '' && !isNaN(Number(item.shoulder))
                    ? Number(item.shoulder)
                    : null,
                length:
                  item.length !== undefined && item.length !== '' && !isNaN(Number(item.length))
                    ? Number(item.length)
                    : null,
                waist:
                  item.waist !== undefined && item.waist !== '' && !isNaN(Number(item.waist))
                    ? Number(item.waist)
                    : null,
                hips:
                  item.hips !== undefined && item.hips !== '' && !isNaN(Number(item.hips))
                    ? Number(item.hips)
                    : null,
                stock:
                  item.stock !== undefined && item.stock !== '' && !isNaN(Number(item.stock))
                    ? Number(item.stock)
                    : 10,
                inStock: item.stock !== undefined && item.stock !== '' ? Number(item.stock) > 0 : true,
              },
            });
          }
        }

        return await tx.product.findUnique({
          where: { id: product.id },
          include: { brand: true, retailer: true, category: true, images: true, sizeCharts: true },
        });
      });
      res.status(201).json({ message: 'Product Created!', product: result });
    } catch (error) {
      if (isTokenError(error)) return res.status(401).json({ error: 'Unauthorized' });
      console.error('CREATE PRODUCT ERROR:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  // PRODUCTS - EDIT / UPDATE ROUTE
  router.put('/products/:id', verifyAdmin, async (req, res) => {
    try {
      const productId = parsePositiveIntId(req.params.id);
      if (!productId) return res.status(400).json({ error: 'Invalid Product ID' });

      const existingProduct = await prisma.product.findUnique({
        where: { id: productId },
        include: { images: true },
      });
      if (!existingProduct) return res.status(404).json({ error: 'Product not found' });

      const incomingImages = req.body.images || req.body.newImages;
      if (incomingImages !== undefined) {
        if (!Array.isArray(incomingImages) || incomingImages.length > MAX_PRODUCT_IMAGES) {
          return res.status(400).json({ error: `Up to ${MAX_PRODUCT_IMAGES} images allowed` });
        }
        if (incomingImages.some((img) => !isAllowedImageInput(img))) {
          return res.status(400).json({ error: 'Invalid image URL or unsupported image format' });
        }
      }

      const parsed = productSchema.safeParse({
        brandId: req.body.brandId ? Number(req.body.brandId) : undefined,
        retailerId: req.body.retailerId ? Number(req.body.retailerId) : undefined,
        categoryId: req.body.categoryId ? Number(req.body.categoryId) : existingProduct.categoryId,
        name: req.body.name !== undefined ? req.body.name : existingProduct.name,
        description: req.body.description,
        price: req.body.price !== undefined ? Number(req.body.price) : Number(existingProduct.price),
        stock: req.body.stock !== undefined ? Number(req.body.stock) : undefined,
        isOutOfStock: req.body.isOutOfStock,
        color: req.body.color,
        fabric: req.body.fabric,
        fit: req.body.fit,
        pattern: req.body.pattern,
        sleeve: req.body.sleeve,
        occasion: req.body.occasion,
        material: req.body.material,
        vibeTag: req.body.vibeTag,
        images: incomingImages,
        sizeChartItems: req.body.sizeChartItems,
      });

      if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

      const {
        brandId,
        retailerId,
        categoryId,
        name,
        description,
        price,
        images,
        sizeChartItems,
        stock,
        isOutOfStock,
        color,
        fabric,
        fit,
        pattern,
        sleeve,
        occasion,
        material,
        vibeTag,
      } = parsed.data;

      const wasOutOfStock = existingProduct.isOutOfStock || existingProduct.stock <= 0;

      const result = await prisma.$transaction(async (tx) => {
        let imageUpdateData = {};
        if (images && images.length > 0) {
          for (const img of existingProduct.images) {
            if (img.publicId) {
              try {
                await cloudinary.uploader.destroy(img.publicId);
              } catch (err) {}
            }
          }
          await tx.productImage.deleteMany({ where: { productId } });

          const newImagesToCreate = [];
          for (let i = 0; i < images.length; i++) {
            const uploaded = await cloudinary.uploader.upload(images[i], {
              folder: 'syvora/products',
              width: 1000,
              height: 1000,
              crop: 'fill',
              fetch_format: 'auto',
              quality: 'auto',
            });
            newImagesToCreate.push({ imageUrl: uploaded.secure_url, publicId: uploaded.public_id, sortOrder: i });
          }
          imageUpdateData = { images: { create: newImagesToCreate } };
        }

        if (sizeChartItems !== undefined) {
          await tx.productSizeChart.deleteMany({ where: { productId } });
          if (sizeChartItems.length > 0) {
            for (const item of sizeChartItems) {
              if (!item.size || !item.size.trim()) continue;
              await tx.productSizeChart.create({
                data: {
                  productId,
                  size: item.size.trim(),
                  chest:
                    item.chest !== undefined && item.chest !== '' && !isNaN(Number(item.chest))
                      ? Number(item.chest)
                      : null,
                  shoulder:
                    item.shoulder !== undefined && item.shoulder !== '' && !isNaN(Number(item.shoulder))
                      ? Number(item.shoulder)
                      : null,
                  length:
                    item.length !== undefined && item.length !== '' && !isNaN(Number(item.length))
                      ? Number(item.length)
                      : null,
                  waist:
                    item.waist !== undefined && item.waist !== '' && !isNaN(Number(item.waist))
                      ? Number(item.waist)
                      : null,
                  hips:
                    item.hips !== undefined && item.hips !== '' && !isNaN(Number(item.hips))
                      ? Number(item.hips)
                      : null,
                  stock:
                    item.stock !== undefined && item.stock !== '' && !isNaN(Number(item.stock))
                      ? Number(item.stock)
                      : 10,
                  inStock: item.stock !== undefined && item.stock !== '' ? Number(item.stock) > 0 : true,
                },
              });
            }
          }
        }

        await tx.product.update({
          where: { id: productId },
          data: {
            brandId: brandId !== undefined ? (brandId ? Number(brandId) : null) : undefined,
            retailerId: retailerId !== undefined ? (retailerId ? Number(retailerId) : null) : undefined,
            sellerType: retailerId ? 'RETAILER' : brandId ? 'BRAND' : undefined,
            categoryId: categoryId ? Number(categoryId) : undefined,
            name,
            description,
            price,
            color,
            fabric,
            fit,
            pattern,
            sleeve,
            occasion,
            material,
            vibeTag: vibeTag !== undefined ? vibeTag : undefined,
            stock: stock !== undefined ? Number(stock) : undefined,
            isOutOfStock: isOutOfStock !== undefined ? Boolean(isOutOfStock) : undefined,
            ...imageUpdateData,
          },
        });

        return await tx.product.findUnique({
          where: { id: productId },
          include: { brand: true, retailer: true, category: true, images: true, sizeCharts: true },
        });
      });

      // BACK-IN-STOCK NOTIFICATION TRIGGER
      const isNowInStock = !result.isOutOfStock && result.stock > 0;
      if (wasOutOfStock && isNowInStock) {
        try {
          const pendingAlerts = await prisma.stockNotification.findMany({
            where: { productId, notified: false },
          });

          if (pendingAlerts.length > 0) {
            for (const alert of pendingAlerts) {
              try {
                if (alert.userId && prisma.notification) {
                  await prisma.notification.create({
                    data: {
                      userId: alert.userId,
                      productId: result.id,
                      title: 'Back in Stock! 🎉',
                      message: `${result.name} is back in stock. Grab it before it sells out!`,
                    },
                  });
                }
              } catch (innerErr) {}

              if (transporter && process.env.EMAIL_USER && alert.email) {
                try {
                  await transporter.sendMail({
                    from: process.env.EMAIL_USER,
                    to: alert.email,
                    subject: `✨ Good News! ${result.name} is Back in Stock on Syvora!`,
                    html: `
                      <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
                        <h2 style="color: #4A3024;">🎉 Item Wapas Stock Me Aa Gaya Hai!</h2>
                        <p>Aapne jis product ke liye notify karne ko kaha tha, woh ab available hai:</p>
                        <p><b>Product:</b> ${result.name}</p>
                        <p><b>Price:</b> ₹${result.price}</p>
                        <p>Jaldi karein, stock limited ho sakta hai!</p>
                      </div>
                    `,
                  });
                } catch (mailErr) {
                  console.error(`Failed to send stock alert to ${alert.email}:`, mailErr);
                }
              }

              await prisma.stockNotification.update({
                where: { id: alert.id },
                data: { notified: true },
              });
            }
          }
        } catch (notifMainErr) {
          console.error('Stock notification trigger error:', notifMainErr);
        }
      }

      res.json({ message: 'Product updated successfully!', product: result });
    } catch (error) {
      if (isTokenError(error)) return res.status(401).json({ error: 'Unauthorized' });
      console.error('UPDATE PRODUCT ERROR:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  // NOTIFY ME - STOCK ALERT REGISTRATION ROUTE
  router.post('/products/:id/notify', async (req, res) => {
    try {
      const productId = parsePositiveIntId(req.params.id);
      if (!productId) return res.status(400).json({ error: 'Invalid product ID' });

      const email = String(req.body?.email || '').toLowerCase().trim();
      const { userId } = req.body || {};

      if (!email || !email.includes('@')) {
        return res.status(400).json({ error: 'Valid email is required' });
      }

      const product = await prisma.product.findUnique({ where: { id: productId } });
      if (!product) return res.status(404).json({ error: 'Product not found' });

      await prisma.stockNotification.upsert({
        where: { email_productId: { email, productId } },
        update: { notified: false },
        create: { email, productId, userId: userId && parsePositiveIntId(userId) ? Number(userId) : null },
      });

      res.json({ message: 'We will notify you when this item is back in stock!' });
    } catch (error) {
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  // 🚀 GET UNREAD NOTIFICATIONS FOR USER (Standard Path - Secured)
  router.get('/notifications/:userId', async (req, res) => {
    try {
      const { userId: tokenUserId, role } = getTokenUser(req);
      const userId = parsePositiveIntId(req.params.userId);
      if (!userId) return res.status(400).json({ error: 'Invalid User ID' });

      if (tokenUserId !== userId && role !== 'ADMIN') {
        return res.status(403).json({ error: 'Access denied' });
      }

      const notifications = await prisma.notification.findMany({
        where: { userId, isRead: false },
        include: { product: { include: { images: true } } },
        orderBy: { createdAt: 'desc' },
      });

      res.json({ success: true, notifications });
    } catch (e) {
      if (isTokenError(e)) return res.status(401).json({ error: 'Unauthorized' });
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  // 🚀 GET UNREAD NOTIFICATIONS FOR USER (Frontend Matching Route - Secured)
  router.get('/notifications/user/:userId', async (req, res) => {
    try {
      const { userId: tokenUserId, role } = getTokenUser(req);
      const userId = parsePositiveIntId(req.params.userId);
      if (!userId) return res.status(400).json({ error: 'Invalid User ID' });

      if (tokenUserId !== userId && role !== 'ADMIN') {
        return res.status(403).json({ error: 'Access denied' });
      }

      const notifications = await prisma.notification.findMany({
        where: { userId, isRead: false },
        include: { product: { include: { images: true } } },
        orderBy: { createdAt: 'desc' },
      });

      res.json({ success: true, notifications });
    } catch (e) {
      if (isTokenError(e)) return res.status(401).json({ error: 'Unauthorized' });
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  // 🚀 MARK NOTIFICATION AS READ (Secured - Owner or Admin)
  router.patch('/notifications/:id/read', async (req, res) => {
    try {
      const { userId: tokenUserId, role } = getTokenUser(req);
      const notifId = parsePositiveIntId(req.params.id);
      if (!notifId) return res.status(400).json({ error: 'Invalid Notification ID' });

      const existingNotif = await prisma.notification.findUnique({ where: { id: notifId } });
      if (!existingNotif) return res.status(404).json({ error: 'Notification not found' });

      if (existingNotif.userId !== tokenUserId && role !== 'ADMIN') {
        return res.status(403).json({ error: 'Access denied' });
      }

      await prisma.notification.update({
        where: { id: notifId },
        data: { isRead: true },
      });
      res.json({ success: true, message: 'Marked as read' });
    } catch (e) {
      if (isTokenError(e)) return res.status(401).json({ error: 'Unauthorized' });
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  // GET PRODUCTS (With VibeTag Query Filter Support)
  router.get('/products', async (req, res) => {
    try {
      const { categoryId, retailerId, brandId, vibeTag, search } = req.query;
      const where = {};
      if (categoryId && parsePositiveIntId(categoryId)) where.categoryId = Number(categoryId);
      if (retailerId && parsePositiveIntId(retailerId)) where.retailerId = Number(retailerId);
      if (brandId && parsePositiveIntId(brandId)) where.brandId = Number(brandId);
      if (vibeTag) where.vibeTag = String(vibeTag).trim().slice(0, 40);
      if (search) {
        const safeSearch = String(search).trim().slice(0, 50);
        if (safeSearch) where.name = { contains: safeSearch, mode: 'insensitive' };
      }

      const products = await prisma.product.findMany({
        where,
        include: { brand: true, retailer: true, category: true, images: true, sizeCharts: true },
        orderBy: { createdAt: 'desc' },
      });
      res.json(products);
    } catch (e) {
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  router.get('/products/:id', async (req, res) => {
    try {
      const id = parsePositiveIntId(req.params.id);
      if (!id) return res.status(400).json({ error: 'Invalid ID' });
      const product = await prisma.product.findUnique({
        where: { id },
        include: { brand: true, retailer: true, category: true, images: true, sizeCharts: true },
      });
      if (!product) return res.status(404).json({ error: 'Product not found' });
      res.json(product);
    } catch (e) {
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  router.delete('/products/:id', verifyAdmin, async (req, res) => {
    try {
      const productId = parsePositiveIntId(req.params.id);
      if (!productId) return res.status(400).json({ error: 'Invalid ID' });
      const existing = await prisma.product.findUnique({ where: { id: productId }, include: { images: true } });
      if (!existing) return res.status(404).json({ error: 'Product not found' });
      for (const img of existing.images) {
        if (img.publicId) {
          try {
            await cloudinary.uploader.destroy(img.publicId);
          } catch (e) {}
        }
      }
      await prisma.productImage.deleteMany({ where: { productId } });
      await prisma.productSizeChart.deleteMany({ where: { productId } });
      await prisma.stockNotification.deleteMany({ where: { productId } });
      await prisma.product.delete({ where: { id: productId } });
      res.json({ message: 'Product deleted!' });
    } catch (error) {
      if (isTokenError(error)) return res.status(401).json({ error: 'Unauthorized' });
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  return router;
};