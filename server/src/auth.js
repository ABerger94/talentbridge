'use strict';
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { db } = require('./db');

const JWT_SECRET = process.env.TB_JWT_SECRET || 'dev-secret-change-me';
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
    data: JSON.parse(row.data || '{}'),
    created_date: row.created_date,
  };
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

function signToken(userRow) {
  return jwt.sign({ sub: userRow.id, email: userRow.email }, JWT_SECRET, {
    expiresIn: '30d',
  });
}

function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const row = getUserById(payload.sub);
    if (!row) return res.status(401).json({ error: 'User not found' });
    req.user = publicUser(row);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// --- OTP -----------------------------------------------------------------
// Codes are generated for real and validated for real. Delivery: when SMTP
// is configured (phase 2) they go by email; until then the code is printed
// to the server console so the owner can complete sign-up while testing.
function issueOtp(email, purpose) {
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  const codeHash = crypto.createHash('sha256').update(code).digest('hex');
  db.prepare(
    'INSERT OR REPLACE INTO otps (email, purpose, code_hash, expires_at) VALUES (?, ?, ?, ?)'
  ).run(email.toLowerCase(), purpose, codeHash, Date.now() + 10 * 60 * 1000);
  console.log(`[otp] ${purpose} code for ${email}: ${code} (valid 10 min)`);
  return code;
}

function checkOtp(email, purpose, code) {
  const row = db
    .prepare('SELECT * FROM otps WHERE email = ? AND purpose = ?')
    .get(email.toLowerCase(), purpose);
  if (!row || row.expires_at < Date.now()) return false;
  const codeHash = crypto.createHash('sha256').update(String(code)).digest('hex');
  if (codeHash !== row.code_hash) return false;
  db.prepare('DELETE FROM otps WHERE email = ? AND purpose = ?').run(
    email.toLowerCase(),
    purpose
  );
  return true;
}

// --- Routes ---------------------------------------------------------------
function registerAuthRoutes(app) {
  app.post('/api/auth/register', async (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    if (String(password).length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
    if (getUserByEmail(email)) return res.status(409).json({ error: 'An account with this email already exists' });
    const id = crypto.randomUUID();
    const hash = await bcrypt.hash(password, 10);
    db.prepare(
      'INSERT INTO users (id, email, password_hash, role, email_verified, created_date) VALUES (?, ?, ?, ?, 0, ?)'
    ).run(id, email.toLowerCase(), hash, 'job_seeker', new Date().toISOString());
    issueOtp(email, 'verify');
    res.json({ success: true, requires_verification: true });
  });

  app.post('/api/auth/verify-otp', (req, res) => {
    const { email, otpCode } = req.body || {};
    if (!email || !otpCode) return res.status(400).json({ error: 'Email and code required' });
    if (!checkOtp(email, 'verify', otpCode)) return res.status(400).json({ error: 'Invalid or expired code' });
    db.prepare('UPDATE users SET email_verified = 1 WHERE email = ?').run(email.toLowerCase());
    res.json({ success: true });
  });

  app.post('/api/auth/resend-otp', (req, res) => {
    const { email } = req.body || {};
    if (email && getUserByEmail(email)) issueOtp(email, 'verify');
    res.json({ success: true });
  });

  app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body || {};
    const row = email ? getUserByEmail(email) : null;
    if (!row || !row.password_hash) return res.status(401).json({ error: 'Invalid email or password' });
    const ok = await bcrypt.compare(password || '', row.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid email or password' });
    if (!row.email_verified) return res.status(403).json({ error: 'Email not verified', code: 'email_not_verified' });
    res.json({ access_token: signToken(row), user: publicUser(row) });
  });

  app.get('/api/auth/me', authRequired, (req, res) => {
    res.json({ user: req.user });
  });

  app.post('/api/auth/reset-password-request', (req, res) => {
    const { email } = req.body || {};
    if (email && getUserByEmail(email)) issueOtp(email, 'reset');
    res.json({ success: true });
  });

  app.post('/api/auth/reset-password', async (req, res) => {
    const { email, otpCode, newPassword } = req.body || {};
    if (!email || !otpCode || !newPassword) return res.status(400).json({ error: 'Email, code and new password required' });
    if (String(newPassword).length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
    if (!checkOtp(email, 'reset', otpCode)) return res.status(400).json({ error: 'Invalid or expired code' });
    const hash = await bcrypt.hash(newPassword, 10);
    db.prepare('UPDATE users SET password_hash = ?, email_verified = 1 WHERE email = ?').run(hash, email.toLowerCase());
    res.json({ success: true });
  });

  app.post('/api/auth/set-role', authRequired, (req, res) => {
    const { role } = req.body || {};
    if (!['employer', 'job_seeker'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
    if (req.user.role === 'admin') return res.json({ success: true, user: req.user }); // admins keep admin
    db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, req.user.id);
    res.json({ success: true, user: publicUser(getUserById(req.user.id)) });
  });

  // --- Google OAuth (scaffolded; activates when TB_GOOGLE_CLIENT_ID/SECRET are set) ---
  app.get('/api/auth/google', (req, res) => {
    const cid = process.env.TB_GOOGLE_CLIENT_ID;
    if (!cid) return res.status(501).json({ error: 'Google sign-in is not configured on this server yet' });
    const redirectUri = `${req.protocol}://${req.get('host')}/api/auth/google/callback`;
    const state = encodeURIComponent(req.query.return_to || '/');
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
        db.prepare(
          'INSERT INTO users (id, email, google_id, role, email_verified, created_date) VALUES (?, ?, ?, ?, 1, ?)'
        ).run(id, info.email.toLowerCase(), info.id, 'job_seeker', new Date().toISOString());
        row = getUserById(id);
      }
      const token = signToken(row);
      const returnTo = decodeURIComponent(req.query.state || '/');
      const sep = returnTo.includes('#') ? '&' : '#';
      res.redirect(`${returnTo}${sep}tb_token=${token}`);
    } catch (e) {
      res.status(500).json({ error: `Google sign-in failed: ${e.message}` });
    }
  });
}

module.exports = { registerAuthRoutes, authRequired, publicUser, getUserById, getUserByEmail };
