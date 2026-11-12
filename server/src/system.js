'use strict';
// Admin "System" view (health, usage, errors, audit trail) and the endpoint
// browsers report their own errors to.
const { db } = require('./db');
const { authRequired, optionalAuth, secretStatus, publicUser } = require('./auth');
const { hit, clientIp } = require('./ratelimit');
const monitor = require('./monitor');
const { recentAudit } = require('./audit');

const DAY = 24 * 60 * 60 * 1000;

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admins only' });
  next();
}

function overview() {
  const since7 = new Date(Date.now() - 7 * DAY).toISOString();
  const roles = {};
  for (const row of db.prepare('SELECT * FROM users').all()) {
    const r = publicUser(row).role;
    roles[r] = (roles[r] || 0) + 1;
  }
  const count = (sql, ...args) => db.prepare(sql).get(...args).n;
  const jobStatus = (s) => count("SELECT COUNT(*) AS n FROM records WHERE entity = 'Job' AND json_extract(data, '$.status') = ?", s);
  const mail = {};
  for (const r of db.prepare('SELECT status, COUNT(*) AS n FROM notifications WHERE created_date >= ? GROUP BY status').all(since7)) {
    mail[r.status] = r.n;
  }
  const failedMail = db.prepare(
    "SELECT kind, recipient, error, created_date FROM notifications WHERE status = 'failed' AND created_date >= ? ORDER BY created_date DESC LIMIT 20"
  ).all(since7);
  const files = db.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(size), 0) AS bytes FROM files').get();
  const { providerStatus } = require('./llm');
  const { mailStatus } = require('./mailer');
  return {
    health: {
      auth_secret: secretStatus(),
      ai: providerStatus(),
      mail: mailStatus(),
      storage: require('./storage').storageStatus(),
      database: process.env.TURSO_DATABASE_URL ? 'turso' : 'local file',
    },
    counts: {
      users: roles,
      signups_7d: count('SELECT COUNT(*) AS n FROM users WHERE created_date >= ?', since7),
      jobs_active: jobStatus('active'),
      jobs_pending_review: jobStatus('pending_review'),
      applications_7d: count("SELECT COUNT(*) AS n FROM records WHERE entity = 'JobApplication' AND created_date >= ?", since7),
      messages_7d: count('SELECT COUNT(*) AS n FROM messages WHERE created_date >= ?', since7),
      files: files.n,
      file_bytes: files.bytes,
      files_in_database: count("SELECT COUNT(*) AS n FROM files WHERE storage = 'database'"),
    },
    email_7d: mail,
    failed_emails: failedMail,
  };
}

function registerSystemRoutes(app) {
  app.get('/api/admin/system', authRequired, requireAdmin, (req, res) => {
    res.json({
      data: {
        ...overview(),
        errors: monitor.recentErrors({ includeResolved: req.query.resolved === '1' }),
        audit: recentAudit(200),
      },
    });
  });

  app.post('/api/admin/errors/:signature/resolve', authRequired, requireAdmin, (req, res) => {
    monitor.resolveError(req.params.signature);
    res.json({ data: { resolved: true } });
  });

  // Moves database-stored uploads into the configured bucket, a batch per call.
  app.post('/api/admin/storage/migrate', authRequired, requireAdmin, async (req, res) => {
    try {
      const out = await require('./files').migrateToBucket(20);
      require('./audit').audit(req.user, 'storage.migrated_batch', { type: 'files' }, out);
      res.json({ data: out });
    } catch (e) {
      if (!e.status) monitor.captureServerError(e, req);
      res.status(e.status || 502).json({ error: e.message });
    }
  });

  // Browser errors (window.onerror / unhandled rejections / React crashes).
  // Anonymous allowed (signed-out pages break too) but rate-limited per IP.
  app.post('/api/client-errors', optionalAuth, (req, res) => {
    const r = hit(`client-error:${clientIp(req)}`, 30, 60 * 60 * 1000);
    if (!r.ok) return res.status(204).end();
    const { message, stack, url } = req.body || {};
    if (!message) return res.status(400).json({ error: 'message required' });
    let path = '';
    try { path = new URL(String(url || ''), 'http://x').pathname; } catch { /* ignore */ }
    monitor.record('client', { message: String(message), stack: String(stack || ''), path, userId: req.user?.id });
    res.status(204).end();
  });
}

module.exports = { registerSystemRoutes };
