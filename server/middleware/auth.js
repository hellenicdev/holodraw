const User = require('../models/User');
const { verifyAccessToken } = require('../utils/tokens');

const readAccessToken = (req) => {
  if (req.cookies && typeof req.cookies.accessToken === 'string') {
    return req.cookies.accessToken;
  }
  const header = req.headers.authorization;
  if (typeof header === 'string' && header.startsWith('Bearer ')) {
    const token = header.slice(7).trim();
    return token || null;
  }
  return null;
};

const loadUser = async (token) => {
  const decoded = verifyAccessToken(token);
  if (!decoded) return null;
  return User.findById(decoded.id);
};

const protect = async (req, res, next) => {
  const token = readAccessToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Not authorized, no token provided' });
  }

  try {
    req.user = await loadUser(token);
    if (!req.user) {
      return res.status(401).json({ error: 'Not authorized, token invalid' });
    }
    return next();
  } catch (error) {
    return res.status(401).json({ error: 'Not authorized, token invalid' });
  }
};

const optionalAuth = async (req, res, next) => {
  const token = readAccessToken(req);
  if (token) {
    try {
      req.user = await loadUser(token);
    } catch (error) {
      req.user = null;
    }
  }
  return next();
};

module.exports = { protect, optionalAuth, readAccessToken };
