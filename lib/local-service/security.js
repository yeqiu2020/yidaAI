'use strict';

const crypto = require('crypto');

const MUTATING_GETS = new Set([
  '/restart-service', '/ensure-service', '/refresh-login', '/refresh-org-apps',
  '/sync-app-to-local-stream', '/__yida_start_service',
]);
const ALLOWED_ORIGINS = new Set([
  'http://127.0.0.1:8080', 'http://localhost:8080',
  'http://127.0.0.1:3457', 'http://localhost:3457',
]);

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

/** One request boundary for both servers. All future non-read methods require a token. */
function createSecurity(options = {}) {
  const tokens = new Map();
  const nonces = new Map();
  const now = options.now || Date.now;
  const ttl = options.tokenTtl || 8 * 60 * 60 * 1000;
  const origins = options.origins || ALLOWED_ORIGINS;

  function prune() {
    for (const [token, expires] of tokens) if (expires <= now()) tokens.delete(token);
    for (const [nonce, info] of nonces) if (info.expires <= now()) nonces.delete(nonce);
  }

  return function protect(req, res) {
    let url;
    try { url = new URL(req.url, 'http://127.0.0.1'); }
    catch (_) { sendJson(res, 400, { success: false, error: '非法请求地址' }); return true; }
    const headers = req.headers || {};
    const host = headers.host || '';
    if (host && !/^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(host)) {
      sendJson(res, 403, { success: false, error: 'Host not allowed' }); return true;
    }
    const origin = headers.origin;
    if (origin && !origins.has(origin)) {
      sendJson(res, 403, { success: false, error: 'Origin not allowed' }); return true;
    }
    if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Session-Token, X-Confirm-Nonce');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return true; }
    prune();
    if (url.pathname === '/get-session-token' && req.method === 'GET') {
      // Limit inactive clients without an interval that could keep a CLI/test alive.
      if (tokens.size >= 512) tokens.delete(tokens.keys().next().value);
      const token = crypto.randomBytes(32).toString('hex');
      tokens.set(token, now() + ttl);
      sendJson(res, 200, { success: true, token, expiresIn: ttl }); return true;
    }
    const needsToken = !['GET', 'HEAD'].includes(req.method) || MUTATING_GETS.has(url.pathname);
    const token = headers['x-session-token'] || url.searchParams.get('token');
    if (needsToken && !tokens.has(token)) {
      sendJson(res, 403, { success: false, code: 'SESSION_TOKEN_REQUIRED', error: '本地服务会话已失效，请刷新页面后重试' });
      return true;
    }
    if (url.pathname === '/request-clean-confirm' && req.method === 'POST') {
      if (nonces.size >= 512) nonces.delete(nonces.keys().next().value);
      const nonce = crypto.randomBytes(16).toString('hex');
      nonces.set(nonce, { token, expires: now() + 5 * 60 * 1000 });
      sendJson(res, 200, { success: true, nonce }); return true;
    }
    if (url.pathname === '/clean-data' && req.method === 'POST') {
      const nonce = headers['x-confirm-nonce'];
      const info = nonces.get(nonce);
      if (!info || info.token !== token) {
        sendJson(res, 403, { success: false, error: '清空操作的确认已失效，请重新确认' }); return true;
      }
      nonces.delete(nonce);
    }
    return false;
  };
}

module.exports = { createSecurity, sendJson, MUTATING_GETS, ALLOWED_ORIGINS };
