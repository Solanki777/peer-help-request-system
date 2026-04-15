const jwt = require('jsonwebtoken');
const SECRET = process.env.JWT_SECRET || 'SECRET_KEY_GTU_2024';

function authMiddleware(req, res, next) {
  // Check Authorization header or 'token' cookie
  const token = req.headers['authorization'] || (req.cookies && req.cookies.token);

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
