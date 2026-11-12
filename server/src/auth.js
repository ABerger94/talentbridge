'use strict';
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { db } = require('./db');
const { sendMail, mailConfigured, codeEmail } = require('./mailer');
const { limits } = require('./ratelimit');

// --- Signing secret ----------------------------------------------------------
// Signs login tokens (and, derived from it, private file links). In production
// a missing secret must never fall back to the public dev default: anyone
// could then mint a token for any account. Locally the default keeps dev easy.
const DEV_SECRET = 'dev-secret-change-me';
const IS_PRODUCTION = !!process.env.VERCEL || process.env.NODE_ENV === 'production';

function secretStatus() {
  const s = process.env.TB_JWT_SECRET || '';
  if (!s) return IS_PRODUCTION ? 'missing' : 'dev-default';
  if (s === DEV_SECRET) return IS_PRODUCTION ? 'default' : 'dev-default';
  if (s.length < 32) return 'short';
  return 'ok';
}

function secretUsable() {
  return !['missing', 'default'].includes(secretStatus());
}

function jwtSecret() {
  if (!secretUsable()) {
    const e = new Error('Server misconfigured: TB_JWT_SECRET is not set. Sign-in is disabled until it is.');
    e.status = 503;
    throw e;
  }
  return process.env.TB_JWT_SECRET || DEV_SECRET;
}

if (!secretUsable()) {
  console.error('[auth] TB_JWT_SECRET is missing or the public default — refusing to sign or accept logins.');
}
const ADMIN_EMAILS = (process.env.TB_ADMIN_EMAILS || '')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    role: effectiveRole(row),
    email_verified: !!row.email_verified,
    has_password: !!row.password_hash,
    full_name: userData(row).full_name || null,
    // Employers: 'approved' | 'pending' | 'rejected' (pre-verification employers
    // count as approved); admins 'approved'; others null. See employers.js.
    employer_status: effectiveRole(row) === 'admin' ? 'approved'
      : row.role === 'employer' ? (userData(row).employer_status || 'approved') : null,
    data: userData(row),
    created_date: row.created_date,
  };
}

function userData(row) {
  try {
    return JSON.parse(row.data || '{}') || {};
  } catch {
    return {};
  }
}

// OAuth return targets: only same-origin paths or an allowlisted app origin.
// Anything else (another host, protocol-relative //evil, javascript:, ...)
// falls back to '/', so the session JWT can never be appended to a foreign URL.
function allowedOrigins(req) {
  const list = [`${req.protocol}://${req.get('host')}`];
  for (const v of [process.env.TB_APP_ORIGINS, process.env.TB_CORS_ORIGIN]) {
    for (const o of String(v || '').split(',')) {
      const t = o.trim().replace(/\/$/, '');
      if (t && t !== '*') list.push(t);
    }
  }
  return list;
}

function safeReturnTo(req, raw) {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (!value) return '/';
  if (value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/\\')) {
    return value;
  }
  try {
    const url = new URL(value);
    if ((url.protocol === 'https:' || url.protocol === 'http:') && allowedOrigins(req).includes(url.origin)) {
      return url.href;
    }
  } catch { /* not an absolute URL */ }
  return '/';
}

function effectiveRole(row) {
  if (ADMIN_EMAILS.includes(row.email.toLowerCase())) return 'admin';
  return row.role;
}

function getUserByEmail(email) {
  return db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
}
function getUserById(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

// Every token carries the account's token version (tv). Bumping the version
// (password change or reset, "sign out other devices", account deletion)
// ends every session issued before it.
function tokenVersion(row) {
  return Number(userData(row).token_version) || 0;
}

function signToken(userRow) {
  return jwt.sign({ sub: userRow.id, email: userRow.email, tv: tokenVersion(userRow) }, jwtSecret(), {
    expiresIn: '30d',
  });
}

// Ends all existing sessions for the account; returns the updated row.
function revokeSessions(userId) {
  const row = getUserById(userId);
  if (!row) return null;
  const data = { ...userData(row), token_version: tokenVersion(row) + 1 };
  db.prepare('UPDATE users SET data = ? WHERE id = ?').run(JSON.stringify(data), userId);
  return getUserById(userId);
}

function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  if (!secretUsable()) return res.status(503).json({ error: 'Server misconfigured: sign-in is disabled.' });
  try {
    const payload = jwt.verify(token, jwtSecret());
    const row = getUserById(payload.sub);
    if (!row) return res.status(401).json({ error: 'User not found' });
    if ((Number(payload.tv) || 0) !== tokenVersion(row)) {
      return res.status(401).json({ error: 'Your session ended. Please sign in again.', code: 'session_revoked' });
    }
    req.user = publicUser(row);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Like authRequired, but lets anonymous requests through with req.user = null.
// A token that is present but invalid is still rejected.
function optionalAuth(req, res, next) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) {
    req.user = null;
    return next();
  }
  return authRequired(req, res, next);
}

// --- OTP -----------------------------------------------------------------
// Codes are emailed when a mail provider is configured (see mailer.js).
// Without one, the code is printed to the server log so the owner can still
// help someone through, and email verification is not required (otherwise no
// one could finish signing up). TB_REQUIRE_EMAIL_VERIFICATION=true/false
// overrides that automatic choice.
const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5; // wrong guesses before a code is thrown away

try { db.exec('ALTER TABLE otps ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0'); } catch { /* exists */ }
const OTP_RESEND_GAP_MS = 60 * 1000;

function verificationRequired() {
  const v = (process.env.TB_REQUIRE_EMAIL_VERIFICATION || '').trim().toLowerCase();
  if (v === 'true') return true;
  if (v === 'false') return false;
  return mailConfigured();
}

// Creates a code and emails it. Returns { sent, throttled }.
async function deliverOtp(email, purpose) {
  const key = email.toLowerCase();
  const prev = db.prepare('SELECT expires_at FROM otps WHERE email = ? AND purpose = ?').get(key, purpose);
  if (prev && prev.expires_at - OTP_TTL_MS > Date.now() - OTP_RESEND_GAP_MS) {
    return { sent: false, throttled: true }; // one code per minute per address
  }
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  const codeHash = crypto.createHash('sha256').update(code).digest('hex');
  db.prepare(
    'INSERT OR REPLACE INTO otps (email, purpose, code_hash, expires_at, attempts) VALUES (?, ?, ?, ?, 0)'
  ).run(key, purpose, codeHash, Date.now() + OTP_TTL_MS);
  if (!mailConfigured()) {
    console.log(`[otp] ${purpose} code for ${email}: ${code} (valid 10 min; no mail provider configured)`);
    return { sent: false, throttled: false };
  }
  const result = await sendMail({ to: key, ...codeEmail(code, purpose) });
  if (!result.ok) console.warn(`[otp] could not email ${purpose} code to ${email}: ${result.error}`);
  return { sent: result.ok, throttled: false };
}

function checkOtp(email, purpose, code) {
  const key = email.toLowerCase();
  const row = db.prepare('SELECT * FROM otps WHERE email = ? AND purpose = ?').get(key, purpose);
  if (!row || row.expires_at < Date.now()) return false;
  const codeHash = crypto.createHash('sha256').update(String(code).trim()).digest('hex');
  const a = Buffer.from(codeHash);
  const b = Buffer.from(String(row.code_hash));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    // Too many wrong guesses burns the code; the user requests a new one.
    if ((row.attempts || 0) + 1 >= OTP_MAX_ATTEMPTS) {
      db.prepare('DELETE FROM otps WHERE email = ? AND purpose = ?').run(key, purpose);
    } else {
      db.prepare('UPDATE otps SET attempts = attempts + 1 WHERE email = ? AND purpose = ?').run(key, purpose);
    }
    return false;
  }
  db.prepare('DELETE FROM otps WHERE email = ? AND purpose = ?').run(key, purpose);
  return true;
}

// --- Routes ---------------------------------------------------------------
function registerAuthRoutes(app) {
  app.post('/api/auth/register', limits.register, async (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    if (String(password).length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
    if (getUserByEmail(email)) return res.status(409).json({ error: 'An account with this email already exists' });
    const id = crypto.randomUUID();
    const hash = await bcrypt.hash(password, 10);
    const required = verificationRequired();
    db.prepare(
      'INSERT INTO users (id, email, password_hash, role, email_verified, created_date) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(id, email.toLowerCase(), hash, 'user', required ? 0 : 1, new Date().toISOString());
    if (!required) return res.json({ success: true, requires_verification: false });
    const { sent } = await deliverOtp(email, 'verify');
    res.json({ success: true, requires_verification: true, email_sent: sent });
  });

  app.post('/api/auth/verify-otp', limits.checkCode, (req, res) => {
    const { email, otpCode } = req.body || {};
    if (!email || !otpCode) return res.status(400).json({ error: 'Email and code required' });
    if (!checkOtp(email, 'verify', otpCode)) return res.status(400).json({ error: 'Invalid or expired code. After 5 wrong tries a code stops working — request a new one.' });
    db.prepare('UPDATE users SET email_verified = 1 WHERE email = ?').run(email.toLowerCase());
    res.json({ success: true });
  });

  app.post('/api/auth/resend-otp', limits.sendCode, async (req, res) => {
    const { email } = req.body || {};
    // Same answer whether or not the account exists (no account probing).
    const result = email && getUserByEmail(email) ? await deliverOtp(email, 'verify') : { throttled: false };
    if (result.throttled) return res.status(429).json({ error: 'Please wait a minute before requesting another code.' });
    res.json({ success: true });
  });

  app.post('/api/auth/login', limits.login, async (req, res) => {
    const { email, password } = req.body || {};
    const row = email ? getUserByEmail(email) : null;
    if (!row || !row.password_hash) return res.status(401).json({ error: 'Invalid email or password' });
    const ok = await bcrypt.compare(password || '', row.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid email or password' });
    if (!row.email_verified && verificationRequired()) {
      return res.status(403).json({ error: 'Email not verified', code: 'email_not_verified' });
    }
    if (!secretUsable()) return res.status(503).json({ error: 'Server misconfigured: sign-in is disabled.' });
    res.json({ access_token: signToken(row), user: publicUser(row) });
  });

  app.get('/api/auth/me', authRequired, (req, res) => {
    res.json({ user: req.user });
  });

  app.post('/api/auth/reset-password-request', limits.sendCode, async (req, res) => {
    const { email } = req.body || {};
    const result = email && getUserByEmail(email) ? await deliverOtp(email, 'reset') : { throttled: false };
    if (result.throttled) return res.status(429).json({ error: 'Please wait a minute before requesting another code.' });
    res.json({ success: true });
  });

  app.post('/api/auth/reset-password', limits.checkCode, async (req, res) => {
    const { email, otpCode, newPassword } = req.body || {};
    if (!email || !otpCode || !newPassword) return res.status(400).json({ error: 'Email, code and new password required' });
    if (String(newPassword).length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
    if (!checkOtp(email, 'reset', otpCode)) return res.status(400).json({ error: 'Invalid or expired code. After 5 wrong tries a code stops working — request a new one.' });
    const hash = await bcrypt.hash(newPassword, 10);
    db.prepare('UPDATE users SET password_hash = ?, email_verified = 1 WHERE email = ?').run(hash, email.toLowerCase());
    // A reset usually means the old password may be known: end every session.
    const row = getUserByEmail(email);
    if (row) revokeSessions(row.id);
    res.json({ success: true });
  });

  // Signed-in password change. Google-only accounts (no password yet) can set
  // one without a current password. Other devices are signed out; this one
  // gets a fresh token.
  app.post('/api/auth/change-password', authRequired, limits.login, async (req, res) => {
    const { currentPassword, newPassword } = req.body || {};
    if (String(newPassword || '').length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
    const row = getUserById(req.user.id);
    if (row.password_hash && !(await bcrypt.compare(String(currentPassword || ''), row.password_hash))) {
      return res.status(403).json({ error: 'Your current password is incorrect' });
    }
    const hash = await bcrypt.hash(String(newPassword), 10);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, row.id);
    const fresh = revokeSessions(row.id);
    require('./audit').audit(req.user, 'account.password_changed', { type: 'user', id: row.id });
    res.json({ success: true, access_token: signToken(fresh), user: publicUser(fresh) });
  });

  // Ends every other session (lost phone, shared computer). This device
  // keeps working with the new token returned here.
  app.post('/api/auth/sign-out-others', authRequired, (req, res) => {
    const fresh = revokeSessions(req.user.id);
    require('./audit').audit(req.user, 'account.signed_out_others', { type: 'user', id: req.user.id });
    res.json({ success: true, access_token: signToken(fresh) });
  });

  app.post('/api/auth/set-role', authRequired, (req, res) => {
    const { role } = req.body || {};
    if (!['employer', 'job_seeker'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
    if (req.user.role === 'admin') return res.json({ success: true, user: req.user }); // admins keep admin
    if (req.user.role === role) return res.json({ success: true, user: req.user });
    // The account type is chosen once, during onboarding.
    if (req.user.role !== 'user') return res.status(403).json({ error: 'Your account type is already set' });
    const data = userData(getUserById(req.user.id));
    if (role === 'employer') data.employer_status = 'pending';
    db.prepare('UPDATE users SET role = ?, data = ? WHERE id = ?').run(role, JSON.stringify(data), req.user.id);
    res.json({ success: true, user: publicUser(getUserById(req.user.id)) });
  });

  // --- Google OAuth (scaffolded; activates when TB_GOOGLE_CLIENT_ID/SECRET are set) ---
  app.get('/api/auth/google', (req, res) => {
    const cid = process.env.TB_GOOGLE_CLIENT_ID;
    if (!cid) return res.status(501).json({ error: 'Google sign-in is not configured on this server yet' });
    const redirectUri = `${req.protocol}://${req.get('host')}/api/auth/google/callback`;
    const state = encodeURIComponent(safeReturnTo(req, req.query.return_to));
    const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${cid}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=openid%20email%20profile&state=${state}`;
    res.redirect(url);
  });

  app.get('/api/auth/google/callback', async (req, res) => {
    const cid = process.env.TB_GOOGLE_CLIENT_ID;
    const secret = process.env.TB_GOOGLE_CLIENT_SECRET;
    if (!cid || !secret) return res.status(501).json({ error: 'Google sign-in is not configured on this server yet' });
    try {
      const redirectUri = `${req.protocol}://${req.get('host')}/api/auth/google/callback`;
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code: req.query.code, client_id: cid, client_secret: secret,
          redirect_uri: redirectUri, grant_type: 'authorization_code',
        }),
      });
      const tokens = await tokenRes.json();
      const infoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      const info = await infoRes.json();
      if (!info.email) throw new Error('No email from Google');
      let row = getUserByEmail(info.email);
      if (!row) {
        const id = crypto.randomUUID();
        const data = info.name ? { full_name: String(info.name) } : {};
        db.prepare(
          'INSERT INTO users (id, email, google_id, role, email_verified, created_date, data) VALUES (?, ?, ?, ?, 1, ?, ?)'
        ).run(id, info.email.toLowerCase(), info.id, 'user', new Date().toISOString(), JSON.stringify(data));
        row = getUserById(id);
      } else if (info.name && !userData(row).full_name) {
        // Backfill the display name for accounts created before it was captured.
        const data = { ...userData(row), full_name: String(info.name) };
        db.prepare('UPDATE users SET data = ? WHERE id = ?').run(JSON.stringify(data), row.id);
        row = getUserById(row.id);
      }
      const token = signToken(row);
      let rawState = '/';
      try { rawState = decodeURIComponent(req.query.state || '/'); } catch { /* malformed */ }
      const returnTo = safeReturnTo(req, rawState);
      const sep = returnTo.includes('#') ? '&' : '#';
      res.redirect(`${returnTo}${sep}tb_token=${token}`);
    } catch (e) {
      res.status(500).json({ error: `Google sign-in failed: ${e.message}` });
    }
  });
}

module.exports = { revokeSessions, signToken, registerAuthRoutes, authRequired, optionalAuth, safeReturnTo, secretStatus, jwtSecret, publicUser, getUserById, getUserByEmail };
