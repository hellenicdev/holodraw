const assert = require('node:assert/strict');
const http = require('node:http');
const { after, before, describe, it } = require('node:test');
const { io: ioClient } = require('socket.io-client');
const { server, io } = require('../server');

function request(port, { method = 'GET', path = '/', headers = {}, body = null } = {}) {
  const payload = body == null ? null : (typeof body === 'string' ? body : JSON.stringify(body));
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      method,
      path,
      headers: {
        ...(payload ? {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        } : {}),
        ...headers
      }
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try {
          json = JSON.parse(text);
        } catch (err) {
          json = null;
        }
        resolve({
          status: res.statusCode,
          headers: res.headers,
          json,
          text
        });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

describe('login protections', () => {
  let port;

  before(async () => {
    await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        port = server.address().port;
        resolve();
      });
    });
  });

  after(async () => {
    io.close();
    if (server.listening) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it('caps a single socket message at about 1 MB', () => {
    assert.equal(io.engine.opts.maxHttpBufferSize, 1e6);
  });

  it('rejects object emails before they reach a query and rate limits repeated attempts', async () => {
    const malicious = { email: { $gt: '' }, password: 'secret' };
    const first = await request(port, { method: 'POST', path: '/api/auth/login', body: malicious });
    assert.equal(first.status, 400);
    assert.equal(first.json.error, 'Invalid email or password');

    let last = first;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      last = await request(port, { method: 'POST', path: '/api/auth/login', body: malicious });
    }
    assert.equal(last.status, 429);
    assert.match(last.text, /Too many attempts/);
  });

  it('refuses board writes without an authenticated session', async () => {
    const roomId = 'a'.repeat(32);
    const res = await request(port, {
      method: 'PUT',
      path: `/api/boards/${roomId}`,
      body: { strokes: [] }
    });
    assert.equal(res.status, 401);
  });

  it('reflects only configured origins', async () => {
    const allowed = await request(port, {
      path: '/api/health',
      headers: { Origin: 'https://hellenicdev.eu' }
    });
    assert.equal(allowed.headers['access-control-allow-origin'], 'https://hellenicdev.eu');
    assert.equal(allowed.headers['access-control-allow-credentials'], 'true');

    const blocked = await request(port, {
      path: '/api/health',
      headers: { Origin: 'https://evil.example' }
    });
    assert.notEqual(blocked.headers['access-control-allow-origin'], 'https://evil.example');
  });

  it('rejects a socket handshake without an access cookie', async () => {
    const socket = ioClient(`http://127.0.0.1:${port}`, {
      transports: ['websocket'],
      reconnection: false,
      timeout: 2000,
      extraHeaders: { Origin: 'https://hellenicdev.eu' }
    });

    const error = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timed out waiting for socket rejection')), 3000);
      socket.on('connect_error', (err) => {
        clearTimeout(timer);
        resolve(err);
      });
      socket.on('connect', () => {
        clearTimeout(timer);
        reject(new Error('socket connected without authentication'));
      });
    });

    socket.close();
    assert.match(error.message, /Authentication required/);
  });
});
