// require('dotenv').config();
// const express = require('express');
// const cors = require('cors');
// const bcrypt = require('bcryptjs');
// const jwt = require('jsonwebtoken');
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

//     // Validation
//     if (!email || !password) {
//       return res.status(400).json({ error: "Email and password are required" });
//     }

//     // Check if user already exists
//     const existingUser = await prisma.user.findUnique({ where: { email } });
//     if (existingUser) {
//       return res.status(400).json({ error: "User already exists with this email" });
//     }

//     // Hash password
//     const hashedPassword = await bcrypt.hash(password, 10);

//     // Create User, Profile, Cart & Wishlist atomically
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

//     // Generate JWT Token
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

//     // Find User
//     const user = await prisma.user.findUnique({
//       where: { email },
//       include: { profile: true }
//     });

//     if (!user) {
//       return res.status(400).json({ error: "Invalid email or password" });
//     }

//     // Verify Password
//     const isPasswordValid = await bcrypt.compare(password, user.password);
//     if (!isPasswordValid) {
//       return res.status(400).json({ error: "Invalid email or password" });
//     }

//     // Generate JWT Token
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

// // Start Server
// const PORT = process.env.PORT || 5000;
// app.listen(PORT, () => console.log(`🚀 Syvoradb server running on port ${PORT}`));





require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('./generated/client');

// Initialize Express App
const app = express();
app.use(cors());
app.use(express.json());

// Initialize Database Connection with explicit SSL configuration for Neon Postgres
const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const JWT_SECRET = process.env.JWT_SECRET || 'syvora_jwt_secret_2026';

// Nodemailer Transporter Setup (Using Syvora Official Mail)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER || 'syvora.official.acc@gmail.com',
    pass: process.env.EMAIL_PASS
  }
});

// Helper: Generate JWT Token
const generateToken = (userId, email) => {
  return jwt.sign({ userId, email }, JWT_SECRET, { expiresIn: '7d' });
};

// ==========================================
// AUTHENTICATION ROUTES
// ==========================================

// 1. SIGNUP ROUTE
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: "User already exists with this email" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        profile: {
          create: { name }
        },
        cart: {
          create: {}
        },
        wishlist: {
          create: {}
        }
      },
      include: { profile: true }
    });

    const token = generateToken(newUser.id, newUser.email);

    res.status(201).json({
      message: "Signup successful!",
      token,
      user: {
        id: newUser.id,
        email: newUser.email,
        name: newUser.profile?.name || null
      }
    });
  } catch (error) {
    console.error("Signup Error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// 2. LOGIN ROUTE
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const user = await prisma.user.findUnique({
      where: { email },
      include: { profile: true }
    });

    if (!user) {
      return res.status(400).json({ error: "Invalid email or password" });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(400).json({ error: "Invalid email or password" });
    }

    const token = generateToken(user.id, user.email);

    res.json({
      message: "Login successful!",
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.profile?.name || null
      }
    });
  } catch (error) {
    console.error("Login Error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ==========================================
// FORGET PASSWORD FLOW
// ==========================================

// 3. FORGOT PASSWORD (OTP Mail bhejta hai)
app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email is required" });

    // Check user in database
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(404).json({ error: "User with this email does not exist" });

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 mins expiry

    // Save/Update OTP in DB
    await prisma.passwordReset.deleteMany({ where: { email } });
    await prisma.passwordReset.create({
      data: { email, otp, expiresAt }
    });

    // Send Mail from Syvora Official Account
    await transporter.sendMail({
      from: `"Syvora Support" <syvora.official.acc@gmail.com>`,
      to: email, // Dynamic user's entered email
      subject: "Syvora - Password Reset OTP",
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2>Password Reset Request</h2>
          <p>Dear User,We received a request to reset the password for your account associated with this email address.
          Please use the following One-Time Password (OTP) to proceed:</p>
          <h1 style="color: #1f7ab8; letter-spacing: 2px;">${otp}</h1>
          <p>This OTP is valid for the next 10 minutes. <br>Please do not share this code with anyone for security reasons.<br>If you did not request a password reset, please ignore this email or contact our support team immediately. Your password will remain unchanged.To reset your password, please enter this OTP on the verification page.</p>
          <br/>
          <p>Team Syvora</p>
        </div>
      `
    });

    res.json({ message: "OTP successfully sent to your registered email!" });
  } catch (error) {
    console.error("Forgot Password Error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// 4. VERIFY OTP (User app me OTP submit karega)
app.post('/api/auth/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) return res.status(400).json({ error: "Email and OTP are required" });

    const resetRecord = await prisma.passwordReset.findFirst({
      where: { email, otp }
    });

    if (!resetRecord) {
      return res.status(400).json({ error: "Invalid OTP" });
    }

    if (new Date() > resetRecord.expiresAt) {
      return res.status(400).json({ error: "OTP has expired. Please request a new one." });
    }

    res.json({ message: "OTP verified successfully!" });
  } catch (error) {
    console.error("Verify OTP Error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// 5. RESET PASSWORD (New Password set karke User Update karega)
app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;
    if (!email || !otp || !newPassword) {
      return res.status(400).json({ error: "All fields are required" });
    }

    const resetRecord = await prisma.passwordReset.findFirst({
      where: { email, otp }
    });

    if (!resetRecord || new Date() > resetRecord.expiresAt) {
      return res.status(400).json({ error: "Invalid or expired OTP" });
    }

    // Hash New Password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { email },
      data: { password: hashedPassword }
    });

    // Cleanup Reset Record
    await prisma.passwordReset.deleteMany({ where: { email } });

    res.json({ message: "Password reset successful! You can now login with your new password." });
  } catch (error) {
    console.error("Reset Password Error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Syvoradb server running on port ${PORT}`));