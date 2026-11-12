'use strict';
// Request limits stored in the database, so they hold across serverless
// instances (an in-memory counter would reset on every cold start).
// Fixed windows: each key counts hits per window and is refused past `max`.
const { db } = require('./db');

db.exec(`
CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL
);
`);

let lastSweep = 0;
function sweep(now) {
  // Drop stale windows now and then so the table stays small.
  if (now - lastSweep < 10 * 60 * 1000) return;
  lastSweep = now;
  try {
    db.prepare('DELETE FROM rate_limits WHERE window_start < ?').run(now - 24 * 60 * 60 * 1000);
  } catch { /* best effort */ }
}

// Counts one hit for `key`. Returns { ok, retryAfter } (seconds).
function hit(key, max, windowMs) {
  const now = Date.now();
  sweep(now);
  const row = db.prepare('SELECT window_start, count FROM rate_limits WHERE key = ?').get(key);
  if (!row || now - row.window_start >= windowMs) {
    db.prepare('INSERT OR REPLACE INTO rate_limits (key, window_start, count) VALUES (?, ?, 1)').run(key, now);
    return { ok: true, retryAfter: 0 };
  }
  if (row.count >= max) {
    return { ok: false, retryAfter: Math.ceil((row.window_start + windowMs - now) / 1000) };
  }
  db.prepare('UPDATE rate_limits SET count = count + 1 WHERE key = ?').run(key);
  return { ok: true, retryAfter: 0 };
}

function clientIp(req) {
  // trust proxy is on, so req.ip is the client address Vercel forwarded.
  return String(req.ip || req.headers['x-real-ip'] || 'unknown');
}

function minutes(seconds) {
  const m = Math.ceil(seconds / 60);
  return m <= 1 ? 'a minute' : `${m} minutes`;
}

// Express middleware. `rules` is a list of { name, max, windowMs, key(req) };
// a rule whose key() returns null is skipped. Every rule is counted, and the
// request is refused if any rule is over its limit.
function limit(rules, message = 'Too many requests') {
  return (req, res, next) => {
    let worst = 0;
    for (const rule of rules) {
      const k = rule.key(req);
      if (k == null) continue;
      const r = hit(`${rule.name}:${k}`, rule.max, rule.windowMs);
      if (!r.ok) worst = Math.max(worst, r.retryAfter);
    }
    if (worst > 0) {
      res.setHeader('Retry-After', String(worst));
      return res.status(429).json({ error: `${message}. Please try again in ${minutes(worst)}.`, retry_after: worst });
    }
    next();
  };
}

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const num = (name, fallback) => {
  const n = parseInt(process.env[name] || '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};
const emailKey = (req) => (req.body?.email ? String(req.body.email).trim().toLowerCase() : null);

const limits = {
  // Password guessing: per account and per address.
  login: limit([
    { name: 'login-email', max: 10, windowMs: 15 * MIN, key: emailKey },
    { name: 'login-ip', max: 50, windowMs: 15 * MIN, key: clientIp },
  ], 'Too many sign-in attempts'),
  register: limit([
    { name: 'register-ip', max: 10, windowMs: HOUR, key: clientIp },
  ], 'Too many sign-ups from this network'),
  // Code requests (each also limited to one per minute per address in auth.js).
  sendCode: limit([
    { name: 'code-ip', max: 20, windowMs: HOUR, key: clientIp },
  ], 'Too many code requests'),
  // Code guessing: a 6-digit code must not be brute-forceable.
  checkCode: limit([
    { name: 'check-email', max: 10, windowMs: 15 * MIN, key: emailKey },
    { name: 'check-ip', max: 30, windowMs: 15 * MIN, key: clientIp },
  ], 'Too many code attempts'),
  // AI calls cost provider quota; per signed-in user (and per IP as backstop).
  ai: limit([
    { name: 'ai-user', max: num('TB_AI_LIMIT_PER_HOUR', 60), windowMs: HOUR, key: (req) => req.user?.id || null },
    { name: 'ai-ip', max: num('TB_AI_LIMIT_PER_HOUR', 60) * 3, windowMs: HOUR, key: clientIp },
  ], 'You’ve hit the hourly AI limit'),
  uploads: limit([
    { name: 'upload-user', max: 30, windowMs: HOUR, key: (req) => req.user?.id || null },
  ], 'Too many uploads'),
};

module.exports = { limits, hit, clientIp };
