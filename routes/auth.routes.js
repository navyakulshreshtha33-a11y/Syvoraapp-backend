const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');

module.exports = (prisma, transporter, generateToken) => {

  // 1. SIGNUP ROUTE
  router.post('/signup', async (req, res) => {
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
          role: "USER",
          profile: { create: { name } },
          cart: { create: {} },
          wishlist: { create: {} }
        },
        include: { profile: true }
      });

      const token = generateToken(newUser.id, newUser.email);
      res.status(201).json({
        message: "Signup successful!",
        token,
        user: { id: newUser.id, email: newUser.email, name: newUser.profile?.name || null }
      });
    } catch (error) {
      console.error("Signup Error:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  // 2. LOGIN ROUTE
  router.post('/login', async (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ error: "Email and password are required" });
      }

      const user = await prisma.user.findUnique({
        where: { email },
        include: { profile: true }
      });
      if (!user) return res.status(400).json({ error: "Invalid email or password" });

      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) return res.status(400).json({ error: "Invalid email or password" });

      const token = generateToken(user.id, user.email);
      res.json({
        message: "Login successful!",
        token,
        user: { id: user.id, email: user.email, name: user.profile?.name || null , role: user.role}
      });
    } catch (error) {
      console.error("Login Error:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  // 3. FORGOT PASSWORD
  router.post('/forgot-password', async (req, res) => {
    try {
      const { email } = req.body;
      if (!email) return res.status(400).json({ error: "Email is required" });

      const user = await prisma.user.findUnique({ where: { email } });
      if (!user) return res.status(404).json({ error: "User with this email does not exist" });

      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

      await prisma.passwordReset.deleteMany({ where: { email } });
      await prisma.passwordReset.create({ data: { email, otp, expiresAt } });

      await transporter.sendMail({
        from: `"Syvora" <syvora.official.acc@gmail.com>`,
        to: email,
        subject: "Syvora - Password Reset OTP",
        html: ` <div style="font-family: Arial, sans-serif; padding: 20px;">

          <h2>Password Reset Request</h2>

          <p>Dear User,<br>We received a request to reset the password for your account associated with this email address.

          Please use the following One-Time Password (OTP) to proceed:</p>

          <h1 style="color: #1f7ab8; letter-spacing: 2px;">${otp}</h1>

          <p>This OTP is valid for the next 10 minutes. <br>Please do not share this code with anyone for security reasons.</p>

          <br/>

          <p>Team Syvora</p>

        </div>`
      });

      res.json({ message: "OTP successfully sent to your registered email!" });
    } catch (error) {
      console.error("Forgot Password Error:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  // 4. VERIFY OTP
  router.post('/verify-otp', async (req, res) => {
    try {
      const { email, otp } = req.body;
      if (!email || !otp) return res.status(400).json({ error: "Email and OTP are required" });

      const resetRecord = await prisma.passwordReset.findFirst({ where: { email, otp } });
      if (!resetRecord) return res.status(400).json({ error: "Invalid OTP" });
      if (new Date() > resetRecord.expiresAt) return res.status(400).json({ error: "OTP has expired." });

      res.json({ message: "OTP verified successfully!" });
    } catch (error) {
      console.error("Verify OTP Error:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  // 5. RESET PASSWORD
  router.post('/reset-password', async (req, res) => {
    try {
      const { email, otp, newPassword } = req.body;
      if (!email || !otp || !newPassword) return res.status(400).json({ error: "All fields are required" });

      const resetRecord = await prisma.passwordReset.findFirst({ where: { email, otp } });
      if (!resetRecord || new Date() > resetRecord.expiresAt) {
        return res.status(400).json({ error: "Invalid or expired OTP" });
      }

      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await prisma.user.update({
        where: { email },
        data: { password: hashedPassword }
      });
      await prisma.passwordReset.deleteMany({ where: { email } });

      res.json({ message: "Password reset successful!" });
    } catch (error) {
      console.error("Reset Password Error:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  return router;
};