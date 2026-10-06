
// require('dotenv').config();
// const express = require('express');
// const cors = require('cors');
// const bcrypt = require('bcryptjs');
// const jwt = require('jsonwebtoken');
// const nodemailer = require('nodemailer');
// const { Pool } = require('pg');
// const { PrismaPg } = require('@prisma/adapter-pg');
// const { PrismaClient } = require('./generated/client');

// // Initialize Express App
// const app = express();
// app.use(cors());
// app.use(express.json());

// // Initialize Database Connection with explicit SSL configuration for Neon Postgres
// const pool = new Pool({ 
//   connectionString: process.env.DATABASE_URL,
//   ssl: {
//     rejectUnauthorized: false
//   }
// });
// const adapter = new PrismaPg(pool);
// const prisma = new PrismaClient({ adapter });

// const JWT_SECRET = process.env.JWT_SECRET || 'syvora_jwt_secret_2026';

// // Nodemailer Transporter Setup (Using Syvora Official Mail)
// const transporter = nodemailer.createTransport({
//   service: 'gmail',
//   auth: {
//     user: process.env.EMAIL_USER || 'syvora.official.acc@gmail.com',
//     pass: process.env.EMAIL_PASS
//   }
// });

// // Helper: Generate JWT Token
// const generateToken = (userId, email) => {
//   return jwt.sign({ userId, email }, JWT_SECRET, { expiresIn: '7d' });
// };

// // ==========================================
// // AUTHENTICATION ROUTES
// // ==========================================

// // 1. SIGNUP ROUTE
// app.post('/api/auth/signup', async (req, res) => {
//   try {
//     const { email, password, name } = req.body;

//     if (!email || !password) {
//       return res.status(400).json({ error: "Email and password are required" });
//     }

//     const existingUser = await prisma.user.findUnique({ where: { email } });
//     if (existingUser) {
//       return res.status(400).json({ error: "User already exists with this email" });
//     }

//     const hashedPassword = await bcrypt.hash(password, 10);

//     const newUser = await prisma.user.create({
//       data: {
//         email,
//         password: hashedPassword,
//         profile: {
//           create: { name }
//         },
//         cart: {
//           create: {}
//         },
//         wishlist: {
//           create: {}
//         }
//       },
//       include: { profile: true }
//     });

//     const token = generateToken(newUser.id, newUser.email);

//     res.status(201).json({
//       message: "Signup successful!",
//       token,
//       user: {
//         id: newUser.id,
//         email: newUser.email,
//         name: newUser.profile?.name || null
//       }
//     });
//   } catch (error) {
//     console.error("Signup Error:", error);
//     res.status(500).json({ error: "Internal Server Error" });
//   }
// });

// // 2. LOGIN ROUTE
// app.post('/api/auth/login', async (req, res) => {
//   try {
//     const { email, password } = req.body;

//     if (!email || !password) {
//       return res.status(400).json({ error: "Email and password are required" });
//     }

//     const user = await prisma.user.findUnique({
//       where: { email },
//       include: { profile: true }
//     });

//     if (!user) {
//       return res.status(400).json({ error: "Invalid email or password" });
//     }

//     const isPasswordValid = await bcrypt.compare(password, user.password);
//     if (!isPasswordValid) {
//       return res.status(400).json({ error: "Invalid email or password" });
//     }

//     const token = generateToken(user.id, user.email);

//     res.json({
//       message: "Login successful!",
//       token,
//       user: {
//         id: user.id,
//         email: user.email,
//         name: user.profile?.name || null
//       }
//     });
//   } catch (error) {
//     console.error("Login Error:", error);
//     res.status(500).json({ error: "Internal Server Error" });
//   }
// });

// // ==========================================
// // FORGET PASSWORD FLOW
// // ==========================================

// // 3. FORGOT PASSWORD (OTP Mail bhejta hai)
// app.post('/api/auth/forgot-password', async (req, res) => {
//   try {
//     const { email } = req.body;
//     if (!email) return res.status(400).json({ error: "Email is required" });

//     const user = await prisma.user.findUnique({ where: { email } });
//     if (!user) return res.status(404).json({ error: "User with this email does not exist" });

//     const otp = Math.floor(100000 + Math.random() * 900000).toString();
//     const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

//     await prisma.passwordReset.deleteMany({ where: { email } });
//     await prisma.passwordReset.create({
//       data: { email, otp, expiresAt }
//     });

//     await transporter.sendMail({
//       from: `"Syvora" <syvora.official.acc@gmail.com>`,
//       to: email,
//       subject: "Syvora - Password Reset OTP",
//       html: `
//         <div style="font-family: Arial, sans-serif; padding: 20px;">
//           <h2>Password Reset Request</h2>
//           <p>Dear User,<br>We received a request to reset the password for your account associated with this email address.
//           Please use the following One-Time Password (OTP) to proceed:</p>
//           <h1 style="color: #1f7ab8; letter-spacing: 2px;">${otp}</h1>
//           <p>This OTP is valid for the next 10 minutes. <br>Please do not share this code with anyone for security reasons.</p>
//           <br/>
//           <p>Team Syvora</p>
//         </div>
//       `
//     });

//     res.json({ message: "OTP successfully sent to your registered email!" });
//   } catch (error) {
//     console.error("Forgot Password Error:", error);
//     res.status(500).json({ error: "Internal Server Error" });
//   }
// });

// // 4. VERIFY OTP
// app.post('/api/auth/verify-otp', async (req, res) => {
//   try {
//     const { email, otp } = req.body;
//     if (!email || !otp) return res.status(400).json({ error: "Email and OTP are required" });

//     const resetRecord = await prisma.passwordReset.findFirst({
//       where: { email, otp }
//     });

//     if (!resetRecord) {
//       return res.status(400).json({ error: "Invalid OTP" });
//     }

//     if (new Date() > resetRecord.expiresAt) {
//       return res.status(400).json({ error: "OTP has expired. Please request a new one." });
//     }

//     res.json({ message: "OTP verified successfully!" });
//   } catch (error) {
//     console.error("Verify OTP Error:", error);
//     res.status(500).json({ error: "Internal Server Error" });
//   }
// });

// // 5. RESET PASSWORD
// app.post('/api/auth/reset-password', async (req, res) => {
//   try {
//     const { email, otp, newPassword } = req.body;
//     if (!email || !otp || !newPassword) {
//       return res.status(400).json({ error: "All fields are required" });
//     }

//     const resetRecord = await prisma.passwordReset.findFirst({
//       where: { email, otp }
//     });

//     if (!resetRecord || new Date() > resetRecord.expiresAt) {
//       return res.status(400).json({ error: "Invalid or expired OTP" });
//     }

//     const hashedPassword = await bcrypt.hash(newPassword, 10);
//     await prisma.user.update({
//       where: { email },
//       data: { password: hashedPassword }
//     });

//     await prisma.passwordReset.deleteMany({ where: { email } });

//     res.json({ message: "Password reset successful! You can now login with your new password." });
//   } catch (error) {
//     console.error("Reset Password Error:", error);
//     res.status(500).json({ error: "Internal Server Error" });
//   }
// });

// // ==========================================
// // CATALOG DOMAIN ROUTES (Brands, Categories, Products)
// // ==========================================

// // 1. CREATE BRAND
// app.post('/api/brands', async (req, res) => {
//   try {
//     const { name, description, instagramUrl, websiteUrl } = req.body;
//     if (!name) return res.status(400).json({ error: "Brand name is required" });

//     const brand = await prisma.brand.create({
//       data: { name, description, instagramUrl, websiteUrl }
//     });
//     res.status(201).json({ message: "Brand created successfully!", brand });
//   } catch (error) {
//     console.error("Create Brand Error:", error);
//     res.status(500).json({ error: "Internal Server Error" });
//   }
// });

// // 2. GET ALL BRANDS
// app.get('/api/brands', async (req, res) => {
//   try {
//     const brands = await prisma.brand.findMany({
//       include: { _count: { select: { products: true } } }
//     });
//     res.json(brands);
//   } catch (error) {
//     console.error("Get Brands Error:", error);
//     res.status(500).json({ error: "Internal Server Error" });
//   }
// });

// // 3. CREATE CATEGORY
// app.post('/api/categories', async (req, res) => {
//   try {
//     const { name } = req.body;
//     if (!name) return res.status(400).json({ error: "Category name is required" });

//     const existingCategory = await prisma.category.findUnique({ where: { name } });
//     if (existingCategory) return res.status(400).json({ error: "Category already exists" });

//     const category = await prisma.category.create({ data: { name } });
//     res.status(201).json({ message: "Category created successfully!", category });
//   } catch (error) {
//     console.error("Create Category Error:", error);
//     res.status(500).json({ error: "Internal Server Error" });
//   }
// });

// // 4. GET ALL CATEGORIES
// app.get('/api/categories', async (req, res) => {
//   try {
//     const categories = await prisma.category.findMany({
//       include: { _count: { select: { products: true } } }
//     });
//     res.json(categories);
//   } catch (error) {
//     console.error("Get Categories Error:", error);
//     res.status(500).json({ error: "Internal Server Error" });
//   }
// });

// // 5. CREATE PRODUCT
// app.post('/api/products', async (req, res) => {
//   try {
//     const { brandId, categoryId, name, description, price, images, sizeChartItems } = req.body;

//     if (!brandId || !categoryId || !name || !price) {
//       return res.status(400).json({ error: "brandId, categoryId, name, and price are required" });
//     }

//     const product = await prisma.product.create({
//       data: {
//         brandId: Number(brandId),
//         categoryId: Number(categoryId),
//         name,
//         description,
//         price: parseFloat(price),
//         images: images && images.length > 0 ? {
//           create: images.map((url, index) => ({ imageUrl: url, sortOrder: index }))
//         } : undefined,
//         sizeChart: sizeChartItems && sizeChartItems.length > 0 ? {
//           create: {
//             items: {
//               create: sizeChartItems.map(item => ({
//                 sizeLabel: item.sizeLabel,
//                 measurementDetails: item.measurementDetails
//               }))
//             }
//           }
//         } : undefined
//       },
//       include: {
//         brand: true,
//         category: true,
//         images: true,
//         sizeChart: {
//           include: { items: true }
//         }
//       }
//     });

//     res.status(201).json({ message: "Product created successfully!", product });
//   } catch (error) {
//     console.error("Create Product Error:", error);
//     res.status(500).json({ error: "Internal Server Error" });
//   }
// });

// // 6. GET ALL PRODUCTS
// app.get('/api/products', async (req, res) => {
//   try {
//     const products = await prisma.product.findMany({
//       include: {
//         brand: true,
//         category: true,
//         images: true,
//         sizeChart: {
//           include: { items: true }
//         }
//       },
//       orderBy: { createdAt: 'desc' }
//     });
//     res.json(products);
//   } catch (error) {
//     console.error("Get Products Error:", error);
//     res.status(500).json({ error: "Internal Server Error" });
//   }
// });

// // 7. GET SINGLE PRODUCT BY ID
// app.get('/api/products/:id', async (req, res) => {
//   try {
//     const { id } = req.params;
//     const product = await prisma.product.findUnique({
//       where: { id: Number(id) },
//       include: {
//         brand: true,
//         category: true,
//         images: true,
//         sizeChart: {
//           include: { items: true }
//         }
//       }
//     });

//     if (!product) return res.status(404).json({ error: "Product not found" });

//     res.json(product);
//   } catch (error) {
//     console.error("Get Product Error:", error);
//     res.status(500).json({ error: "Internal Server Error" });
//   }
// });

// // ==========================================
// // SHOPPING DOMAIN ROUTES (Cart & Wishlist)
// // ==========================================

// // --- CART APIs ---

// // 1. Get User Cart
// app.get('/api/cart/:userId', async (req, res) => {
//   try {
//     const { userId } = req.params;
//     let cart = await prisma.cart.findUnique({
//       where: { userId: Number(userId) },
//       include: {
//         items: {
//           include: {
//             product: {
//               include: { brand: true, images: true }
//             }
//           }
//         }
//       }
//     });

//     if (!cart) {
//       cart = await prisma.cart.create({
//         data: { userId: Number(userId) },
//         include: { items: { include: { product: { include: { brand: true, images: true } } } } }
//       });
//     }

//     res.json(cart);
//   } catch (error) {
//     console.error("Get Cart Error:", error);
//     res.status(500).json({ error: "Internal Server Error" });
//   }
// });

// // 2. Add Item to Cart
// app.post('/api/cart/add', async (req, res) => {
//   try {
//     const { userId, productId, quantity, size } = req.body;
//     if (!userId || !productId) {
//       return res.status(400).json({ error: "userId and productId are required" });
//     }

//     // Ensure cart exists for user
//     let cart = await prisma.cart.findUnique({ where: { userId: Number(userId) } });
//     if (!cart) {
//       cart = await prisma.cart.create({ data: { userId: Number(userId) } });
//     }

//     // Check if item already exists in cart with same size
//     const existingItem = await prisma.cartItem.findFirst({
//       where: {
//         cartId: cart.id,
//         productId: Number(productId),
//         size: size || null
//       }
//     });

//     let cartItem;
//     if (existingItem) {
//       // Update quantity if already exists
//       cartItem = await prisma.cartItem.update({
//         where: { id: existingItem.id },
//         data: { quantity: existingItem.quantity + (quantity ? Number(quantity) : 1) }
//       });
//     } else {
//       // Create new cart item
//       cartItem = await prisma.cartItem.create({
//         data: {
//           cartId: cart.id,
//           productId: Number(productId),
//           quantity: quantity ? Number(quantity) : 1,
//           size: size || null
//         }
//       });
//     }

//     res.status(201).json({ message: "Item added to cart successfully!", cartItem });
//   } catch (error) {
//     console.error("Add to Cart Error:", error);
//     res.status(500).json({ error: "Internal Server Error" });
//   }
// });

// // 3. Remove Item from Cart
// app.delete('/api/cart/item/:itemId', async (req, res) => {
//   try {
//     const { itemId } = req.params;
//     await prisma.cartItem.delete({
//       where: { id: Number(itemId) }
//     });
//     res.json({ message: "Cart item removed successfully!" });
//   } catch (error) {
//     console.error("Remove Cart Item Error:", error);
//     res.status(500).json({ error: "Internal Server Error" });
//   }
// });


// // --- WISHLIST APIs ---

// // 1. Get User Wishlist
// app.get('/api/wishlist/:userId', async (req, res) => {
//   try {
//     const { userId } = req.params;
//     let wishlist = await prisma.wishlist.findUnique({
//       where: { userId: Number(userId) },
//       include: {
//         items: {
//           include: {
//             product: {
//               include: { brand: true, images: true }
//             }
//           }
//         }
//       }
//     });

//     if (!wishlist) {
//       wishlist = await prisma.wishlist.create({
//         data: { userId: Number(userId) },
//         include: { items: { include: { product: { include: { brand: true, images: true } } } } }
//       });
//     }

//     res.json(wishlist);
//   } catch (error) {
//     console.error("Get Wishlist Error:", error);
//     res.status(500).json({ error: "Internal Server Error" });
//   }
// });

// // 2. Add / Toggle Item in Wishlist
// app.post('/api/wishlist/toggle', async (req, res) => {
//   try {
//     const { userId, productId } = req.body;
//     if (!userId || !productId) {
//       return res.status(400).json({ error: "userId and productId are required" });
//     }

//     let wishlist = await prisma.wishlist.findUnique({ where: { userId: Number(userId) } });
//     if (!wishlist) {
//       wishlist = await prisma.wishlist.create({ data: { userId: Number(userId) } });
//     }

//     const existingItem = await prisma.wishlistItem.findFirst({
//       where: {
//         wishlistId: wishlist.id,
//         productId: Number(productId)
//       }
//     });

//     if (existingItem) {
//       // Remove if already in wishlist (Toggle off)
//       await prisma.wishlistItem.delete({ where: { id: existingItem.id } });
//       return res.json({ message: "Removed from wishlist", status: "removed" });
//     } else {
//       // Add to wishlist (Toggle on)
//       const newItem = await prisma.wishlistItem.create({
//         data: {
//           wishlistId: wishlist.id,
//           productId: Number(productId)
//         }
//       });
//       return res.status(201).json({ message: "Added to wishlist", status: "added", newItem });
//     }
//   } catch (error) {
//     console.error("Wishlist Toggle Error:", error);
//     res.status(500).json({ error: "Internal Server Error" });
//   }
// });

// // Start Server
// const PORT = process.env.PORT || 5000;
// app.listen(PORT, () => console.log(`🚀 Syvoradb server running on port ${PORT}`));





require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('./generated/client');

// 1. App Setup
const app = express();
app.use(cors());
app.use(express.json());

// 2. Database Connection (PostgreSQL + Prisma)
const pool = new Pool({ 
 connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// 3. JWT Secret & Token Generator
const JWT_SECRET = process.env.JWT_SECRET || 'syvora_jwt_secret_2026';
const generateToken = (userId, email) => {
  return jwt.sign({ userId, email }, JWT_SECRET, { expiresIn: '7d' });
};

// 4. Admin Middleware
const verifyAdmin = async (req, res, next) => {
  try {
    const userId = req.headers['user-id'] || req.body.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const user = await prisma.user.findUnique({ where: { id: Number(userId) } });
    if (!user || user.role !== 'ADMIN') {
      return res.status(403).json({ error: "Access denied. Admins only!" });
    }
    next();
  } catch (error) {
    res.status(500).json({ error: "Internal Server Error" });
  }
};

// 5. Nodemailer Setup
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// 6. Import Route Modules
const authRoutes = require('./routes/auth.routes')(prisma, transporter, generateToken);
const catalogRoutes = require('./routes/catalog.routes')(prisma, verifyAdmin);
const cartRoutes = require('./routes/cart.routes')(prisma);
const addressRoutes = require('./routes/address.routes')(prisma);
const measurementRoutes = require('./routes/measurements.routes')(prisma);
const orderRoutes = require('./routes/order.routes')(prisma, transporter);
const reviewRoutes = require('./routes/review.routes')(prisma); // <--- Imported Review Routes

// 7. Register Route Endpoints
app.use('/api/auth', authRoutes);
app.use('/api', catalogRoutes);
app.use('/api', cartRoutes);
app.use('/api', addressRoutes);
app.use('/api', measurementRoutes);
app.use('/api', orderRoutes);
app.use('/api', reviewRoutes); // <--- Registered Review Routes

// Health Check Endpoint
app.get('/health', (req, res) => {
  res.json({ status: "OK", timestamp: new Date() });
});

// 8. Start Express Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Syvora Server running on port ${PORT}`);
});