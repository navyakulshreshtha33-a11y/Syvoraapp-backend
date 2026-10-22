// middleware/auditLog.js
module.exports = (prisma) => {
  return async (req, res, next) => {
    // Sirf sensitive data access pe log karo
    if(req.path.includes('/admin/') || req.path.includes('/order/') || req.path.includes('/measurement/')){
      try{
        const authHeader = req.headers.authorization;
        if(authHeader){
          const jwt = require('jsonwebtoken');
          const token = authHeader.split(' ')[1];
          const decoded = jwt.verify(token, process.env.JWT_SECRET);
          const targetId = Number(req.params.userId || req.params.id) || decoded.id;
          
          // async log - response ko block mat karo
          prisma.dataAccessLog.create({
            data: {
              actorId: decoded.id,
              targetUserId: targetId,
              purpose: `${req.method} ${req.path}`,
              ip: req.ip
            }
          }).catch(()=>{});
        }
      }catch(e){}
    }
    next();
  }
}