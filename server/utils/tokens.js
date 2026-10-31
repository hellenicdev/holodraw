const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const ACCESS_TTL = '15m';
const ACCESS_MAX_AGE_MS = 15 * 60 * 1000;
const REFRESH_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const OBJECT_ID = /^[a-f0-9]{24}$/i;

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function cookieBase() {
  const secure = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure,
    sameSite: secure ? 'none' : 'lax',
    partitioned: secure
  };
}

function accessCookieOptions() {
  return { ...cookieBase(), path: '/', maxAge: ACCESS_MAX_AGE_MS };
}

function refreshCookieOptions() {
  return { ...cookieBase(), path: '/api/auth', maxAge: REFRESH_MAX_AGE_MS };
}

function clearCookieOptions(path) {
  return { ...cookieBase(), path };
}

function signAccessToken(userId) {
  if (!process.env.JWT_SECRET) {
    const error = new Error('JWT_SECRET is not configured');
    error.statusCode = 500;
    throw error;
  }
  return jwt.sign(
    { id: userId.toString(), type: 'access' },
    process.env.JWT_SECRET,
    { expiresIn: ACCESS_TTL, algorithm: 'HS256' }
  );
}

function verifyAccessToken(token) {
  if (typeof token !== 'string' || !token || !process.env.JWT_SECRET) return null;
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    if (!decoded || decoded.type !== 'access' || typeof decoded.id !== 'string' || !OBJECT_ID.test(decoded.id)) {
      return null;
    }
    return decoded;
  } catch (err) {
    return null;
  }
}

function setAuthCookies(res, accessToken, refreshToken) {
  res.cookie('accessToken', accessToken, accessCookieOptions());
  res.cookie('refreshToken', refreshToken, refreshCookieOptions());
}

function clearAuthCookies(res) {
  res.clearCookie('accessToken', clearCookieOptions('/'));
  res.clearCookie('refreshToken', clearCookieOptions('/api/auth'));
}

module.exports = {
  ACCESS_TTL,
  ACCESS_MAX_AGE_MS,
  REFRESH_MAX_AGE_MS,
  sha256,
  accessCookieOptions,
  refreshCookieOptions,
  signAccessToken,
  verifyAccessToken,
  setAuthCookies,
  clearAuthCookies
};
