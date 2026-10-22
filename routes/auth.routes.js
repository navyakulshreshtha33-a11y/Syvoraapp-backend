
// const express = require('express');
// const router = express.Router();
// const bcrypt = require('bcryptjs');

// module.exports = (prisma, resend, generateToken) => {

//   // 1. SIGNUP
//   router.post('/signup', async (req, res) => {
//     try {
//       const { email, password, name } = req.body;
//       if (!email || !password) {
//         return res.status(400).json({ error: "Email and password are required" });
//       }
//       const existingUser = await prisma.user.findUnique({ where: { email } });
//       if (existingUser) {
//         return res.status(400).json({ error: "User already exists with this email" });
//       }
//       const hashedPassword = await bcrypt.hash(password, 10);
//       const newUser = await prisma.user.create({
//         data: {
//           email,
//           password: hashedPassword,
//           role: "USER",
//           profile: { create: { name } },
//           cart: { create: {} },
//           wishlist: { create: {} }
//         },
//         include: { profile: true }
//       });
//       const token = generateToken(newUser.id, newUser.email);
//       res.status(201).json({
//         message: "Signup successful!",
//         token,
//         user: { id: newUser.id, email: newUser.email, name: newUser.profile?.name || null }
//       });
//     } catch (error) {
//       console.error("Signup Error:", error);
//       res.status(500).json({ error: "Internal Server Error" });
//     }
//   });

//   // 2. LOGIN
//   router.post('/login', async (req, res) => {
//     try {
//       const { email, password } = req.body;
//       if (!email || !password) {
//         return res.status(400).json({ error: "Email and password are required" });
//       }
//       const user = await prisma.user.findUnique({
//         where: { email },
//         include: { profile: true }
//       });
//       if (!user) return res.status(400).json({ error: "Invalid email or password" });
//       const isPasswordValid = await bcrypt.compare(password, user.password);
//       if (!isPasswordValid) return res.status(400).json({ error: "Invalid email or password" });
//       const token = generateToken(user.id, user.email);
//       res.json({
//         message: "Login successful!",
//         token,
//         user: {
//           id: user.id,
//           email: user.email,
//           name: user.profile?.name,
//           role: user.role
//         }
//       });
//     } catch (error) {
//       console.error("Login Error:", error);
//       res.status(500).json({ error: "Internal Server Error" });
//     }
//   });

//   // 3. FORGOT PASSWORD - RESEND VERSION
//   router.post('/forgot-password', async (req, res) => {
//     try {
//       const { email } = req.body;
//       if (!email) return res.status(400).json({ error: "Email is required" });

//       const user = await prisma.user.findUnique({ where: { email } });
//       if (!user) return res.status(404).json({ error: "User with this email does not exist" });

//       const otp = Math.floor(100000 + Math.random() * 900000).toString();
//       const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

//       await prisma.passwordReset.deleteMany({ where: { email } });
//       await prisma.passwordReset.create({ data: { email, otp, expiresAt } });

//       const { data, error } = await resend.emails.send({
//         from: "Syvora <noreply@syvora.in>",
//         replyTo: "syvora.official.acc@gmail.com",
//         to: [email],
//         subject: "Syvora - Password Reset OTP",
//         html: `<div style="font-family: Arial, sans-serif; padding: 20px;">
//           <h2>Password Reset Request</h2>
//           <p>Dear User,<br>We received a request to reset the password for your account.</p>
//           <p>Please use the following OTP:</p>
//           <h1 style="color: #1f7ab8; letter-spacing: 2px;">${otp}</h1>
//           <p>This OTP is valid for 10 minutes.</p>
//           <p>Team Syvora</p>
//         </div>`
//       });

//       if (error) {
//         console.error("Resend Error:", error);
//         return res.status(500).json({ error: "Failed to send OTP email" });
//       }

//       console.log("OTP Email sent:", data);
//       res.json({ message: "OTP successfully sent to your registered email!" });
//     } catch (error) {
//       console.error("Forgot Password Error:", error);
//       res.status(500).json({ error: "Internal Server Error" });
//     }
//   });

//   // 4. VERIFY OTP
//   router.post('/verify-otp', async (req, res) => {
//     try {
//       const { email, otp } = req.body;
//       if (!email || !otp) return res.status(400).json({ error: "Email and OTP are required" });
//       const resetRecord = await prisma.passwordReset.findFirst({ where: { email, otp } });
//       if (!resetRecord) return res.status(400).json({ error: "Invalid OTP" });
//       if (new Date() > resetRecord.expiresAt) return res.status(400).json({ error: "OTP has expired." });
//       res.json({ message: "OTP verified successfully!" });
//     } catch (error) {
//       console.error("Verify OTP Error:", error);
//       res.status(500).json({ error: "Internal Server Error" });
//     }
//   });

//   // 5. RESET PASSWORD
//   router.post('/reset-password', async (req, res) => {
//     try {
//       const { email, otp, newPassword } = req.body;
//       if (!email || !otp || !newPassword) return res.status(400).json({ error: "All fields are required" });
//       const resetRecord = await prisma.passwordReset.findFirst({ where: { email, otp } });
//       if (!resetRecord || new Date() > resetRecord.expiresAt) {
//         return res.status(400).json({ error: "Invalid or expired OTP" });
//       }
//       const hashedPassword = await bcrypt.hash(newPassword, 10);
//       await prisma.user.update({
//         where: { email },
//         data: { password: hashedPassword }
//       });
//       await prisma.passwordReset.deleteMany({ where: { email } });
//       res.json({ message: "Password reset successful!" });
//     } catch (error) {
//       console.error("Reset Password Error:", error);
//       res.status(500).json({ error: "Internal Server Error" });
//     }
//   });

//   // 6. DELETE USER - POSTMAN SE DELETE KARNE KE LIYE
//     // 6. DELETE USER - FIXED VERSION
//   router.delete('/delete-user/:id', async (req, res) => {
//     try {
//       const id = parseInt(req.params.id);
//       if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });

//       const user = await prisma.user.findUnique({ where: { id } });
//       if (!user) return res.status(404).json({ error: "User not found" });

//       // transaction me delete karo
//       await prisma.$transaction([
//         prisma.profile.deleteMany({ where: { userId: id } }),
//         prisma.cart.deleteMany({ where: { userId: id } }),
//         prisma.wishlist.deleteMany({ where: { userId: id } }),
//         prisma.passwordReset.deleteMany({ where: { email: user.email } }),
//         prisma.user.delete({ where: { id } }),
//       ]);
      
//       res.json({ message: `User ID ${id} deleted successfully!` });
//     } catch (error) {
//       console.error("Delete Error:", error);
//       res.status(500).json({ error: error.message });
//     }
//   });

//   return router;
// };



const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const cloudinary = require('../services/cloudinary'); // Baby ye add kiya

module.exports = (prisma, resend, generateToken) => {

  const otpResendMap = new Map();
  const otpFailMap = new Map();
  const loginFailMap = new Map();

  function checkLoginBlock(ip){
    const rec = loginFailMap.get(ip);
    if(rec && rec.blockUntil > Date.now()) return false;
    return true;
  }

  const signupSchema = z.object({
    email: z.string().email().toLowerCase(),
    password: z.string().min(8).max(64),
    name: z.string().min(2).max(50).optional(),
    consent: z.boolean().refine(v=>v===true, {message: "Consent required - DPDP Act"})
  });
  const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });

  router.post('/signup', async (req, res) => {
    try {
      const parsed = signupSchema.safeParse(req.body);
      if(!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
      const { email, password, name, consent } = parsed.data;

      const existingUser = await prisma.user.findUnique({ where: { email } });
      if (existingUser) return res.status(400).json({ error: "User already exists" });

      const hashedPassword = await bcrypt.hash(password, 10);
      const newUser = await prisma.user.create({
        data: {
          email,
          password: hashedPassword,
          role: "USER",
          consentGivenAt: new Date(),
          profile: { create: { name } },
          cart: { create: {} },
          wishlist: { create: {} }
        },
        include: { profile: true }
      });
      const token = generateToken(newUser.id, newUser.email);
      console.log(`[AUTH] Signup success id=${newUser.id}`);
      res.status(201).json({ message: "Signup successful!", token, user: { id: newUser.id, email: newUser.email, name: newUser.profile?.name || null } });
    } catch (error) {
      console.error("Signup Error:", error.message);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  router.post('/login', async (req, res) => {
    try {
      const ip = req.ip;
      if(!checkLoginBlock(ip)) return res.status(429).json({ error: "Too many failed attempts, try after 15 min" });

      const parsed = loginSchema.safeParse(req.body);
      if(!parsed.success) return res.status(400).json({ error: "Invalid data" });
      const { email, password } = parsed.data;

      const user = await prisma.user.findUnique({ where: { email }, include: { profile: true } });
      if (!user) {
        const rec = loginFailMap.get(ip) || {count:0}; rec.count++; if(rec.count>=5) rec.blockUntil=Date.now()+15*60*1000; loginFailMap.set(ip, rec);
        return res.status(400).json({ error: "Invalid email or password" });
      }
      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        const rec = loginFailMap.get(ip) || {count:0}; rec.count++; if(rec.count>=5) rec.blockUntil=Date.now()+15*60*1000; loginFailMap.set(ip, rec);
        return res.status(400).json({ error: "Invalid email or password" });
      }
      loginFailMap.delete(ip);
      const token = generateToken(user.id, user.email);
      res.json({ message: "Login successful!", token, user: { id: user.id, email: user.email, name: user.profile?.name, role: user.role } });
    } catch (error) {
      console.error("Login Error:", error.message);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  router.post('/forgot-password', async (req, res) => {
    try {
      const { email } = req.body;
      if (!email) return res.status(400).json({ error: "Email is required" });

      const now = Date.now();
      const rec = otpResendMap.get(email) || { count:0, firstAt: now };
      if(now - rec.firstAt > 10*60*1000) { rec.count=0; rec.firstAt=now; }
      if(rec.count >= 3) return res.status(429).json({ error: "Too many OTP requests, try after 10 min" });
      rec.count++; otpResendMap.set(email, rec);

      const user = await prisma.user.findUnique({ where: { email } });
      if (!user) return res.json({ message: "If email exists, OTP sent" });

      const otpPlain = Math.floor(100000 + Math.random() * 900000).toString();
      const otpHash = await bcrypt.hash(otpPlain, 10);
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

      await prisma.passwordReset.deleteMany({ where: { email } });
      await prisma.passwordReset.create({ data: { email, otp: otpHash, expiresAt } });

      const { error } = await resend.emails.send({
        from: "Syvora <noreply@syvora.in>",
        replyTo: "syvora.official.acc@gmail.com",
        to: [email],
        subject: "Syvora - Password Reset OTP",
        html: `<div><h2>Password Reset</h2><h1>${otpPlain}</h1><p>Valid for 5 minutes. Don't share.</p></div>`
      });
      if (error) return res.status(500).json({ error: "Failed to send OTP" });

      res.json({ message: "OTP sent if email exists" });
    } catch (error) {
      console.error("Forgot Error:", error.message);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  router.post('/verify-otp', async (req, res) => {
    try {
      const { email, otp } = req.body;
      if (!email || !otp) return res.status(400).json({ error: "Email and OTP required" });

      const block = otpFailMap.get(email);
      if(block && block.blockUntil > Date.now()) return res.status(429).json({ error: "Too many failed OTP, blocked 30 min" });

      const resetRecord = await prisma.passwordReset.findFirst({ where: { email } });
      if (!resetRecord) return res.status(400).json({ error: "Invalid OTP" });
      if (new Date() > resetRecord.expiresAt) {
        await prisma.passwordReset.deleteMany({ where: { email } });
        return res.status(400).json({ error: "OTP expired" });
      }

      const valid = await bcrypt.compare(otp, resetRecord.otp);
      if(!valid){
        const rec = otpFailMap.get(email) || {count:0}; rec.count++; if(rec.count>=5) rec.blockUntil=Date.now()+30*60*1000; otpFailMap.set(email, rec);
        return res.status(400).json({ error: "Invalid OTP" });
      }

      otpFailMap.delete(email);
      res.json({ message: "OTP verified" });
    } catch (error) {
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  router.post('/reset-password', async (req, res) => {
    try {
      const { email, otp, newPassword } = req.body;
      if (!email || !otp || !newPassword || newPassword.length < 8) return res.status(400).json({ error: "Invalid data" });
      const resetRecord = await prisma.passwordReset.findFirst({ where: { email } });
      if (!resetRecord || new Date() > resetRecord.expiresAt) return res.status(400).json({ error: "Invalid or expired OTP" });
      const valid = await bcrypt.compare(otp, resetRecord.otp);
      if(!valid) return res.status(400).json({ error: "Invalid OTP" });

      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await prisma.user.update({ where: { email }, data: { password: hashedPassword } });
      await prisma.passwordReset.deleteMany({ where: { email } });
      otpFailMap.delete(email); otpResendMap.delete(email);
      res.json({ message: "Password reset successful!" });
    } catch (error) {
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  // --- 6. DELETE ME - FINAL FIXED (IDOR + FK + Cloudinary) ---
  router.delete('/delete-me', async (req,res)=>{
    try{
      const authHeader = req.headers.authorization;
      if(!authHeader) return res.status(401).json({error: "Unauthorized"});
      const token = authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : authHeader;
      if(!process.env.JWT_SECRET) throw new Error("JWT_SECRET missing");
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const id = Number(decoded.id);

      const user = await prisma.user.findUnique({ where: { id } });
      if(!user) return res.status(404).json({error: "User not found"});

      // Cloudinary cleanup - fail nahi karega
      try{
        if(prisma.userPhoto){
          const photos = await prisma.userPhoto.findMany({ where: { userId: id } });
          for(const p of photos){
            if(p.cloudinaryPublicId) await cloudinary.uploader.destroy(p.cloudinaryPublicId).catch(()=>{});
          }
        }
        if(prisma.tryOn){
          const tryons = await prisma.tryOn.findMany({ where: { userId: id } });
          for(const t of tryons){
            if(t.resultPublicId) await cloudinary.uploader.destroy(t.resultPublicId).catch(()=>{});
          }
        }
      }catch(e){ console.log("Cloudinary cleanup skip:", e.message); }

      // DB delete - INTERACTIVE transaction - CHILD FIRST
      await prisma.$transaction(async (tx) => {
        // TryOn & Photos
        if(tx.tryOn) await tx.tryOn.deleteMany({ where: { userId: id } }).catch(()=>{});
        if(tx.userPhoto) await tx.userPhoto.deleteMany({ where: { userId: id } }).catch(()=>{});

        // Cart -> CartItem pehle
        try{
          const cart = await tx.cart.findUnique({ where: { userId: id } });
          if(cart){
            if(tx.cartItem) await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
            await tx.cart.delete({ where: { id: cart.id } });
          }
        }catch(e){}

        // Wishlist -> WishlistItem pehle
        try{
          const wishlist = await tx.wishlist.findUnique({ where: { userId: id } });
          if(wishlist){
            if(tx.wishlistItem) await tx.wishlistItem.deleteMany({ where: { wishlistId: wishlist.id } });
            await tx.wishlist.delete({ where: { id: wishlist.id } });
          }
        }catch(e){}

        // Orders
        try{
          const orders = await tx.order.findMany({ where: { userId: id }, select: { id: true } });
          const orderIds = orders.map(o=>o.id);
          if(orderIds.length){
            if(tx.orderItem) await tx.orderItem.deleteMany({ where: { orderId: { in: orderIds } } }).catch(()=>{});
          }
          if(tx.order) await tx.order.deleteMany({ where: { userId: id } }).catch(()=>{});
        }catch(e){}

        // Baaki sab
        if(tx.address) await tx.address.deleteMany({ where: { userId: id } }).catch(()=>{});
        if(tx.review) await tx.review.deleteMany({ where: { userId: id } }).catch(()=>{});
        if(tx.dataAccessLog) await tx.dataAccessLog.deleteMany({ where: { userId: id } }).catch(()=>{});
        if(tx.profile) await tx.profile.deleteMany({ where: { userId: id } }).catch(()=>{});
        if(tx.passwordReset) await tx.passwordReset.deleteMany({ where: { email: user.email } }).catch(()=>{});

        // Last me user
        await tx.user.delete({ where: { id } });
      });

      console.log(`[DELETE-ME] Success id=${id}`);
      res.json({ message: "Account deleted, data erased - DPDP compliance" });
    }catch(e){
      console.error("Delete Error:", e.message, e.stack);
      if(e.name === "JsonWebTokenError") return res.status(401).json({ error: "Invalid token" });
      res.status(500).json({ error: e.message });
    }
  });

  return router;
};