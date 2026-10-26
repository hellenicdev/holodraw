const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

require('../config/db');
const User = require('../models/User');
const {
  parseAllowedOrigins,
  generateRoomId,
  normalizeRoomId,
  isBoardMember,
  validateStroke,
  validateStrokeList,
  validateStickyNote,
  ERASER_COLOR,
  MAX_STROKES
} = require('../utils/validate');
const {
  signAccessToken,
  verifyAccessToken,
  accessCookieOptions,
  refreshCookieOptions,
  ACCESS_MAX_AGE_MS,
  REFRESH_MAX_AGE_MS
} = require('../utils/tokens');

describe('security helpers', () => {
  it('enables mongoose filter sanitization', () => {
    assert.equal(mongoose.get('sanitizeFilter'), true);
  });

  it('defaults CORS to https://hellenicdev.eu only', () => {
    assert.deepEqual(parseAllowedOrigins(undefined), ['https://hellenicdev.eu']);
    assert.deepEqual(parseAllowedOrigins(''), ['https://hellenicdev.eu']);
    assert.deepEqual(
      parseAllowedOrigins(' https://hellenicdev.eu, http://localhost:5000 '),
      ['https://hellenicdev.eu', 'http://localhost:5000']
    );
  });

  it('generates 128-bit room ids and rejects short codes', () => {
    const id = generateRoomId();
    assert.equal(id.length, 32);
    assert.equal(normalizeRoomId(id), id);
    assert.notEqual(generateRoomId(), generateRoomId());
    assert.equal(normalizeRoomId('ABC123'), null);
    assert.equal(normalizeRoomId({ $gt: '' }), null);
  });

  it('checks board creators and collaborators', () => {
    const board = { createdBy: 'a', collaborators: ['b'] };
    assert.equal(isBoardMember(board, 'a'), true);
    assert.equal(isBoardMember(board, 'b'), true);
    assert.equal(isBoardMember(board, 'c'), false);
  });

  it('rejects non-hex colours and oversized strokes', () => {
    assert.equal(validateStroke({
      type: 'pencil',
      color: '<img src=x onerror=alert(1)>',
      strokeWidth: 3,
      points: [{ x: 1, y: 1 }, { x: 2, y: 2 }]
    }), null);
    assert.equal(validateStroke({
      type: 'pencil',
      color: { $gt: '' },
      strokeWidth: 3,
      points: [{ x: 1, y: 1 }, { x: 2, y: 2 }]
    }), null);

    const eraser = validateStroke({
      type: 'eraser',
      color: 'red',
      strokeWidth: 8,
      points: [{ x: 0, y: 0 }, { x: 1, y: 1 }]
    });
    assert.equal(eraser.color, ERASER_COLOR);

    const hex = validateStroke({
      type: 'rectangle',
      color: '#fff',
      strokeWidth: 2,
      x: 1,
      y: 2,
      width: 3,
      height: 4
    });
    assert.equal(hex.color, '#fff');
    assert.equal(validateStrokeList(new Array(MAX_STROKES + 1)), null);
  });

  it('rejects sticky notes whose text or colour is not a safe string', () => {
    assert.equal(validateStickyNote({
      id: 'sn-1',
      x: 1,
      y: 2,
      text: { $gt: '' },
      color: '#fff9c4'
    }), null);
    assert.equal(validateStickyNote({
      id: 'sn-1',
      x: 1,
      y: 2,
      text: '<script>alert(1)</script>',
      color: 'red; background:url(javascript:alert(1))'
    }), null);

    const note = validateStickyNote({
      id: 'sn-1',
      x: 1,
      y: 2,
      text: 'hello',
      color: '#fff9c4'
    });
    assert.equal(note.text, 'hello');
    assert.equal(note.color, '#fff9c4');
  });

  it('strips password hashes and refresh tokens from user JSON', () => {
    const user = new User({
      username: 'ada',
      email: 'ada@example.com',
      password: 'secret12',
      refreshTokens: [{ tokenHash: 'abc', expiresAt: new Date(Date.now() + 1000) }]
    });
    const json = user.toJSON();
    assert.equal(json.password, undefined);
    assert.equal(json.refreshTokens, undefined);
    assert.equal(typeof json.color, 'string');
    assert.match(json.color, /^#[0-9a-f]{6}$/);
  });

  it('issues short-lived access tokens and rejects legacy 30-day tokens', () => {
    const previous = process.env.JWT_SECRET;
    process.env.JWT_SECRET = 'test-only-secret';
    try {
      const userId = '507f1f77bcf86cd799439011';
      const access = signAccessToken(userId);
      const decoded = verifyAccessToken(access);
      assert.equal(decoded.id, userId);
      assert.equal(decoded.type, 'access');
      assert.ok(decoded.exp - decoded.iat <= 15 * 60);

      const legacy = jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: '30d' });
      assert.equal(verifyAccessToken(legacy), null);
    } finally {
      process.env.JWT_SECRET = previous;
    }
  });

  it('keeps auth cookies httpOnly and locks them down in production', () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const access = accessCookieOptions();
      const refresh = refreshCookieOptions();
      assert.equal(access.httpOnly, true);
      assert.equal(access.secure, true);
      assert.equal(access.sameSite, 'none');
      assert.equal(access.partitioned, true);
      assert.equal(access.maxAge, ACCESS_MAX_AGE_MS);
      assert.equal(refresh.httpOnly, true);
      assert.equal(refresh.path, '/api/auth');
      assert.equal(refresh.maxAge, REFRESH_MAX_AGE_MS);
    } finally {
      if (previous === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previous;
    }
  });
});
