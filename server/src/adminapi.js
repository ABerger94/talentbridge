'use strict';
// Admin endpoints added for AI agents and scripts (also usable from an admin
// session): a site overview, jobs (list, close, reopen), users and the
// audit log, plus the OpenAPI description of everything an API key can use.
// Keys and their permissions: apikeys.js.
const { db } = require('./db');
const { authRequired, publicUser } = require('./auth');
const { store } = require('./entities');
const { audit, recentAudit } = require('./audit');

const DAY = 86400000;
const fail = (status, message) => Object.assign(new Error(message), { status });

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admins only' });
  next();
}
// Key management: a signed-in admin only, never an API key.
function requireHumanAdmin(req, res, next) {
  if (req.apiKey) return res.status(403).json({ error: 'API keys can’t manage API keys.' });
  return requireAdmin(req, res, next);
}

function wrap(fn) {
  return async (req, res) => {
    try {
      res.json({ data: await fn(req) });
    } catch (e) {
      if (!e.status || e.status >= 500) require('./monitor').captureServerError(e, req);
      res.status(e.status || 500).json({ error: e.message });
    }
  };
}

const page = (q) => {
  const per = Math.min(Math.max(parseInt(q.per, 10) || 50, 1), 200);
  const p = Math.max(parseInt(q.page, 10) || 1, 1);
  return { per, page: p, offset: (p - 1) * per };
};
const count = (sql, ...args) => db.prepare(sql).get(...args).n;
const jsonField = (f) => `json_extract(data, '$.${f}')`;

function overview() {
  const since7 = new Date(Date.now() - 7 * DAY).toISOString();
  const since30 = new Date(Date.now() - 30 * DAY).toISOString();
  const roles = {};
  const employers = { approved: 0, pending: 0, rejected: 0 };
  for (const row of db.prepare('SELECT * FROM users').all()) {
    const u = publicUser(row);
    roles[u.role] = (roles[u.role] || 0) + 1;
    if (u.role === 'employer' && employers[u.employer_status] != null) employers[u.employer_status] += 1;
  }
  const appStatus = {};
  for (const r of db.prepare(`SELECT ${jsonField('status')} AS s, COUNT(*) AS n FROM records WHERE entity = 'JobApplication' GROUP BY s`).all()) {
    appStatus[r.s || 'unknown'] = r.n;
  }
  const jobs = require('./jobindex').counts();
  const sources = db.prepare('SELECT enabled, last_status, last_run_at FROM job_sources').all();
  return {
    generated_at: new Date().toISOString(),
    users: { by_role: roles, new_7d: count('SELECT COUNT(*) AS n FROM users WHERE created_date >= ?', since7), new_30d: count('SELECT COUNT(*) AS n FROM users WHERE created_date >= ?', since30) },
    employers,
    seekers: {
      profiles: count("SELECT COUNT(*) AS n FROM records WHERE entity = 'SeekerProfile'"),
      with_capability_graph: count(`SELECT COUNT(*) AS n FROM records WHERE entity = 'SeekerProfile' AND json_array_length(${jsonField('capability_graph.core_execution_vectors')}) > 0`),
      graphs_on_current_rubric: count(`SELECT COUNT(*) AS n FROM records WHERE entity = 'SeekerProfile' AND ${jsonField('capability_graph.rubric_version')} >= 2`),
      with_proof_stories: count(`SELECT COUNT(*) AS n FROM records WHERE entity = 'SeekerProfile' AND json_array_length(${jsonField('proof_stories')}) > 0`),
      alert_subscribers: count("SELECT COUNT(*) AS n FROM users WHERE role = 'job_seeker' AND json_extract(data, '$.job_alerts.frequency') IN ('daily', 'weekly')"),
    },
    jobs: {
      posted_active: jobs.direct,
      imported_active: jobs.imported,
      pending_review: count(`SELECT COUNT(*) AS n FROM records WHERE entity = 'Job' AND ${jsonField('status')} = 'pending_review'`),
      posted_closed: count(`SELECT COUNT(*) AS n FROM records WHERE entity = 'Job' AND ${jsonField('status')} = 'closed' AND COALESCE(${jsonField('imported')}, 0) = 0`),
    },
    applications: {
      total: count("SELECT COUNT(*) AS n FROM records WHERE entity = 'JobApplication'"),
      new_7d: count("SELECT COUNT(*) AS n FROM records WHERE entity = 'JobApplication' AND created_date >= ?", since7),
      new_30d: count("SELECT COUNT(*) AS n FROM records WHERE entity = 'JobApplication' AND created_date >= ?", since30),
      by_status: appStatus,
    },
    job_sources: {
      total: sources.length,
      enabled: sources.filter((s) => s.enabled).length,
      with_errors: sources.filter((s) => s.enabled && s.last_status === 'error').length,
      last_run_at: sources.map((s) => s.last_run_at).filter(Boolean).sort().pop() || null,
    },
    open_errors: require('./monitor').recentErrors({ includeResolved: false }).length,
  };
}

// Jobs posted on TalentBridge by default; origin=imported or all for others.
function listJobs(q) {
  const { per, page: p, offset } = page(q);
  const where = ["entity = 'Job'"];
  const args = [];
  const origin = ['imported', 'all'].includes(q.origin) ? q.origin : 'posted';
  if (origin === 'posted') where.push(`COALESCE(${jsonField('imported')}, 0) = 0`);
  if (origin === 'imported') where.push(`${jsonField('imported')} = 1`);
  if (['active', 'closed', 'pending_review'].includes(q.status)) { where.push(`${jsonField('status')} = ?`); args.push(q.status); }
  const text = String(q.q || '').trim().toLowerCase().slice(0, 80);
  if (text) { where.push(`(LOWER(${jsonField('title')}) LIKE ? OR LOWER(${jsonField('company')}) LIKE ?)`); args.push(`%${text}%`, `%${text}%`); }
  const clause = where.join(' AND ');
  const total = count(`SELECT COUNT(*) AS n FROM records WHERE ${clause}`, ...args);
  const rows = db.prepare(`SELECT id, created_by_id, created_date, data FROM records WHERE ${clause} ORDER BY created_date DESC LIMIT ? OFFSET ?`).all(...args, per, offset);
  const ids = rows.map((r) => r.id);
  const apps = new Map();
  if (ids.length) {
    for (const r of db.prepare(`SELECT ${jsonField('job_id')} AS job_id, COUNT(*) AS n FROM records WHERE entity = 'JobApplication' AND ${jsonField('job_id')} IN (${ids.map(() => '?').join(', ')}) GROUP BY job_id`).all(...ids)) apps.set(r.job_id, r.n);
  }
  const jobs = rows.map((r) => {
    const d = JSON.parse(r.data || '{}');
    return {
      id: r.id,
      title: d.title || null,
      company: d.company || null,
      location: d.location || null,
      status: d.status || 'active',
      imported: !!d.imported,
      employer_id: r.created_by_id || null,
      applications: apps.get(r.id) || 0,
      created_date: r.created_date,
      admin_note: d.admin_note || null,
    };
  });
  return { total, page: p, per, jobs };
}

function setJobStatus(user, id, body) {
  const job = store.get('Job', id);
  if (!job) throw fail(404, 'Job not found');
  if (job.imported) throw fail(400, 'Imported jobs follow their source. Turn the source off or remove it instead.');
  const status = body?.status;
  if (!['active', 'closed'].includes(status)) throw fail(400, 'status must be "active" or "closed"');
  if (status === 'active' && job.status === 'pending_review') throw fail(400, 'This role goes live when its employer is approved. Approve the employer instead.');
  const reason = String(body?.reason || '').trim().slice(0, 500);
  if (status === 'closed' && !reason) throw fail(400, 'Give a reason for closing the role (kept in the audit log)');
  const before = job.status || 'active';
  const updated = store.update('Job', id, { status, admin_note: reason || null });
  audit(user, `job.${status === 'closed' ? 'closed' : 'reopened'}_by_admin`, { type: 'job', id }, { title: job.title, from: before, to: status, reason: reason || null });
  return { id, title: updated.title, status: updated.status, previous_status: before };
}

function listUsers(q) {
  const { per, page: p, offset } = page(q);
  const where = [];
  const args = [];
  const text = String(q.q || '').trim().toLowerCase().slice(0, 80);
  if (text) { where.push("(LOWER(email) LIKE ? OR LOWER(json_extract(data, '$.full_name')) LIKE ?)"); args.push(`%${text}%`, `%${text}%`); }
  const rows = db.prepare(`SELECT * FROM users ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY created_date DESC`).all(...args);
  // Role is the effective role (admins can come from TB_ADMIN_EMAILS), so
  // it's filtered here rather than in SQL.
  const role = ['job_seeker', 'employer', 'admin'].includes(q.role) ? q.role : null;
  const users = rows.map(publicUser).filter((u) => !role || u.role === role);
  return {
    total: users.length,
    page: p,
    per,
    users: users.slice(offset, offset + per).map((u) => ({
      id: u.id,
      email: u.email,
      full_name: u.full_name,
      role: u.role,
      email_verified: u.email_verified,
      employer_status: u.employer_status,
      company: u.data?.company?.name || null,
      created_date: u.created_date,
    })),
  };
}

function listAudit(q) {
  const limit = Math.min(Math.max(parseInt(q.limit, 10) || 100, 1), 500);
  const action = String(q.action || '').trim();
  const since = q.since && !Number.isNaN(Date.parse(q.since)) ? new Date(q.since).toISOString() : null;
  const entries = recentAudit(2000).filter((e) => (!action || e.action === action || e.action.startsWith(`${action}.`)) && (!since || e.created_date >= since));
  return { entries: entries.slice(0, limit) };
}

function registerAdminApiRoutes(app) {
  app.get('/api/admin/overview', authRequired, requireAdmin, wrap(() => overview()));
  app.get('/api/admin/jobs', authRequired, requireAdmin, wrap((req) => listJobs(req.query || {})));
  app.post('/api/admin/jobs/:id/status', authRequired, requireAdmin, wrap((req) => setJobStatus(req.user, req.params.id, req.body)));
  app.get('/api/admin/users', authRequired, requireAdmin, wrap((req) => listUsers(req.query || {})));
  app.get('/api/admin/audit', authRequired, requireAdmin, wrap((req) => listAudit(req.query || {})));
  app.get('/api/admin/openapi.json', authRequired, requireAdmin, (req, res) => res.json(require('./openapi').spec()));
  require('./apikeys').registerApiKeyRoutes(app, { authRequired, requireHumanAdmin });
}

module.exports = { registerAdminApiRoutes, overview };
