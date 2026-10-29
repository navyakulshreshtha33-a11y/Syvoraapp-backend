const express = require('express');
const jwt = require('jsonwebtoken');

module.exports = (prisma) => {
  const router = express.Router();
  
  // Safe instantiation of controller with prisma
  const controllerFactory = require('../controller/vtoController.js');
  const vtoController = typeof controllerFactory === 'function' 
    ? controllerFactory(prisma) 
    : controllerFactory;

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

  // Safe wrapper handlers to guarantee valid Express callbacks
  router.post('/try-on', verifyUser, (req, res, next) => {
    if (vtoController && typeof vtoController.performTryOn === 'function') {
      return vtoController.performTryOn(req, res, next);
    }
    return res.status(500).json({ error: "VTO controller handler performTryOn not found" });
  });

  router.get('/result/:id', verifyUser, (req, res, next) => {
    if (vtoController && typeof vtoController.getTryOnResult === 'function') {
      return vtoController.getTryOnResult(req, res, next);
    }
    return res.status(500).json({ error: "VTO controller handler getTryOnResult not found" });
  });

  router.delete('/photo/:photoId', verifyUser, (req, res, next) => {
    if (vtoController && typeof vtoController.deleteUserPhoto === 'function') {
      return vtoController.deleteUserPhoto(req, res, next);
    }
    return res.status(500).json({ error: "VTO controller handler deleteUserPhoto not found" });
  });

  return router;
};