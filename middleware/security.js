const rateLimit = require('express-rate-limit');
const { z } = require('zod');

// Point 13: VTO limiter - 10 try-on / day per user
const vtoLimiter = rateLimit({
  windowMs: 24*60*60*1000, // 24 hr
  max: 10,
  keyGenerator: (req) => {
    // JWT se userId nikal, nahi toh IP se
    try{
      const token = req.headers.authorization?.split(' ')[1];
      const decoded = require('jsonwebtoken').decode(token);
      return decoded?.id || req.ip;
    }catch{ return req.ip; }
  },
  message: { error: "Daily try-on limit reached (10/day). Try tomorrow." },
  standardHeaders: true
});

// Point 15: Zod validate middleware
const validate = (schema) => (req,res,next)=>{
  const parsed = schema.safeParse(req.body);
  if(!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  req.body = parsed.data; // sirf whitelisted fields hi aage jayenge (Point 16)
  next();
};

// Point 16: Role whitelisting - koi ADMIN na ban jaye
const cartSchema = z.object({
  productId: z.number().int().positive(),
  quantity: z.number().int().min(1).max(10).optional().default(1)
});

const vtoSchema = z.object({
  personImage: z.string().min(10), // base64
  garmentId: z.number().optional(),
  garmentImage: z.string().optional()
}).refine(data => data.garmentId || data.garmentImage, { message: "Garment required" });

module.exports = { vtoLimiter, validate, cartSchema, vtoSchema };