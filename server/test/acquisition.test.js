'use strict';
// Where signups come from: the campaign link and "How did you hear about us",
// saved once at onboarding and summarized for admins.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.TB_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-test-'));
process.env.TB_JWT_SECRET = 'q'.repeat(48);
delete process.env.TURSO_DATABASE_URL;

const app = require('../src/index.js');
const { db } = require('../src/db.js');
const { signToken } = require('../src/auth.js');

let base;
let server;
const tokenFor = (id) => signToken(db.prepare('SELECT * FROM users WHERE id = ?').get(id));
const call = async (id, method, p, body) => {
  const r = await fetch(base + p, { method, headers: { 'content-type': 'application/json', authorization: `Bearer ${tokenFor(id)}` }, body: body && JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, data: j.data ?? j };
};
const addUser = (id, role = 'user') => db.prepare("INSERT INTO users (id, email, role, email_verified, created_date, data) VALUES (?, ?, ?, 1, ?, '{}')")
  .run(id, `${id}@example.test`, role, new Date().toISOString());
const acq = (id) => JSON.parse(db.prepare('SELECT data FROM users WHERE id = ?').get(id).data || '{}').acquisition;

test.before(() => {
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
  addUser('boss', 'admin');
});
test.after(() => server.close());

test('onboarding saves where the person came from, cleaned, once', async () => {
  addUser('u1');
  const r = await call('u1', 'POST', '/api/functions/setUserRole', {
    role: 'job_seeker', heard_from: 'linkedin',
    acquisition: { utm_source: 'LinkedIn', utm_medium: 'profile_share', utm_campaign: 'ShowWhatYouCanDo<script>', referrer: 'www.linkedin.com', landing: '/p/sam-1a2b', password: 'nope' },
  });
  assert.equal(r.status, 200);
  const a = acq('u1');
  assert.equal(a.heard_from, 'linkedin');
  assert.equal(a.utm_source, 'linkedin');
  assert.equal(a.utm_campaign, 'showwhatyoucandoscript', 'markup stripped');
  assert.equal(a.landing, '/p/sam-1a2b');
  assert.equal(a.password, undefined, 'unknown keys dropped');
  // Employers through the other endpoint; unknown answers and junk are ignored.
  addUser('e1');
  await call('e1', 'POST', '/api/auth/set-role', { role: 'employer', heard_from: 'carrier pigeon', acquisition: 'junk' });
  assert.equal(acq('e1'), undefined, 'nothing useful, nothing saved');
  addUser('e2');
  await call('e2', 'POST', '/api/auth/set-role', { role: 'employer', heard_from: 'job_center' });
  assert.equal(acq('e2').heard_from, 'job_center');
  // It's saved once: a later call can't rewrite it.
  db.prepare("UPDATE users SET role = 'user' WHERE id = 'u1'").run();
  await call('u1', 'POST', '/api/functions/setUserRole', { role: 'job_seeker', heard_from: 'x' });
  assert.equal(acq('u1').heard_from, 'linkedin');
});

test('admins see signups by answer, link source and campaign', async () => {
  addUser('u2');
  await call('u2', 'POST', '/api/functions/setUserRole', { role: 'job_seeker', acquisition: { referrer: 'www.facebook.com' } });
  const o = (await call('boss', 'GET', '/api/admin/overview')).data.signup_sources;
  assert.equal(o.days, 30);
  assert.equal(o.signups, 4, 'admins not counted');
  const by = (list, v) => list.find((x) => x.value === v)?.signups || 0;
  assert.equal(by(o.heard_from, 'linkedin'), 1);
  assert.equal(o.heard_from.find((x) => x.value === 'job_center').label, 'A job center, school or program');
  assert.equal(by(o.source, 'linkedin'), 1);
  assert.equal(by(o.source, 'referral: www.facebook.com'), 1, 'a plain referral counts as its site');
  assert.equal(by(o.campaign, 'showwhatyoucandoscript'), 1);
  const sys = (await call('boss', 'GET', '/api/admin/system')).data;
  assert.equal(sys.signup_sources.signups, 4, 'on the System tab too');
  assert.equal((await call('u2', 'GET', '/api/admin/overview')).status, 403);
});
