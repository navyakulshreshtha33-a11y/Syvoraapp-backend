const express = require('express');
const jwt = require('jsonwebtoken');
const vtoControllerFactory = require('../controller/vtoController.js');

module.exports = (prisma) => {
  const router = express.Router();
  const vtoController = vtoControllerFactory(prisma);

  const verifyUser = (req, res, next) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: "Unauthorized - Missing Token" });
      }
      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = decoded;
      next();
    } catch (err) {
      return res.status(401).json({ error: "Invalid or expired token" });
    }
  };

  router.post('/try-on', verifyUser, vtoController.performTryOn);
  router.get('/result/:id', verifyUser, vtoController.getTryOnResult);
  router.delete('/photo/:photoId', verifyUser, vtoController.deleteUserPhoto);
  router.post('/upload-photo', verifyUser, vtoController.uploadUserPhoto);

  return router;
};