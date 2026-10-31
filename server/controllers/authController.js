const crypto = require('crypto');
const User = require('../models/User');
const { normalizeEmail } = require('../utils/validate');
const {
  REFRESH_MAX_AGE_MS,
  sha256,
  signAccessToken,
  setAuthCookies,
  clearAuthCookies
} = require('../utils/tokens');

const bodyOf = (req) => (req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {});

const issueSession = async (res, user) => {
  const accessToken = signAccessToken(user._id);
  const refreshToken = crypto.randomBytes(32).toString('hex');
  const now = new Date();
  const active = (user.refreshTokens || []).filter((entry) => entry.expiresAt > now);
  active.push({
    tokenHash: sha256(refreshToken),
    expiresAt: new Date(Date.now() + REFRESH_MAX_AGE_MS)
  });
  user.refreshTokens = active.slice(-5);
  await user.save();
  setAuthCookies(res, accessToken, refreshToken);
};

exports.register = async (req, res) => {
  try {
    const body = bodyOf(req);
    if (typeof body.username !== 'string' || typeof body.email !== 'string' || typeof body.password !== 'string') {
      return res.status(400).json({ error: 'Invalid registration details' });
    }

    const username = body.username.trim();
    const email = normalizeEmail(body.email);
    const password = body.password;
    if (username.length < 3 || username.length > 30 || !email || password.length < 6 || password.length > 128) {
      return res.status(400).json({ error: 'Invalid registration details' });
    }

    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      const field = existingUser.email === email ? 'Email' : 'Username';
      return res.status(400).json({ error: `${field} already exists` });
    }

    const user = await User.create({ username, email, password });
    await issueSession(res, user);
    return res.status(201).json({ user: user.toJSON() });
  } catch (error) {
    if (error && error.code === 11000) {
      return res.status(400).json({ error: 'Email or username already exists' });
    }
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((entry) => entry.message);
      return res.status(400).json({ error: messages.join(', ') });
    }
    if (error.statusCode === 500) {
      return res.status(500).json({ error: 'Server error during registration' });
    }
    console.error('Registration error:', error.message);
    return res.status(500).json({ error: 'Server error during registration' });
  }
};

exports.login = async (req, res) => {
  try {
    const body = bodyOf(req);
    if (typeof body.email !== 'string' || typeof body.password !== 'string') {
      return res.status(400).json({ error: 'Invalid email or password' });
    }

    const email = normalizeEmail(body.email);
    const password = body.password;
    if (!email || password.length < 1 || password.length > 128) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }

    const user = await User.findOne({ email }).select('+password +refreshTokens');
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    await issueSession(res, user);
    return res.json({ user: user.toJSON() });
  } catch (error) {
    console.error('Login error:', error.message);
    return res.status(500).json({ error: 'Server error during login' });
  }
};

exports.refresh = async (req, res) => {
  try {
    const raw = req.cookies ? req.cookies.refreshToken : null;
    if (typeof raw !== 'string' || raw.length < 32 || raw.length > 128) {
      clearAuthCookies(res);
      return res.status(401).json({ error: 'Not authorized' });
    }

    const tokenHash = sha256(raw);
    const user = await User.findOne({ 'refreshTokens.tokenHash': tokenHash }).select('+refreshTokens');
    if (!user) {
      clearAuthCookies(res);
      return res.status(401).json({ error: 'Not authorized' });
    }

    const now = new Date();
    const entry = (user.refreshTokens || []).find((item) => item.tokenHash === tokenHash && item.expiresAt > now);
    if (!entry) {
      user.refreshTokens = (user.refreshTokens || []).filter((item) => item.tokenHash !== tokenHash);
      await user.save();
      clearAuthCookies(res);
      return res.status(401).json({ error: 'Not authorized' });
    }

    user.refreshTokens = user.refreshTokens.filter((item) => item.tokenHash !== tokenHash);
    await issueSession(res, user);
    return res.json({ user: user.toJSON() });
  } catch (error) {
    console.error('Refresh error:', error.message);
    clearAuthCookies(res);
    return res.status(401).json({ error: 'Not authorized' });
  }
};

exports.logout = async (req, res) => {
  try {
    const raw = req.cookies ? req.cookies.refreshToken : null;
    if (typeof raw === 'string' && raw.length >= 32 && raw.length <= 128) {
      const tokenHash = sha256(raw);
      await User.updateOne(
        { 'refreshTokens.tokenHash': tokenHash },
        { $pull: { refreshTokens: { tokenHash } } }
      );
    }
  } catch (error) {
    console.error('Logout error:', error.message);
  }
  clearAuthCookies(res);
  return res.json({ ok: true });
};

exports.getMe = async (req, res) => {
  res.json({ user: req.user });
};
