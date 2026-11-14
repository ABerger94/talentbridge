'use strict';
// Admin API keys, for AI agents and scripts that manage the site.
//
// - Keys look like tb_admin_<random>. Only a SHA-256 hash is stored, and the
//   key itself is shown once, when it's created.
// - A key works on the admin API (/api/admin/...) only, and each endpoint
//   needs a specific permission (scope). Anything not listed in RULES is
//   refused: new admin endpoints stay closed to keys until added here.
// - Without the personal_data scope, names, emails and phone numbers in
//   responses are replaced with "[hidden]".
// - Every change a key makes (any non-GET request) is written to the audit
//   log under the key's name. Each key has its own rate limit.
// - Keys can't create or revoke keys; only a signed-in admin can.
const crypto = require('crypto');
const { db } = require('./db');
const { hit, clientIp } = require('./ratelimit');

db.exec(`
CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  prefix TEXT NOT NULL,
  hash TEXT NOT NULL UNIQUE,
  scopes TEXT NOT NULL,
  created_by TEXT,
  created_date TEXT NOT NULL,
  expires_at TEXT,
  last_used_at TEXT,
  last_ip TEXT,
  use_count INTEGER NOT NULL DEFAULT 0,
  revoked_at TEXT
);
`);

const KEY_PREFIX = 'tb_admin_';
const RATE_PER_HOUR = parseInt(process.env.TB_API_KEY_RATE_PER_HOUR || '', 10) || 1200;

const SCOPES = {
  read: { label: 'Read', detail: 'Site overview, system health, errors, audit log, employers, jobs, users, job sources, reports, incomplete signups.' },
  personal_data: { label: 'Personal data', detail: 'See names, emails and phone numbers. Without it they come back as "[hidden]".' },
  employers: { label: 'Review employers', detail: 'Approve or reject employer accounts.' },
  jobs: { label: 'Moderate jobs', detail: 'Close or reopen job postings.' },
  job_sources: { label: 'Manage job sources', detail: 'Add, change and remove job sources, and run imports.' },
  operations: { label: 'Operations', detail: 'Run job alerts, resolve errors, move stored files, send signup reminders, run the AI fairness check (uses AI calls).' },
};

// [method, path, scope]. scope null = any valid key.
const RULES = [
  ['GET', /^\/api\/admin\/openapi\.json$/, null],
  ['GET', /^\/api\/admin\/(overview|system|reports|employers|incomplete-signups|job-sources|jobs|users|audit)$/, 'read'],
  ['POST', /^\/api\/admin\/employers\/[^/]+\/decision$/, 'employers'],
  ['POST', /^\/api\/admin\/jobs\/[^/]+\/status$/, 'jobs'],
  ['POST', /^\/api\/admin\/job-sources$/, 'job_sources'],
  ['POST', /^\/api\/admin\/job-sources\/run$/, 'job_sources'],
  ['PUT', /^\/api\/admin\/job-sources\/[^/]+$/, 'job_sources'],
  ['DELETE', /^\/api\/admin\/job-sources\/[^/]+$/, 'job_sources'],
  ['POST', /^\/api\/admin\/(alerts\/run|storage\/migrate|ai\/fairness)$/, 'operations'],
  ['POST', /^\/api\/admin\/errors\/[^/]+\/resolve$/, 'operations'],
  ['POST', /^\/api\/admin\/incomplete-signups\/[^/]+\/remind$/, 'operations'],
];

// Fields hidden without the personal_data scope, wherever they appear.
const PERSONAL_FIELDS = new Set([
  'email', 'recipient', 'reporter_email', 'applicant_email', 'actor_email', 'contact_email',
  'phone', 'full_name', 'applicant_name', 'contact_name', 'last_ip', 'ip',
]);

const hashKey = (key) => crypto.createHash('sha256').update(String(key)).digest('hex');
const isKey = (token) => typeof token === 'string' && token.startsWith(KEY_PREFIX);

function ruleFor(method, path) {
  return RULES.find(([m, re]) => m === method && re.test(path)) || null;
}

function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') {
    // A record with an email is a person, so its plain "name" is theirs too
    // (job sources and keys also have names, and those stay).
    const person = 'email' in value;
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      const hide = (PERSONAL_FIELDS.has(k) || (person && k === 'name')) && v != null && v !== '';
      out[k] = hide ? '[hidden]' : redact(v);
    }
    return out;
  }
  return value;
}

const publicKey = (r) => ({
  id: r.id,
  name: r.name,
  prefix: r.prefix,
  scopes: JSON.parse(r.scopes || '[]'),
  created_date: r.created_date,
  expires_at: r.expires_at,
  last_used_at: r.last_used_at,
  use_count: r.use_count,
  revoked_at: r.revoked_at,
  status: r.revoked_at ? 'revoked' : r.expires_at && Date.parse(r.expires_at) <= Date.now() ? 'expired' : 'active',
});

function createKey(user, { name, scopes, expires_in_days } = {}) {
  const label = String(name || '').trim().slice(0, 80);
  if (!label) throw Object.assign(new Error('Give the key a name, e.g. "Ops agent"'), { status: 400 });
  const list = [...new Set((Array.isArray(scopes) ? scopes : []).filter((s) => SCOPES[s]))];
  if (!list.length) throw Object.assign(new Error('Choose at least one permission'), { status: 400 });
  const days = expires_in_days == null || expires_in_days === '' ? null : parseInt(expires_in_days, 10);
  if (days != null && !(days >= 1 && days <= 3650)) throw Object.assign(new Error('Expiry must be 1 to 3650 days, or never'), { status: 400 });
  const key = KEY_PREFIX + crypto.randomBytes(32).toString('base64url');
  const row = {
    id: crypto.randomUUID(),
    name: label,
    prefix: key.slice(0, KEY_PREFIX.length + 4),
    hash: hashKey(key),
    scopes: JSON.stringify(list),
    created_by: user.id,
    created_date: new Date().toISOString(),
    expires_at: days ? new Date(Date.now() + days * 86400000).toISOString() : null,
  };
  db.prepare('INSERT INTO api_keys (id, name, prefix, hash, scopes, created_by, created_date, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(row.id, row.name, row.prefix, row.hash, row.scopes, row.created_by, row.created_date, row.expires_at);
  require('./audit').audit(user, 'api_key.created', { type: 'api_key', id: row.id }, { name: label, scopes: list, expires_at: row.expires_at });
  return { key, ...publicKey({ ...row, use_count: 0 }) };
}

function listKeys() {
  return db.prepare('SELECT * FROM api_keys ORDER BY created_date DESC').all().map(publicKey);
}

function revokeKey(user, id) {
  const row = db.prepare('SELECT * FROM api_keys WHERE id = ?').get(id);
  if (!row) throw Object.assign(new Error('Key not found'), { status: 404 });
  if (!row.revoked_at) {
    db.prepare('UPDATE api_keys SET revoked_at = ? WHERE id = ?').run(new Date().toISOString(), id);
    require('./audit').audit(user, 'api_key.revoked', { type: 'api_key', id }, { name: row.name });
  }
  return publicKey(db.prepare('SELECT * FROM api_keys WHERE id = ?').get(id));
}

// Usage is recorded at most once a minute per key (plus the count).
const lastTouch = new Map();
function touch(row, ip) {
  const now = Date.now();
  if (now - (lastTouch.get(row.id) || 0) < 60000) return;
  lastTouch.set(row.id, now);
  db.prepare('UPDATE api_keys SET last_used_at = ?, last_ip = ?, use_count = use_count + 1 WHERE id = ?').run(new Date(now).toISOString(), ip, row.id);
}

// Runs before every route. Requests without an API key pass straight through.
function apiKeyMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!isKey(token)) return next();
  const deny = (status, error, code) => res.status(status).json({ error, code });
  const row = db.prepare('SELECT * FROM api_keys WHERE hash = ?').get(hashKey(token));
  if (!row) return deny(401, 'Unknown API key', 'invalid_key');
  if (row.revoked_at) return deny(401, 'This API key was revoked', 'key_revoked');
  if (row.expires_at && Date.parse(row.expires_at) <= Date.now()) return deny(401, 'This API key has expired', 'key_expired');
  const path = req.path;
  if (!path.startsWith('/api/admin/')) return deny(403, 'API keys only work on the admin API (/api/admin/...)', 'admin_api_only');
  if (path.startsWith('/api/admin/api-keys')) return deny(403, 'API keys can’t manage API keys. Sign in as an admin to do that.', 'not_for_keys');
  const scopes = JSON.parse(row.scopes || '[]');
  const rule = ruleFor(req.method, path);
  if (!rule) return deny(403, `${req.method} ${path} isn’t available to API keys. See /api/admin/openapi.json for what is.`, 'not_available');
  if (rule[2] && !scopes.includes(rule[2])) return deny(403, `This key doesn’t have the "${rule[2]}" permission.`, 'missing_scope');
  const limit = hit(`api-key:${row.id}`, RATE_PER_HOUR, 60 * 60 * 1000);
  if (!limit.ok) {
    res.setHeader('Retry-After', String(limit.retryAfter));
    return deny(429, `Rate limit reached (${RATE_PER_HOUR} requests an hour). Try again in ${Math.ceil(limit.retryAfter / 60)} minutes.`, 'rate_limited');
  }
  touch(row, clientIp(req));

  req.apiKey = { id: row.id, name: row.name, scopes };
  // Acts as an admin; the audit log shows the key's name, not a person's.
  req.user = { id: `apikey:${row.id}`, email: `API key: ${row.name}`, role: 'admin', full_name: row.name, api_key: true };

  if (!scopes.includes('personal_data')) {
    const json = res.json.bind(res);
    res.json = (body) => json(redact(body));
  }
  if (req.method !== 'GET') {
    res.on('finish', () => {
      require('./audit').audit(req.user, 'api_key.request', { type: 'api_key', id: row.id }, { method: req.method, path, status: res.statusCode });
    });
  }
  return next();
}

function registerApiKeyRoutes(app, { authRequired, requireHumanAdmin }) {
  const wrap = (fn) => (req, res) => {
    try {
      res.json({ data: fn(req) });
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message });
    }
  };
  app.get('/api/admin/api-keys', authRequired, requireHumanAdmin, wrap(() => ({ keys: listKeys(), scopes: SCOPES })));
  app.post('/api/admin/api-keys', authRequired, requireHumanAdmin, wrap((req) => createKey(req.user, req.body || {})));
  app.post('/api/admin/api-keys/:id/revoke', authRequired, requireHumanAdmin, wrap((req) => revokeKey(req.user, req.params.id)));
}

module.exports = { apiKeyMiddleware, registerApiKeyRoutes, SCOPES, RULES, ruleFor, redact, KEY_PREFIX };
