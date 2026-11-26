// const express = require('express');
// const router = express.Router();
// const bcrypt = require('bcryptjs');
// const jwt = require('jsonwebtoken');
// const { z } = require('zod');
// const cloudinary = require('../services/cloudinary');

// module.exports = (prisma, resend, generateToken) => {

//   const otpResendMap = new Map();
//   const otpFailMap = new Map();
//   const loginFailMap = new Map();

//   function checkLoginBlock(ip){
//     const rec = loginFailMap.get(ip);
//     if(rec && rec.blockUntil > Date.now()) return false;
//     return true;
//   }

//   const signupSchema = z.object({
//     email: z.string().email().toLowerCase(),
//     password: z.string().min(8).max(64),
//     name: z.string().min(2).max(50).optional(),
//     phone: z.string().min(10).max(15).optional(), // Phone support added for order rules
//     consent: z.boolean().refine(v=>v===true, {message: "Consent required - DPDP Act"})
//   });
//   const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });

//   router.post('/signup', async (req, res) => {
//     try {
//       const parsed = signupSchema.safeParse(req.body);
//       if(!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
//       const { email, password, name, phone, consent } = parsed.data;

//       const existingUser = await prisma.user.findUnique({ where: { email } });
//       if (existingUser) return res.status(400).json({ error: "User already exists" });

//       const hashedPassword = await bcrypt.hash(password, 10);
//       const newUser = await prisma.user.create({
//         data: {
//           email,
//           password: hashedPassword,
//           role: "USER",
//           consentGivenAt: new Date(),
//           profile: { create: { name, phone } },
//           cart: { create: {} },
//           wishlist: { create: {} }
//         },
//         include: { profile: true }
//       });
//       const token = generateToken(newUser.id, newUser.email);
//       console.log(`[AUTH] Signup success id=${newUser.id}`);
//       res.status(201).json({ message: "Signup successful!", token, user: { id: newUser.id, email: newUser.email, name: newUser.profile?.name || null, phone: newUser.profile?.phone || null } });
//     } catch (error) {
//       console.error("Signup Error:", error.message);
//       res.status(500).json({ error: "Internal Server Error" });
//     }
//   });

//   router.post('/login', async (req, res) => {
//     try {
//       const ip = req.ip;
//       if(!checkLoginBlock(ip)) return res.status(429).json({ error: "Too many failed attempts, try after 15 min" });

//       const parsed = loginSchema.safeParse(req.body);
//       if(!parsed.success) return res.status(400).json({ error: "Invalid data" });
//       const { email, password } = parsed.data;

//       const user = await prisma.user.findUnique({ where: { email }, include: { profile: true } });
//       if (!user) {
//         const rec = loginFailMap.get(ip) || {count:0}; rec.count++; if(rec.count>=5) rec.blockUntil=Date.now()+15*60*1000; loginFailMap.set(ip, rec);
//         return res.status(400).json({ error: "Invalid email or password" });
//       }
//       const isPasswordValid = await bcrypt.compare(password, user.password);
//       if (!isPasswordValid) {
//         const rec = loginFailMap.get(ip) || {count:0}; rec.count++; if(rec.count>=5) rec.blockUntil=Date.now()+15*60*1000; loginFailMap.set(ip, rec);
//         return res.status(400).json({ error: "Invalid email or password" });
//       }
//       loginFailMap.delete(ip);
//       const token = generateToken(user.id, user.email);
//       res.json({ message: "Login successful!", token, user: { id: user.id, email: user.email, name: user.profile?.name, phone: user.profile?.phone, role: user.role } });
//     } catch (error) {
//       console.error("Login Error:", error.message);
//       res.status(500).json({ error: "Internal Server Error" });
//     }
//   });

//   // --- LOGOUT ROUTE ---
//   router.post('/logout', async (req, res) => {
//     try {
//       res.json({ message: "Logged out successfully" });
//     } catch (error) {
//       res.status(500).json({ error: "Internal Server Error" });
//     }
//   });

//   router.post('/forgot-password', async (req, res) => {
//     try {
//       const { email } = req.body;
//       if (!email) return res.status(400).json({ error: "Email is required" });

//       const now = Date.now();
//       const rec = otpResendMap.get(email) || { count:0, firstAt: now };
//       if(now - rec.firstAt > 10*60*1000) { rec.count=0; rec.firstAt=now; }
//       if(rec.count >= 3) return res.status(429).json({ error: "Too many OTP requests, try after 10 min" });
//       rec.count++; otpResendMap.set(email, rec);

//       const user = await prisma.user.findUnique({ where: { email } });
//       if (!user) return res.json({ message: "If email exists, OTP sent" });

//       const otpPlain = Math.floor(100000 + Math.random() * 900000).toString();
//       const otpHash = await bcrypt.hash(otpPlain, 10);
//       const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

//       await prisma.passwordReset.deleteMany({ where: { email } });
//       await prisma.passwordReset.create({ data: { email, otp: otpHash, expiresAt } });

//       const { error } = await resend.emails.send({
//         from: "Syvora <noreply@syvora.in>",
//         replyTo: "syvora.official.acc@gmail.com",
//         to: [email],
//         subject: "Syvora - Password Reset OTP",
//         html: `<div><h2>Password Reset</h2><h1>${otpPlain}</h1><p>Valid for 5 minutes. Don't share.</p></div>`
//       });
//       if (error) return res.status(500).json({ error: "Failed to send OTP" });

//       res.json({ message: "OTP sent if email exists" });
//     } catch (error) {
//       console.error("Forgot Error:", error.message);
//       res.status(500).json({ error: "Internal Server Error" });
//     }
//   });

//   router.post('/verify-otp', async (req, res) => {
//     try {
//       const { email, otp } = req.body;
//       if (!email || !otp) return res.status(400).json({ error: "Email and OTP required" });

//       const block = otpFailMap.get(email);
//       if(block && block.blockUntil > Date.now()) return res.status(429).json({ error: "Too many failed OTP, blocked 30 min" });

//       const resetRecord = await prisma.passwordReset.findFirst({ where: { email } });
//       if (!resetRecord) return res.status(400).json({ error: "Invalid OTP" });
//       if (new Date() > resetRecord.expiresAt) {
//         await prisma.passwordReset.deleteMany({ where: { email } });
//         return res.status(400).json({ error: "OTP expired" });
//       }

//       const valid = await bcrypt.compare(otp, resetRecord.otp);
//       if(!valid){
//         const rec = otpFailMap.get(email) || {count:0}; rec.count++; if(rec.count>=5) rec.blockUntil=Date.now()+30*60*1000; otpFailMap.set(email, rec);
//         return res.status(400).json({ error: "Invalid OTP" });
//       }

//       otpFailMap.delete(email);
//       res.json({ message: "OTP verified" });
//     } catch (error) {
//       res.status(500).json({ error: "Internal Server Error" });
//     }
//   });

//   router.post('/reset-password', async (req, res) => {
//     try {
//       const { email, otp, newPassword } = req.body;
//       if (!email || !otp || !newPassword || newPassword.length < 8) return res.status(400).json({ error: "Invalid data" });
//       const resetRecord = await prisma.passwordReset.findFirst({ where: { email } });
//       if (!resetRecord || new Date() > resetRecord.expiresAt) return res.status(400).json({ error: "Invalid or expired OTP" });
//       const valid = await bcrypt.compare(otp, resetRecord.otp);
//       if(!valid) return res.status(400).json({ error: "Invalid OTP" });

//       const hashedPassword = await bcrypt.hash(newPassword, 10);
//       await prisma.user.update({ where: { email }, data: { password: hashedPassword } });
//       await prisma.passwordReset.deleteMany({ where: { email } });
//       otpFailMap.delete(email); otpResendMap.delete(email);
//       res.json({ message: "Password reset successful!" });
//     } catch (error) {
//       res.status(500).json({ error: "Internal Server Error" });
//     }
//   });

//   // --- DELETE ME - ORDERS KEPT INTACT, USER DATA ERASED ---
//   router.delete('/delete-me', async (req,res)=>{
//     try{
//       const authHeader = req.headers.authorization;
//       if(!authHeader) return res.status(401).json({error: "Unauthorized"});
//       const token = authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : authHeader;
//       if(!process.env.JWT_SECRET) throw new Error("JWT_SECRET missing");
//       const decoded = jwt.verify(token, process.env.JWT_SECRET);
//       const id = Number(decoded.id);

//       const user = await prisma.user.findUnique({ where: { id } });
//       if(!user) return res.status(404).json({error: "User not found"});

//       // Cloudinary cleanup
//       try{
//         if(prisma.userPhoto){
//           const photos = await prisma.userPhoto.findMany({ where: { userId: id } });
//           for(const p of photos){
//             if(p.cloudinaryPublicId) await cloudinary.uploader.destroy(p.cloudinaryPublicId).catch(()=>{});
//           }
//         }
//         if(prisma.tryOn){
//           const tryons = await prisma.tryOn.findMany({ where: { userId: id } });
//           for(const t of tryons){
//             if(t.resultPublicId) await cloudinary.uploader.destroy(t.resultPublicId).catch(()=>{});
//           }
//         }
//       }catch(e){ console.log("Cloudinary cleanup skip:", e.message); }

//       // DB delete transaction (Preserving orders for compliance)
//       await prisma.$transaction(async (tx) => {
//         if(tx.tryOn) await tx.tryOn.deleteMany({ where: { userId: id } }).catch(()=>{});
//         if(tx.userPhoto) await tx.userPhoto.deleteMany({ where: { userId: id } }).catch(()=>{});

//         try{
//           const cart = await tx.cart.findUnique({ where: { userId: id } });
//           if(cart){
//             if(tx.cartItem) await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
//             await tx.cart.delete({ where: { id: cart.id } });
//           }
//         }catch(e){}

//         try{
//           const wishlist = await tx.wishlist.findUnique({ where: { userId: id } });
//           if(wishlist){
//             if(tx.wishlistItem) await tx.wishlistItem.deleteMany({ where: { wishlistId: wishlist.id } });
//             await tx.wishlist.delete({ where: { id: wishlist.id } });
//           }
//         }catch(e){}

//         if(tx.address) await tx.address.deleteMany({ where: { userId: id } }).catch(()=>{});
//         if(tx.review) await tx.review.deleteMany({ where: { userId: id } }).catch(()=>{});
//         if(tx.dataAccessLog) await tx.dataAccessLog.deleteMany({ where: { userId: id } }).catch(()=>{});
//         if(tx.profile) await tx.profile.deleteMany({ where: { userId: id } }).catch(()=>{});
//         if(tx.passwordReset) await tx.passwordReset.deleteMany({ where: { email: user.email } }).catch(()=>{});

//         await tx.user.delete({ where: { id } });
//       });

//       console.log(`[DELETE-ME] Success id=${id}`);
//       res.json({ message: "Account deleted, personal data erased - Orders preserved for compliance" });
//     }catch(e){
//       console.error("Delete Error:", e.message, e.stack);
//       if(e.name === "JsonWebTokenError") return res.status(401).json({ error: "Invalid token" });
//       res.status(500).json({ error: e.message });
//     }
//   });

//   return router;
// };

















// const express = require('express');
// const router = express.Router();
// const bcrypt = require('bcryptjs');
// const jwt = require('jsonwebtoken');
// const { z } = require('zod');
// const cloudinary = require('../services/cloudinary');

// const DISPOSABLE_DOMAINS = new Set([
//   'tempmail.com',
//   '10minutemail.com',
//   'guerrillamail.com',
//   'mailinator.com',
//   'yopmail.com',
//   'throwaway.email',
//   'getnada.com',
//   'temp-mail.org',
//   'dispostable.com',
//   'fakeinbox.com',
// ]);

// const COMMON_EMAIL_TYPOS = {
//   'gmial.com': 'gmail.com',
//   'gamil.com': 'gmail.com',
//   'gmil.com': 'gmail.com',
//   'gnil.com': 'gmail.com',
//   'gmail.co': 'gmail.com',
//   'yahooo.com': 'yahoo.com',
//   'yaho.com': 'yahoo.com',
//   'outlok.com': 'outlook.com',
//   'hotmal.com': 'hotmail.com',
// };

// const TRUSTED_DOMAINS = [
//   'gmail.com',
//   'yahoo.com',
//   'outlook.com',
//   'hotmail.com',
//   'icloud.com',
//   'proton.me',
//   'rediffmail.com',
// ];

// function levenshteinDistance(a, b) {
//   const dp = Array.from({ length: a.length + 1 }, (_, i) => [i]);
//   for (let j = 1; j <= b.length; j++) dp[0][j] = j;

//   for (let i = 1; i <= a.length; i++) {
//     for (let j = 1; j <= b.length; j++) {
//       const cost = a[i - 1] === b[j - 1] ? 0 : 1;
//       dp[i][j] = Math.min(
//         dp[i - 1][j] + 1,
//         dp[i][j - 1] + 1,
//         dp[i - 1][j - 1] + cost
//       );
//     }
//   }
//   return dp[a.length][b.length];
// }

// function findClosestTrustedDomain(domain) {
//   if (TRUSTED_DOMAINS.includes(domain)) return null;

//   for (const trusted of TRUSTED_DOMAINS) {
//     if (levenshteinDistance(domain, trusted) === 1) {
//       return trusted;
//     }
//   }
//   return null;
// }

// const SIGNUP_OTP_PREFIX = 'signup_otp:';
// const getSignupOtpKey = (email) => `${SIGNUP_OTP_PREFIX}${email.toLowerCase().trim()}`;

// module.exports = (prisma, resend, generateToken) => {

//   const otpResendMap = new Map();
//   const otpFailMap = new Map();
//   const loginFailMap = new Map();
//   const signupOtpFailMap = new Map();
//   const signupOtpResendMap = new Map();

//   function checkLoginBlock(ip){
//     const rec = loginFailMap.get(ip);
//     if(rec && rec.blockUntil > Date.now()) return false;
//     return true;
//   }

//   function validateEmailDomain(rawEmail) {
//     const email = rawEmail.toLowerCase().trim();
//     const localPart = email.split('@')[0] || '';
//     const domain = email.split('@')[1] || '';
//     if (!localPart || !domain || !domain.includes('.')) {
//       return { valid: false, error: "Please enter a valid email address" };
//     }
//     const mappedDomain = COMMON_EMAIL_TYPOS[domain] || findClosestTrustedDomain(domain);
//     if (mappedDomain) {
//       return {
//         valid: false,
//         error: `Did you mean ${localPart}@${mappedDomain}? Please check your email spelling.`,
//       };
//     }
//     if (DISPOSABLE_DOMAINS.has(domain)) {
//       return { valid: false, error: "Temporary or disposable email addresses are not allowed" };
//     }
//     return { valid: true, email };
//   }

//   async function sendSignupVerificationOtp(email, payload) {
//     const otpPlain = Math.floor(100000 + Math.random() * 900000).toString();
//     const otpHash = await bcrypt.hash(otpPlain, 10);
//     const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

//     const recordData = JSON.stringify({
//       otpHash,
//       name: payload.name,
//       phone: payload.phone,
//       passwordHash: payload.passwordHash,
//       consent: true,
//     });

//     const key = getSignupOtpKey(email);
//     await prisma.passwordReset.deleteMany({ where: { email: key } });
//     await prisma.passwordReset.create({
//       data: {
//         email: key,
//         otp: recordData,
//         expiresAt,
//       },
//     });

//     const { error } = await resend.emails.send({
//       from: "Syvora <noreply@syvora.in>",
//       replyTo: "syvora.official.acc@gmail.com",
//       to: [email],
//       subject: "Syvora - Verify Your Email OTP",
//       html: `<div><h2>Verify Your Syvora Account</h2><p>Your signup verification OTP is:</p><h1>${otpPlain}</h1><p>Valid for 10 minutes. Do not share this code with anyone.</p></div>`,
//     });

//     if (error) {
//       await prisma.passwordReset.deleteMany({ where: { email: key } });
//       throw new Error("Could not send verification email. Please check your email address and try again.");
//     }
//   }

//   const signupSchema = z.object({
//     email: z.string().email().toLowerCase(),
//     password: z.string().min(8).max(64),
//     name: z.string().min(2).max(50).optional(),
//     phone: z.string().min(10).max(15).optional(), // Phone support added for order rules
//     consent: z.boolean().refine(v=>v===true, {message: "Consent required - DPDP Act"})
//   });
//   const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });

//   // --- SIGNUP STEP 1: SEND EMAIL OTP ---
//   router.post('/signup', async (req, res) => {
//     try {
//       const parsed = signupSchema.safeParse(req.body);
//       if(!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
//       const { email: rawEmail, password, name, phone, consent } = parsed.data;

//       const domainCheck = validateEmailDomain(rawEmail);
//       if (!domainCheck.valid) {
//         return res.status(400).json({ error: domainCheck.error });
//       }
//       const email = domainCheck.email;

//       const existingUser = await prisma.user.findUnique({ where: { email } });
//       if (existingUser) return res.status(400).json({ error: "User already exists" });

//       const hashedPassword = await bcrypt.hash(password, 10);
//       await sendSignupVerificationOtp(email, {
//         name: name || null,
//         phone: phone || null,
//         passwordHash: hashedPassword,
//         consent,
//       });

//       console.log(`[AUTH] Signup OTP sent to ${email}`);
//       res.status(200).json({
//         message: "Verification OTP sent to your email. Please verify to complete signup.",
//         requiresOtp: true,
//         email,
//       });
//     } catch (error) {
//       console.error("Signup Error:", error.message);
//       if (error.message && error.message.includes("Could not send verification email")) {
//         return res.status(400).json({ error: error.message });
//       }
//       res.status(500).json({ error: "Internal Server Error" });
//     }
//   });

//   // --- SIGNUP STEP 2: VERIFY EMAIL OTP & CREATE ACCOUNT ---
//   router.post('/verify-signup-otp', async (req, res) => {
//     try {
//       const rawEmail = (req.body?.email || '').toString().toLowerCase().trim();
//       const otp = (req.body?.otp || '').toString().trim();

//       if (!rawEmail || !otp) {
//         return res.status(400).json({ error: "Email and OTP are required" });
//       }

//       const failRec = signupOtpFailMap.get(rawEmail);
//       if (failRec && failRec.blockUntil > Date.now()) {
//         return res.status(429).json({ error: "Too many failed OTP attempts. Try after 30 minutes." });
//       }

//       const key = getSignupOtpKey(rawEmail);
//       const pendingRecord = await prisma.passwordReset.findFirst({ where: { email: key } });
//       if (!pendingRecord) {
//         return res.status(400).json({ error: "Invalid or expired OTP. Please sign up again." });
//       }

//       if (new Date() > pendingRecord.expiresAt) {
//         await prisma.passwordReset.deleteMany({ where: { email: key } });
//         return res.status(400).json({ error: "OTP has expired. Please request a new OTP." });
//       }

//       let parsedPayload;
//       try {
//         parsedPayload = JSON.parse(pendingRecord.otp);
//       } catch (e) {
//         return res.status(400).json({ error: "Invalid OTP session. Please sign up again." });
//       }

//       const isValidOtp = await bcrypt.compare(otp, parsedPayload.otpHash);
//       if (!isValidOtp) {
//         const rec = signupOtpFailMap.get(rawEmail) || { count: 0 };
//         rec.count++;
//         if (rec.count >= 5) rec.blockUntil = Date.now() + 30 * 60 * 1000;
//         signupOtpFailMap.set(rawEmail, rec);
//         return res.status(400).json({ error: "Invalid OTP" });
//       }

//       const existingUser = await prisma.user.findUnique({ where: { email: rawEmail } });
//       if (existingUser) {
//         await prisma.passwordReset.deleteMany({ where: { email: key } });
//         return res.status(400).json({ error: "User already exists" });
//       }

//       const newUser = await prisma.user.create({
//         data: {
//           email: rawEmail,
//           password: parsedPayload.passwordHash,
//           role: "USER",
//           consentGivenAt: new Date(),
//           profile: { create: { name: parsedPayload.name, phone: parsedPayload.phone } },
//           cart: { create: {} },
//           wishlist: { create: {} }
//         },
//         include: { profile: true }
//       });

//       await prisma.passwordReset.deleteMany({ where: { email: key } });
//       signupOtpFailMap.delete(rawEmail);
//       signupOtpResendMap.delete(rawEmail);

//       const token = generateToken(newUser.id, newUser.email, newUser.role);
//       console.log(`[AUTH] Signup verified & created id=${newUser.id}`);
//       res.status(201).json({
//         message: "Signup successful!",
//         token,
//         user: {
//           id: newUser.id,
//           email: newUser.email,
//           name: newUser.profile?.name || null,
//           phone: newUser.profile?.phone || null
//         }
//       });
//     } catch (error) {
//       console.error("Verify Signup OTP Error:", error.message);
//       res.status(500).json({ error: "Internal Server Error" });
//     }
//   });

//   // --- SIGNUP RESEND OTP ---
//   router.post('/resend-signup-otp', async (req, res) => {
//     try {
//       const rawEmail = (req.body?.email || '').toString().toLowerCase().trim();
//       if (!rawEmail) return res.status(400).json({ error: "Email is required" });

//       const now = Date.now();
//       const rec = signupOtpResendMap.get(rawEmail) || { count: 0, firstAt: now };
//       if (now - rec.firstAt > 10 * 60 * 1000) { rec.count = 0; rec.firstAt = now; }
//       if (rec.count >= 3) return res.status(429).json({ error: "Too many OTP requests. Try after 10 minutes." });
//       rec.count++;
//       signupOtpResendMap.set(rawEmail, rec);

//       const key = getSignupOtpKey(rawEmail);
//       const pendingRecord = await prisma.passwordReset.findFirst({ where: { email: key } });
//       if (!pendingRecord) {
//         return res.status(400).json({ error: "No pending signup found for this email. Please submit signup form first." });
//       }

//       let parsedPayload;
//       try {
//         parsedPayload = JSON.parse(pendingRecord.otp);
//       } catch (e) {
//         return res.status(400).json({ error: "Invalid pending signup data." });
//       }

//       await sendSignupVerificationOtp(rawEmail, parsedPayload);
//       res.json({ message: "New verification OTP sent to your email." });
//     } catch (error) {
//       console.error("Resend Signup OTP Error:", error.message);
//       res.status(500).json({ error: "Failed to resend OTP" });
//     }
//   });

//   router.post('/login', async (req, res) => {
//     try {
//       const ip = req.ip;
//       if(!checkLoginBlock(ip)) return res.status(429).json({ error: "Too many failed attempts, try after 15 min" });

//       const parsed = loginSchema.safeParse(req.body);
//       if(!parsed.success) return res.status(400).json({ error: "Invalid data" });
//       const { email, password } = parsed.data;

//       const user = await prisma.user.findUnique({ where: { email }, include: { profile: true } });
//       if (!user) {
//         const rec = loginFailMap.get(ip) || {count:0}; rec.count++; if(rec.count>=5) rec.blockUntil=Date.now()+15*60*1000; loginFailMap.set(ip, rec);
//         return res.status(400).json({ error: "Invalid email or password" });
//       }
//       const isPasswordValid = await bcrypt.compare(password, user.password);
//       if (!isPasswordValid) {
//         const rec = loginFailMap.get(ip) || {count:0}; rec.count++; if(rec.count>=5) rec.blockUntil=Date.now()+15*60*1000; loginFailMap.set(ip, rec);
//         return res.status(400).json({ error: "Invalid email or password" });
//       }
//       loginFailMap.delete(ip);
//       const token = generateToken(user.id, user.email, user.role);
//       res.json({ message: "Login successful!", token, user: { id: user.id, email: user.email, name: user.profile?.name, phone: user.profile?.phone, role: user.role } });
//     } catch (error) {
//       console.error("Login Error:", error.message);
//       res.status(500).json({ error: "Internal Server Error" });
//     }
//   });

//   // --- SAVE / UPDATE FCM PUSH TOKEN ---
//   router.post('/fcm-token', async (req, res) => {
//     try {
//       const authHeader = req.headers.authorization;
//       if (!authHeader || !authHeader.startsWith('Bearer ')) {
//         return res.status(401).json({ error: "Unauthorized" });
//       }
//       const token = authHeader.split(' ')[1];
//       const decoded = jwt.verify(token, process.env.JWT_SECRET);
//       const userId = Number(decoded.id);

//       const fcmToken = typeof req.body?.fcmToken === 'string' ? req.body.fcmToken.trim() : '';
//       const rawPlatform = typeof req.body?.platform === 'string' ? req.body.platform.trim().toLowerCase() : null;
//       const allowedPlatforms = ['android', 'ios', 'web'];
//       const platform = rawPlatform && allowedPlatforms.includes(rawPlatform) ? rawPlatform : null;

//       if (!fcmToken || fcmToken.length > 500) {
//         return res.status(400).json({ error: "Valid fcmToken is required" });
//       }

//       const existingUser = await prisma.user.findUnique({
//         where: { id: userId },
//         select: { id: true }
//       });
//       if (!existingUser) {
//         return res.status(404).json({ error: "User not found" });
//       }

//       await prisma.user.update({
//         where: { id: userId },
//         data: {
//           fcmToken,
//           ...(platform ? { platform } : {})
//         }
//       });

//       return res.json({ message: "FCM token synced successfully" });
//     } catch (error) {
//       if (error.name === "JsonWebTokenError" || error.name === "TokenExpiredError") {
//         return res.status(401).json({ error: "Invalid token" });
//       }
//       console.error("FCM Token Sync Error:", error.message);
//       return res.status(500).json({ error: "Internal Server Error" });
//     }
//   });

//   // --- LOGOUT ROUTE (CLEARS FCM TOKEN IF VALID TOKEN PROVIDED) ---
//   router.post('/logout', async (req, res) => {
//     try {
//       const authHeader = req.headers.authorization;
//       if (authHeader && authHeader.startsWith('Bearer ')) {
//         const token = authHeader.split(' ')[1];
//         try {
//           const decoded = jwt.verify(token, process.env.JWT_SECRET);
//           if (decoded?.id) {
//             await prisma.user.updateMany({
//               where: { id: Number(decoded.id) },
//               data: { fcmToken: null, platform: null }
//             });
//           }
//         } catch (_) {
//           // Ignore invalid/expired token on logout so user can always log out cleanly
//         }
//       }
//       res.json({ message: "Logged out successfully" });
//     } catch (error) {
//       res.status(500).json({ error: "Internal Server Error" });
//     }
//   });

  
//   router.post('/forgot-password', async (req, res) => {
//     try {
//       const { email } = req.body;
//       if (!email) return res.status(400).json({ error: "Email is required" });

//       const now = Date.now();
//       const rec = otpResendMap.get(email) || { count:0, firstAt: now };
//       if(now - rec.firstAt > 10*60*1000) { rec.count=0; rec.firstAt=now; }
//       if(rec.count >= 3) return res.status(429).json({ error: "Too many OTP requests, try after 10 min" });
//       rec.count++; otpResendMap.set(email, rec);

//       const user = await prisma.user.findUnique({ where: { email } });
//       if (!user) return res.json({ message: "If email exists, OTP sent" });

//       const otpPlain = Math.floor(100000 + Math.random() * 900000).toString();
//       const otpHash = await bcrypt.hash(otpPlain, 10);
//       const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

//       await prisma.passwordReset.deleteMany({ where: { email } });
//       await prisma.passwordReset.create({ data: { email, otp: otpHash, expiresAt } });

//       const { error } = await resend.emails.send({
//         from: "Syvora <noreply@syvora.in>",
//         replyTo: "syvora.official.acc@gmail.com",
//         to: [email],
//         subject: "Syvora - Password Reset OTP",
//         html: `<div><h2>Password Reset</h2><h1>${otpPlain}</h1><p>Valid for 5 minutes. Don't share.</p></div>`
//       });
//       if (error) return res.status(500).json({ error: "Failed to send OTP" });

//       res.json({ message: "OTP sent if email exists" });
//     } catch (error) {
//       console.error("Forgot Error:", error.message);
//       res.status(500).json({ error: "Internal Server Error" });
//     }
//   });

//   router.post('/verify-otp', async (req, res) => {
//     try {
//       const { email, otp } = req.body;
//       if (!email || !otp) return res.status(400).json({ error: "Email and OTP required" });

//       const block = otpFailMap.get(email);
//       if(block && block.blockUntil > Date.now()) return res.status(429).json({ error: "Too many failed OTP, blocked 30 min" });

//       const resetRecord = await prisma.passwordReset.findFirst({ where: { email } });
//       if (!resetRecord) return res.status(400).json({ error: "Invalid OTP" });
//       if (new Date() > resetRecord.expiresAt) {
//         await prisma.passwordReset.deleteMany({ where: { email } });
//         return res.status(400).json({ error: "OTP expired" });
//       }

//       const valid = await bcrypt.compare(otp, resetRecord.otp);
//       if(!valid){
//         const rec = otpFailMap.get(email) || {count:0}; rec.count++; if(rec.count>=5) rec.blockUntil=Date.now()+30*60*1000; otpFailMap.set(email, rec);
//         return res.status(400).json({ error: "Invalid OTP" });
//       }

//       otpFailMap.delete(email);
//       res.json({ message: "OTP verified" });
//     } catch (error) {
//       res.status(500).json({ error: "Internal Server Error" });
//     }
//   });

//   router.post('/reset-password', async (req, res) => {
//     try {
//       const { email, otp, newPassword } = req.body;
//       if (!email || !otp || !newPassword || newPassword.length < 8) return res.status(400).json({ error: "Invalid data" });
//       const resetRecord = await prisma.passwordReset.findFirst({ where: { email } });
//       if (!resetRecord || new Date() > resetRecord.expiresAt) return res.status(400).json({ error: "Invalid or expired OTP" });
//       const valid = await bcrypt.compare(otp, resetRecord.otp);
//       if(!valid) return res.status(400).json({ error: "Invalid OTP" });

//       const hashedPassword = await bcrypt.hash(newPassword, 10);
//       await prisma.user.update({ where: { email }, data: { password: hashedPassword } });
//       await prisma.passwordReset.deleteMany({ where: { email } });
//       otpFailMap.delete(email); otpResendMap.delete(email);
//       res.json({ message: "Password reset successful!" });
//     } catch (error) {
//       res.status(500).json({ error: "Internal Server Error" });
//     }
//   });

//   // --- DELETE ME - ORDERS KEPT INTACT, USER DATA ERASED ---
//   router.delete('/delete-me', async (req,res)=>{
//     try{
//       const authHeader = req.headers.authorization;
//       if(!authHeader) return res.status(401).json({error: "Unauthorized"});
//       const token = authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : authHeader;
//       if(!process.env.JWT_SECRET) throw new Error("JWT_SECRET missing");
//       const decoded = jwt.verify(token, process.env.JWT_SECRET);
//       const id = Number(decoded.id);

//       const user = await prisma.user.findUnique({ where: { id } });
//       if(!user) return res.status(404).json({error: "User not found"});

//       // Cloudinary cleanup
//       try{
//         if(prisma.userPhoto){
//           const photos = await prisma.userPhoto.findMany({ where: { userId: id } });
//           for(const p of photos){
//             if(p.cloudinaryPublicId) await cloudinary.uploader.destroy(p.cloudinaryPublicId).catch(()=>{});
//           }
//         }
//         if(prisma.tryOn){
//           const tryons = await prisma.tryOn.findMany({ where: { userId: id } });
//           for(const t of tryons){
//             if(t.resultPublicId) await cloudinary.uploader.destroy(t.resultPublicId).catch(()=>{});
//           }
//         }
//       }catch(e){ console.log("Cloudinary cleanup skip:", e.message); }

//       // DB delete transaction (Preserving orders for compliance)
//       await prisma.$transaction(async (tx) => {
//         if(tx.tryOn) await tx.tryOn.deleteMany({ where: { userId: id } }).catch(()=>{});
//         if(tx.userPhoto) await tx.userPhoto.deleteMany({ where: { userId: id } }).catch(()=>{});

//         try{
//           const cart = await tx.cart.findUnique({ where: { userId: id } });
//           if(cart){
//             if(tx.cartItem) await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
//             await tx.cart.delete({ where: { id: cart.id } });
//           }
//         }catch(e){}

//         try{
//           const wishlist = await tx.wishlist.findUnique({ where: { userId: id } });
//           if(wishlist){
//             if(tx.wishlistItem) await tx.wishlistItem.deleteMany({ where: { wishlistId: wishlist.id } });
//             await tx.wishlist.delete({ where: { id: wishlist.id } });
//           }
//         }catch(e){}

//         if(tx.address) await tx.address.deleteMany({ where: { userId: id } }).catch(()=>{});
//         if(tx.review) await tx.review.deleteMany({ where: { userId: id } }).catch(()=>{});
//         if(tx.dataAccessLog) await tx.dataAccessLog.deleteMany({ where: { userId: id } }).catch(()=>{});
//         if(tx.profile) await tx.profile.deleteMany({ where: { userId: id } }).catch(()=>{});
//         if(tx.passwordReset) await tx.passwordReset.deleteMany({ where: { email: user.email } }).catch(()=>{});

//         await tx.user.delete({ where: { id } });
//       });

//       console.log(`[DELETE-ME] Success id=${id}`);
//       res.json({ message: "Account deleted, personal data erased - Orders preserved for compliance" });
//     }catch(e){
//       console.error("Delete Error:", e.message, e.stack);
//       if(e.name === "JsonWebTokenError" || e.name === "TokenExpiredError") {
//         return res.status(401).json({ error: "Token expired or invalid" });
//       }
//       res.status(500).json({ error: e.message });
//     }
//   });

//   return router;
// };





















const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const cloudinary = require('../services/cloudinary');

const DISPOSABLE_DOMAINS = new Set([
  'tempmail.com',
  '10minutemail.com',
  'guerrillamail.com',
  'mailinator.com',
  'yopmail.com',
  'throwaway.email',
  'getnada.com',
  'temp-mail.org',
  'dispostable.com',
  'fakeinbox.com',
]);

const COMMON_EMAIL_TYPOS = {
  'gmial.com': 'gmail.com',
  'gamil.com': 'gmail.com',
  'gmil.com': 'gmail.com',
  'gnil.com': 'gmail.com',
  'gmail.co': 'gmail.com',
  'yahooo.com': 'yahoo.com',
  'yaho.com': 'yahoo.com',
  'outlok.com': 'outlook.com',
  'hotmal.com': 'hotmail.com',
};

const TRUSTED_DOMAINS = [
  'gmail.com',
  'yahoo.com',
  'outlook.com',
  'hotmail.com',
  'icloud.com',
  'proton.me',
  'rediffmail.com',
];

function levenshteinDistance(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[a.length][b.length];
}

function findClosestTrustedDomain(domain) {
  if (TRUSTED_DOMAINS.includes(domain)) return null;

  for (const trusted of TRUSTED_DOMAINS) {
    if (levenshteinDistance(domain, trusted) === 1) {
      return trusted;
    }
  }
  return null;
}

function normalizeEmail(raw) {
  return String(raw || '').toLowerCase().trim();
}

const SIGNUP_OTP_PREFIX = 'signup_otp:';
const getSignupOtpKey = (email) => `${SIGNUP_OTP_PREFIX}${normalizeEmail(email)}`;

module.exports = (prisma, resend, generateToken) => {
  const otpResendMap = new Map();
  const otpFailMap = new Map();
  const loginFailMap = new Map();
  const signupOtpFailMap = new Map();
  const signupOtpResendMap = new Map();

  function checkLoginBlock(ip) {
    const rec = loginFailMap.get(ip);
    if (rec && rec.blockUntil > Date.now()) return false;
    return true;
  }

  function validateEmailDomain(rawEmail) {
    const email = normalizeEmail(rawEmail);
    const localPart = email.split('@')[0] || '';
    const domain = email.split('@')[1] || '';
    if (!localPart || !domain || !domain.includes('.')) {
      return { valid: false, error: "Please enter a valid email address" };
    }
    const mappedDomain = COMMON_EMAIL_TYPOS[domain] || findClosestTrustedDomain(domain);
    if (mappedDomain) {
      return {
        valid: false,
        error: `Did you mean ${localPart}@${mappedDomain}? Please check your email spelling.`,
      };
    }
    if (DISPOSABLE_DOMAINS.has(domain)) {
      return { valid: false, error: "Temporary or disposable email addresses are not allowed" };
    }
    return { valid: true, email };
  }

  async function sendSignupVerificationOtp(email, payload) {
    const cleanEmail = normalizeEmail(email);
    const otpPlain = Math.floor(100000 + Math.random() * 900000).toString();
    const otpHash = await bcrypt.hash(otpPlain, 10);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    const recordData = JSON.stringify({
      otpHash,
      name: payload.name,
      phone: payload.phone,
      passwordHash: payload.passwordHash,
      consent: true,
    });

    const key = getSignupOtpKey(cleanEmail);
    await prisma.passwordReset.deleteMany({ where: { email: key } });
    await prisma.passwordReset.create({
      data: {
        email: key,
        otp: recordData,
        expiresAt,
      },
    });

    const { error } = await resend.emails.send({
      from: "Syvora <noreply@syvora.in>",
      replyTo: "syvora.official.acc@gmail.com",
      to: [cleanEmail],
      subject: "Syvora - Verify Your Email OTP",
      html: `<div><h2>Verify Your Syvora Account</h2><p>Your signup verification OTP is:</p><h1>${otpPlain}</h1><p>Valid for 10 minutes. Do not share this code with anyone.</p></div>`,
    });

    if (error) {
      await prisma.passwordReset.deleteMany({ where: { email: key } });
      throw new Error("Could not send verification email. Please check your email address and try again.");
    }
  }

  const signupSchema = z.object({
    email: z.string().email().toLowerCase(),
    password: z.string().min(8).max(64),
    name: z.string().min(2).max(50).optional(),
    phone: z.string().min(10).max(15).optional(),
    consent: z.boolean().refine((v) => v === true, { message: "Consent required - DPDP Act" })
  });
  const loginSchema = z.object({
    email: z.string().email().toLowerCase(),
    password: z.string().min(1)
  });

  // --- SIGNUP STEP 1: SEND EMAIL OTP ---
  router.post('/signup', async (req, res) => {
    try {
      const parsed = signupSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
      const { email: rawEmail, password, name, phone, consent } = parsed.data;

      const domainCheck = validateEmailDomain(rawEmail);
      if (!domainCheck.valid) {
        return res.status(400).json({ error: domainCheck.error });
      }
      const email = domainCheck.email;

      const existingUser = await prisma.user.findUnique({ where: { email } });
      if (existingUser) return res.status(400).json({ error: "User already exists" });

      const hashedPassword = await bcrypt.hash(password, 10);
      await sendSignupVerificationOtp(email, {
        name: name ? name.trim() : null,
        phone: phone ? phone.trim() : null,
        passwordHash: hashedPassword,
        consent,
      });

      console.log(`[AUTH] Signup OTP sent to ${email}`);
      res.status(200).json({
        message: "Verification OTP sent to your email. Please verify to complete signup.",
        requiresOtp: true,
        email,
      });
    } catch (error) {
      console.error("Signup Error:", error.message);
      if (error.message && error.message.includes("Could not send verification email")) {
        return res.status(400).json({ error: error.message });
      }
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  // --- SIGNUP STEP 2: VERIFY EMAIL OTP & CREATE ACCOUNT ---
  router.post('/verify-signup-otp', async (req, res) => {
    try {
      const rawEmail = normalizeEmail(req.body?.email);
      const otp = String(req.body?.otp || '').trim();

      if (!rawEmail || !otp) {
        return res.status(400).json({ error: "Email and OTP are required" });
      }

      const failRec = signupOtpFailMap.get(rawEmail);
      if (failRec && failRec.blockUntil > Date.now()) {
        return res.status(429).json({ error: "Too many failed OTP attempts. Try after 30 minutes." });
      }

      const key = getSignupOtpKey(rawEmail);
      const pendingRecord = await prisma.passwordReset.findFirst({ where: { email: key } });
      if (!pendingRecord) {
        return res.status(400).json({ error: "Invalid or expired OTP. Please sign up again." });
      }

      if (new Date() > pendingRecord.expiresAt) {
        await prisma.passwordReset.deleteMany({ where: { email: key } });
        return res.status(400).json({ error: "OTP has expired. Please request a new OTP." });
      }

      let parsedPayload;
      try {
        parsedPayload = JSON.parse(pendingRecord.otp);
      } catch (e) {
        return res.status(400).json({ error: "Invalid OTP session. Please sign up again." });
      }

      const isValidOtp = await bcrypt.compare(otp, parsedPayload.otpHash);
      if (!isValidOtp) {
        const rec = signupOtpFailMap.get(rawEmail) || { count: 0 };
        rec.count++;
        if (rec.count >= 5) rec.blockUntil = Date.now() + 30 * 60 * 1000;
        signupOtpFailMap.set(rawEmail, rec);
        return res.status(400).json({ error: "Invalid OTP" });
      }

      const existingUser = await prisma.user.findUnique({ where: { email: rawEmail } });
      if (existingUser) {
        await prisma.passwordReset.deleteMany({ where: { email: key } });
        return res.status(400).json({ error: "User already exists" });
      }

      const newUser = await prisma.user.create({
        data: {
          email: rawEmail,
          password: parsedPayload.passwordHash,
          role: "USER",
          consentGivenAt: new Date(),
          profile: { create: { name: parsedPayload.name, phone: parsedPayload.phone } },
          cart: { create: {} },
          wishlist: { create: {} }
        },
        include: { profile: true }
      });

      await prisma.passwordReset.deleteMany({ where: { email: key } });
      signupOtpFailMap.delete(rawEmail);
      signupOtpResendMap.delete(rawEmail);

      const token = generateToken(newUser.id, newUser.email, newUser.role);
      console.log(`[AUTH] Signup verified & created id=${newUser.id}`);
      res.status(201).json({
        message: "Signup successful!",
        token,
        user: {
          id: newUser.id,
          email: newUser.email,
          name: newUser.profile?.name || null,
          phone: newUser.profile?.phone || null
        }
      });
    } catch (error) {
      console.error("Verify Signup OTP Error:", error.message);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  // --- SIGNUP RESEND OTP ---
  router.post('/resend-signup-otp', async (req, res) => {
    try {
      const rawEmail = normalizeEmail(req.body?.email);
      if (!rawEmail) return res.status(400).json({ error: "Email is required" });

      const now = Date.now();
      const rec = signupOtpResendMap.get(rawEmail) || { count: 0, firstAt: now };
      if (now - rec.firstAt > 10 * 60 * 1000) { rec.count = 0; rec.firstAt = now; }
      if (rec.count >= 3) return res.status(429).json({ error: "Too many OTP requests. Try after 10 minutes." });
      rec.count++;
      signupOtpResendMap.set(rawEmail, rec);

      const key = getSignupOtpKey(rawEmail);
      const pendingRecord = await prisma.passwordReset.findFirst({ where: { email: key } });
      if (!pendingRecord) {
        return res.status(400).json({ error: "No pending signup found for this email. Please submit signup form first." });
      }

      let parsedPayload;
      try {
        parsedPayload = JSON.parse(pendingRecord.otp);
      } catch (e) {
        return res.status(400).json({ error: "Invalid pending signup data." });
      }

      await sendSignupVerificationOtp(rawEmail, parsedPayload);
      res.json({ message: "New verification OTP sent to your email." });
    } catch (error) {
      console.error("Resend Signup OTP Error:", error.message);
      res.status(500).json({ error: "Failed to resend OTP" });
    }
  });

  router.post('/login', async (req, res) => {
    try {
      const ip = req.ip;
      if (!checkLoginBlock(ip)) return res.status(429).json({ error: "Too many failed attempts, try after 15 min" });

      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Invalid data" });
      const { email, password } = parsed.data;

      const user = await prisma.user.findUnique({ where: { email }, include: { profile: true } });
      if (!user) {
        const rec = loginFailMap.get(ip) || { count: 0 };
        rec.count++;
        if (rec.count >= 5) rec.blockUntil = Date.now() + 15 * 60 * 1000;
        loginFailMap.set(ip, rec);
        return res.status(400).json({ error: "Invalid email or password" });
      }
      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        const rec = loginFailMap.get(ip) || { count: 0 };
        rec.count++;
        if (rec.count >= 5) rec.blockUntil = Date.now() + 15 * 60 * 1000;
        loginFailMap.set(ip, rec);
        return res.status(400).json({ error: "Invalid email or password" });
      }
      loginFailMap.delete(ip);
      const token = generateToken(user.id, user.email, user.role);
      res.json({
        message: "Login successful!",
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.profile?.name,
          phone: user.profile?.phone,
          role: user.role
        }
      });
    } catch (error) {
      console.error("Login Error:", error.message);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  // --- SAVE / UPDATE FCM PUSH TOKEN ---
  router.post('/fcm-token', async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const userId = Number(decoded.id);

      const fcmToken = typeof req.body?.fcmToken === 'string' ? req.body.fcmToken.trim() : '';
      const rawPlatform = typeof req.body?.platform === 'string' ? req.body.platform.trim().toLowerCase() : null;
      const allowedPlatforms = ['android', 'ios', 'web'];
      const platform = rawPlatform && allowedPlatforms.includes(rawPlatform) ? rawPlatform : null;

      if (!fcmToken || fcmToken.length > 500) {
        return res.status(400).json({ error: "Valid fcmToken is required" });
      }

      const existingUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true }
      });
      if (!existingUser) {
        return res.status(404).json({ error: "User not found" });
      }

      await prisma.user.update({
        where: { id: userId },
        data: {
          fcmToken,
          ...(platform ? { platform } : {})
        }
      });

      return res.json({ message: "FCM token synced successfully" });
    } catch (error) {
      if (error.name === "JsonWebTokenError" || error.name === "TokenExpiredError") {
        return res.status(401).json({ error: "Invalid token" });
      }
      console.error("FCM Token Sync Error:", error.message);
      return res.status(500).json({ error: "Internal Server Error" });
    }
  });

  // --- LOGOUT ROUTE (CLEARS FCM TOKEN IF VALID TOKEN PROVIDED) ---
  router.post('/logout', async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        try {
          const decoded = jwt.verify(token, process.env.JWT_SECRET);
          if (decoded?.id) {
            await prisma.user.updateMany({
              where: { id: Number(decoded.id) },
              data: { fcmToken: null, platform: null }
            });
          }
        } catch (_) {
          // Ignore invalid/expired token on logout so user can always log out cleanly
        }
      }
      res.json({ message: "Logged out successfully" });
    } catch (error) {
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  router.post('/forgot-password', async (req, res) => {
    try {
      const email = normalizeEmail(req.body?.email);
      if (!email) return res.status(400).json({ error: "Email is required" });

      const now = Date.now();
      const rec = otpResendMap.get(email) || { count: 0, firstAt: now };
      if (now - rec.firstAt > 10 * 60 * 1000) { rec.count = 0; rec.firstAt = now; }
      if (rec.count >= 3) return res.status(429).json({ error: "Too many OTP requests, try after 10 min" });
      rec.count++;
      otpResendMap.set(email, rec);

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
      const email = normalizeEmail(req.body?.email);
      const otp = String(req.body?.otp || '').trim();
      if (!email || !otp) return res.status(400).json({ error: "Email and OTP required" });

      const block = otpFailMap.get(email);
      if (block && block.blockUntil > Date.now()) return res.status(429).json({ error: "Too many failed OTP, blocked 30 min" });

      const resetRecord = await prisma.passwordReset.findFirst({ where: { email } });
      if (!resetRecord) return res.status(400).json({ error: "Invalid OTP" });
      if (new Date() > resetRecord.expiresAt) {
        await prisma.passwordReset.deleteMany({ where: { email } });
        return res.status(400).json({ error: "OTP expired" });
      }

      const valid = await bcrypt.compare(otp, resetRecord.otp);
      if (!valid) {
        const rec = otpFailMap.get(email) || { count: 0 };
        rec.count++;
        if (rec.count >= 5) rec.blockUntil = Date.now() + 30 * 60 * 1000;
        otpFailMap.set(email, rec);
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
      const email = normalizeEmail(req.body?.email);
      const otp = String(req.body?.otp || '').trim();
      const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';
      if (!email || !otp || newPassword.length < 8 || newPassword.length > 64) {
        return res.status(400).json({ error: "Invalid data" });
      }

      const block = otpFailMap.get(email);
      if (block && block.blockUntil > Date.now()) {
        return res.status(429).json({ error: "Too many failed OTP, blocked 30 min" });
      }

      const resetRecord = await prisma.passwordReset.findFirst({ where: { email } });
      if (!resetRecord || new Date() > resetRecord.expiresAt) {
        return res.status(400).json({ error: "Invalid or expired OTP" });
      }
      const valid = await bcrypt.compare(otp, resetRecord.otp);
      if (!valid) {
        const rec = otpFailMap.get(email) || { count: 0 };
        rec.count++;
        if (rec.count >= 5) rec.blockUntil = Date.now() + 30 * 60 * 1000;
        otpFailMap.set(email, rec);
        return res.status(400).json({ error: "Invalid OTP" });
      }

      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await prisma.user.update({ where: { email }, data: { password: hashedPassword } });
      await prisma.passwordReset.deleteMany({ where: { email } });
      otpFailMap.delete(email);
      otpResendMap.delete(email);
      res.json({ message: "Password reset successful!" });
    } catch (error) {
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  // --- DELETE ME - ORDERS KEPT INTACT, USER DATA ERASED ---
  router.delete('/delete-me', async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader) return res.status(401).json({ error: "Unauthorized" });
      const token = authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : authHeader;
      if (!process.env.JWT_SECRET) throw new Error("JWT_SECRET missing");
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const id = Number(decoded.id);

      const user = await prisma.user.findUnique({ where: { id } });
      if (!user) return res.status(404).json({ error: "User not found" });
      if (user.role === 'ADMIN') {
        return res.status(403).json({ error: "Admin accounts cannot be self-deleted via this endpoint" });
      }

      // Cloudinary cleanup
      try {
        if (prisma.userPhoto) {
          const photos = await prisma.userPhoto.findMany({ where: { userId: id } });
          for (const p of photos) {
            if (p.cloudinaryPublicId) await cloudinary.uploader.destroy(p.cloudinaryPublicId).catch(() => {});
          }
        }
        if (prisma.tryOn) {
          const tryons = await prisma.tryOn.findMany({ where: { userId: id } });
          for (const t of tryons) {
            if (t.resultPublicId) await cloudinary.uploader.destroy(t.resultPublicId).catch(() => {});
          }
        }
      } catch (e) { console.log("Cloudinary cleanup skip:", e.message); }

      // DB delete transaction (Preserving orders for compliance)
      await prisma.$transaction(async (tx) => {
        if (tx.tryOn) await tx.tryOn.deleteMany({ where: { userId: id } }).catch(() => {});
        if (tx.userPhoto) await tx.userPhoto.deleteMany({ where: { userId: id } }).catch(() => {});

        try {
          const cart = await tx.cart.findUnique({ where: { userId: id } });
          if (cart) {
            if (tx.cartItem) await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
            await tx.cart.delete({ where: { id: cart.id } });
          }
        } catch (e) {}

        try {
          const wishlist = await tx.wishlist.findUnique({ where: { userId: id } });
          if (wishlist) {
            if (tx.wishlistItem) await tx.wishlistItem.deleteMany({ where: { wishlistId: wishlist.id } });
            await tx.wishlist.delete({ where: { id: wishlist.id } });
          }
        } catch (e) {}

        if (tx.address) await tx.address.deleteMany({ where: { userId: id } }).catch(() => {});
        if (tx.review) await tx.review.deleteMany({ where: { userId: id } }).catch(() => {});
        if (tx.dataAccessLog) await tx.dataAccessLog.deleteMany({ where: { userId: id } }).catch(() => {});
        if (tx.profile) await tx.profile.deleteMany({ where: { userId: id } }).catch(() => {});
        if (tx.passwordReset) {
          await tx.passwordReset.deleteMany({
            where: { email: { in: [user.email, getSignupOtpKey(user.email)] } }
          }).catch(() => {});
        }

        await tx.user.delete({ where: { id } });
      });

      console.log(`[DELETE-ME] Success id=${id}`);
      res.json({ message: "Account deleted, personal data erased - Orders preserved for compliance" });
    } catch (e) {
      console.error("Delete Error:", e.message, e.stack);
      if (e.name === "JsonWebTokenError" || e.name === "TokenExpiredError") {
        return res.status(401).json({ error: "Token expired or invalid" });
      }
      res.status(500).json({ error: e.message });
    }
  });

  return router;
};