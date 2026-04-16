const jwt = require('jsonwebtoken');
const SECRET = process.env.JWT_SECRET || 'SECRET_KEY_GTU_2024';

function authMiddleware(req, res, next) {
  let token;

  // 1. Check Authorization header (priority)
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } 
  // 2. Fallback to cookie
  else if (req.cookies && req.cookies.token) {
    token = req.cookies.token;
  }
  // 3. Last fallback (direct header check for backward compatibility)
  else {
    token = req.headers['token'] || req.headers['authorization'];
  }

  if (!token) {
    return res.status(401).json({ message: 'No token, authorization denied' });
  }

  try {
    const decoded = jwt.verify(token, SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ message: 'Token is not valid' });
  }
}

module.exports = authMiddleware;
