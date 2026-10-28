const express = require('express');
const jwt = require('jsonwebtoken');

module.exports = (prisma) => {
  const router = express.Router();
  const vtoController = require('../controllers/vtoController')(prisma);

  const verifyUser = (req, res, next) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = decoded;
      next();
    } catch (err) {
      return res.status(401).json({ error: "Invalid token" });
    }
  };

  // Ensure this matches exactly with frontend request
  router.post('/try-on', verifyUser, vtoController.performTryOn);
  router.get('/result/:id', verifyUser, vtoController.getTryOnResult);
  router.delete('/photo/:photoId', verifyUser, vtoController.deleteUserPhoto);

  return router;
};