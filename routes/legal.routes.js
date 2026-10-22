const express = require('express');
module.exports = () => {
  const router = express.Router();
  router.get('/privacy', (req,res)=>{
    res.json({
      title: "Syvora Privacy Policy - DPDP Act 2023",
      lastUpdated: "2026-05-13",
      dataCollected: ["email","name","address","body measurements","photos for VTO"],
      purpose: "E-commerce order fulfilment and virtual try-on",
      retention: "VTO photos 1 hour, Orders 180 days post-delivery, Logs 180 days",
      rights: "Right to erasure via DELETE /api/auth/delete-me, Contact dpo@syvora.in",
      consent: "Explicit consent taken at signup with timestamp stored"
    });
  });
  router.get('/terms', (req,res)=>{ res.json({ message: "Terms & Conditions - Syvora.in" }); });
  return router;
}