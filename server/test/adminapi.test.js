'use strict';
// Admin API keys (scopes, privacy, revocation, audit) and the agent-facing
// admin endpoints and OpenAPI description.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.TB_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-test-'));
process.env.TB_JWT_SECRET = 'k'.repeat(48);
delete process.env.TURSO_DATABASE_URL;

const app = require('../src/index.js');
const { db } = require('../src/db.js');
const { store } = require('../src/entities.js');
const { signToken } = require('../src/auth.js');

let base;
let server;
const tokenFor = (id) => signToken(db.prepare('SELECT * FROM users WHERE id = ?').get(id));
const call = async (token, method, p, body) => {
  const r = await fetch(base + p, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body && JSON.stringify(body),
  });
  const text = await r.text();
  let j = {};
  try { j = JSON.parse(text); } catch { /* not json */ }
  return { status: r.status, data: j.data ?? j, json: j, headers: r.headers };
};
const addUser = (id, role, data = {}) => db.prepare("INSERT INTO users (id, email, role, email_verified, created_date, data) VALUES (?, ?, ?, 1, datetime('now'), ?)")
  .run(id, `${id}@example.test`, role, JSON.stringify(data));

let adminToken;
const newKey = async (scopes, extra = {}) => {
  const r = await call(adminToken, 'POST', '/api/admin/api-keys', { name: `Agent ${scopes.join('+')}`, scopes, ...extra });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  return r.data;
};

test.before(() => {
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
  addUser('boss', 'admin', { full_name: 'Bea Boss' });
  addUser('emp1', 'employer', { full_name: 'Eli Employer', employer_status: 'pending', company: { name: 'Acme Foods' } });
  addUser('seek1', 'job_seeker', { full_name: 'Sam Seeker' });
  adminToken = tokenFor('boss');
});
test.after(() => server.close());

test('admins create keys; the key is shown once and stored only as a hash', async () => {
  const k = await newKey(['read']);
  assert.match(k.key, /^tb_admin_[A-Za-z0-9_-]{40,}$/);
  assert.equal(k.prefix, k.key.slice(0, 13));
  assert.deepEqual(k.scopes, ['read']);
  const list = await call(adminToken, 'GET', '/api/admin/api-keys');
  assert.equal(list.status, 200);
  const listed = list.data.keys.find((x) => x.id === k.id);
  assert.equal(listed.key, undefined);
  assert.equal(listed.status, 'active');
  assert.ok(!JSON.stringify(list.data).includes(k.key), 'never listed again');
  assert.ok(list.data.scopes.personal_data);
  const stored = db.prepare('SELECT * FROM api_keys WHERE id = ?').get(k.id);
  assert.notEqual(stored.hash, k.key);
  assert.equal((await call(adminToken, 'POST', '/api/admin/api-keys', { name: 'x', scopes: ['nope'] })).status, 400);
  assert.equal((await call(adminToken, 'POST', '/api/admin/api-keys', { name: '', scopes: ['read'] })).status, 400);
  // Seekers can't make keys.
  assert.equal((await call(tokenFor('seek1'), 'POST', '/api/admin/api-keys', { name: 'x', scopes: ['read'] })).status, 403);
});

test('a key reads the overview and the API description', async () => {
  const { key } = await newKey(['read']);
  const o = await call(key, 'GET', '/api/admin/overview');
  assert.equal(o.status, 200, JSON.stringify(o.json));
  assert.equal(o.data.employers.pending, 1);
  assert.equal(o.data.users.by_role.job_seeker, 1);
  assert.ok('with_capability_graph' in o.data.seekers);
  const spec = await call(key, 'GET', '/api/admin/openapi.json');
  assert.equal(spec.status, 200);
  assert.equal(spec.json.openapi, '3.1.0');
  assert.equal(spec.json.paths['/api/admin/employers/{id}/decision'].post['x-required-scope'], 'employers');
});

test('permissions are enforced, and keys stay on the admin API', async () => {
  const { key } = await newKey(['read']);
  const deny = await call(key, 'POST', '/api/admin/employers/emp1/decision', { decision: 'approve' });
  assert.equal(deny.status, 403);
  assert.equal(deny.json.code, 'missing_scope');
  assert.equal(db.prepare('SELECT data FROM users WHERE id = ?').get('emp1').data.includes('"pending"'), true, 'nothing changed');
  const elsewhere = await call(key, 'GET', '/api/entities/SeekerProfile');
  assert.equal(elsewhere.status, 403);
  assert.equal(elsewhere.json.code, 'admin_api_only');
  const unlisted = await call(key, 'GET', '/api/admin/some-new-endpoint');
  assert.equal(unlisted.json.code, 'not_available');
  const keyMgmt = await call(key, 'GET', '/api/admin/api-keys');
  assert.equal(keyMgmt.status, 403);
  // A key with the right permission can act.
  const reviewer = await newKey(['read', 'employers']);
  const ok = await call(reviewer.key, 'POST', '/api/admin/employers/emp1/decision', { decision: 'approve', note: 'Verified' });
  assert.equal(ok.status, 200, JSON.stringify(ok.json));
});

test('personal details are hidden without the personal_data permission', async () => {
  const plain = await newKey(['read']);
  const users = await call(plain.key, 'GET', '/api/admin/users?role=job_seeker');
  assert.equal(users.status, 200);
  assert.equal(users.data.users[0].email, '[hidden]');
  assert.equal(users.data.users[0].full_name, '[hidden]');
  assert.equal(users.data.users[0].role, 'job_seeker');
  const emps = await call(plain.key, 'GET', '/api/admin/employers?status=all');
  const acme = emps.data.find((e) => e.id === 'emp1');
  assert.equal(acme.email, '[hidden]');
  assert.equal(acme.name, '[hidden]', 'a person’s plain name field');
  assert.equal(acme.company.name, 'Acme Foods', 'company names stay');
  const full = await newKey(['read', 'personal_data']);
  const seen = await call(full.key, 'GET', '/api/admin/users?q=sam');
  assert.equal(seen.data.users[0].email, 'seek1@example.test');
  assert.equal(seen.data.users[0].full_name, 'Sam Seeker');
  // Signed-in admins see everything, as before.
  assert.equal((await call(adminToken, 'GET', '/api/admin/users?q=sam')).data.users[0].email, 'seek1@example.test');
});

test('revoked, expired and unknown keys are refused', async () => {
  const k = await newKey(['read']);
  assert.equal((await call(k.key, 'GET', '/api/admin/overview')).status, 200);
  assert.equal((await call(adminToken, 'POST', `/api/admin/api-keys/${k.id}/revoke`)).data.status, 'revoked');
  const r = await call(k.key, 'GET', '/api/admin/overview');
  assert.equal(r.status, 401);
  assert.equal(r.json.code, 'key_revoked');
  const e = await newKey(['read'], { expires_in_days: 30 });
  db.prepare('UPDATE api_keys SET expires_at = ? WHERE id = ?').run('2020-01-01T00:00:00.000Z', e.id);
  assert.equal((await call(e.key, 'GET', '/api/admin/overview')).json.code, 'key_expired');
  assert.equal((await call('tb_admin_madeup', 'GET', '/api/admin/overview')).json.code, 'invalid_key');
});

test('jobs: list, close with a reason, reopen; imported and held roles are protected', async () => {
  const live = store.create('Job', { title: 'Line Lead', company: 'Acme Foods', status: 'active', location: 'Baltimore, MD' }, 'emp1');
  const held = store.create('Job', { title: 'QA Tech', company: 'Acme Foods', status: 'pending_review' }, 'emp1');
  const imported = store.create('Job', { title: 'Imported Role', company: 'Elsewhere', status: 'active', imported: true }, null);
  const mod = await newKey(['read', 'jobs']);
  const list = await call(mod.key, 'GET', '/api/admin/jobs?q=acme');
  assert.equal(list.status, 200);
  assert.deepEqual(list.data.jobs.map((j) => j.title).sort(), ['Line Lead', 'QA Tech']);
  assert.equal((await call(mod.key, 'GET', '/api/admin/jobs?origin=imported')).data.jobs[0].title, 'Imported Role');
  assert.equal((await call(mod.key, 'POST', `/api/admin/jobs/${live.id}/status`, { status: 'closed' })).status, 400, 'needs a reason');
  const closed = await call(mod.key, 'POST', `/api/admin/jobs/${live.id}/status`, { status: 'closed', reason: 'Duplicate posting' });
  assert.equal(closed.status, 200);
  assert.equal(store.get('Job', live.id).status, 'closed');
  assert.equal((await call(mod.key, 'POST', `/api/admin/jobs/${live.id}/status`, { status: 'active' })).data.status, 'active');
  assert.equal((await call(mod.key, 'POST', `/api/admin/jobs/${held.id}/status`, { status: 'active' })).status, 400);
  assert.equal((await call(mod.key, 'POST', `/api/admin/jobs/${imported.id}/status`, { status: 'closed', reason: 'x' })).status, 400);
});

test('changes made with a key are in the audit log under its name', async () => {
  const mod = await newKey(['read', 'jobs']);
  const job = store.create('Job', { title: 'Audit Me', status: 'active' }, 'emp1');
  await call(mod.key, 'POST', `/api/admin/jobs/${job.id}/status`, { status: 'closed', reason: 'Spam' });
  const log = await call(adminToken, 'GET', '/api/admin/audit?action=job');
  const entry = log.data.entries.find((e) => e.action === 'job.closed_by_admin' && e.target_id === job.id);
  assert.equal(entry.actor_email, 'API key: Agent read+jobs');
  assert.equal(entry.detail.reason, 'Spam');
  const mine = async () => (await call(adminToken, 'GET', '/api/admin/audit?action=api_key.request')).data.entries.filter((e) => e.target_id === mod.id);
  const [req] = await mine();
  assert.deepEqual(req.detail, { method: 'POST', path: `/api/admin/jobs/${job.id}/status`, status: 200 });
  // Reads aren't logged as changes.
  await call(mod.key, 'GET', '/api/admin/overview');
  assert.equal((await mine()).length, 1);
});

test('the OpenAPI description and the key rules agree, operation by operation', () => {
  const { OPERATIONS } = require('../src/openapi.js');
  const { ruleFor } = require('../src/apikeys.js');
  for (const [method, p, scope] of OPERATIONS) {
    const concrete = p.replace(/\{[^}]+\}/g, 'abc123');
    const rule = ruleFor(method.toUpperCase(), concrete);
    assert.ok(rule, `${method} ${p} is documented but keys can't use it`);
    assert.deepEqual(rule[2], scope, `${method} ${p}: documented scope ${scope}, enforced ${rule[2]}`);
  }
  const { RULES } = require('../src/apikeys.js');
  for (const [method, re] of RULES) {
    assert.ok(OPERATIONS.some(([m, p]) => m.toUpperCase() === method && re.test(p.replace(/\{[^}]+\}/g, 'abc123'))), `${method} ${re} is allowed for keys but not documented`);
  }
});
