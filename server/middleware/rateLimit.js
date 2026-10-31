const rateLimit = require('express-rate-limit');

const windowMs = 15 * 60 * 1000;
const message = { error: 'Too many attempts. Try again later.' };

const loginLimiter = rateLimit({
  windowMs,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message
});

const registerLimiter = rateLimit({
  windowMs,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message
});

module.exports = { loginLimiter, registerLimiter };
