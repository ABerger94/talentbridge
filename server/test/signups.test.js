'use strict';
// Admin "Incomplete signups" list and reminder emails.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.TB_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-test-'));
process.env.TB_JWT_SECRET = 't'.repeat(48);
process.env.RESEND_API_KEY = 'test';
process.env.TB_MAIL_FROM = 'TalentBridge <hello@example.test>';
delete process.env.TURSO_DATABASE_URL;

const sent = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  if (String(url).includes('api.resend.com')) {
    sent.push(JSON.parse(init.body));
    return new Response('{"id":"x"}');
  }
  return realFetch(url, init);
};

const jwt = require('jsonwebtoken');
const app = require('../src/index.js');
const { db } = require('../src/db.js');
const { store } = require('../src/entities.js');

let base;
let server;
const call = async (who, method, p) => {
  const r = await realFetch(base + p, { method, headers: { authorization: `Bearer ${jwt.sign({ sub: who }, process.env.TB_JWT_SECRET)}` } });
  return { status: r.status, data: (await r.json()).data };
};
const add = (id, role, verified = 1, data = {}) => db.prepare(
  "INSERT INTO users (id, email, role, email_verified, created_date, data) VALUES (?, ?, ?, ?, datetime('now'), ?)"
).run(id, `${id}@example.test`, role, verified, JSON.stringify(data));

test.before(() => {
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
  add('admin', 'admin');
  add('norole', 'user', 1, { full_name: 'No Role' });
  add('unverified', 'job_seeker', 0);
  add('noprofile', 'job_seeker', 1, { full_name: 'No Profile' });
  add('halfway', 'job_seeker');
  store.create('SeekerProfile', { full_name: 'Half Way', headline: 'Nurse', resume_url: '/api/files/a.pdf' }, 'halfway');
  add('done', 'job_seeker');
  store.create('SeekerProfile', { full_name: 'All Done', headline: 'QA', skills: ['HACCP'] }, 'done');
  add('emp', 'employer');
});
test.after(() => server.close());

test('lists stalled signups at the right step, not complete or employer accounts', async () => {
  const res = await call('admin', 'GET', '/api/admin/incomplete-signups');
  assert.equal(res.status, 200);
  const byId = Object.fromEntries(res.data.map((u) => [u.id, u]));
  assert.deepEqual(Object.keys(byId).sort(), ['halfway', 'noprofile', 'norole', 'unverified']);
  assert.equal(byId.norole.next_step, 'Choose account type');
  assert.equal(byId.unverified.next_step, 'Verify email');
  assert.equal(byId.noprofile.next_step, 'Add name');
  assert.equal(byId.halfway.last_step, 'Upload resume');
  assert.equal(byId.halfway.next_step, 'Add skills or build Capability Graph');
  assert.ok(byId.halfway.percent > byId.noprofile.percent);
});

test('non-admins cannot see the list or send reminders', async () => {
  assert.equal((await call('emp', 'GET', '/api/admin/incomplete-signups')).status, 403);
  assert.equal((await call('halfway', 'POST', '/api/admin/incomplete-signups/noprofile/remind')).status, 403);
});

test('a reminder lists the remaining steps, links to the next one, and is limited to once a week', async () => {
  const first = await call('admin', 'POST', '/api/admin/incomplete-signups/halfway/remind');
  assert.equal(first.status, 200);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to[0], 'halfway@example.test');
  assert.match(sent[0].text, /Add skills or build Capability Graph/);
  assert.match(sent[0].html, /\/dashboard\?tab=resume/);
  const again = await call('admin', 'POST', '/api/admin/incomplete-signups/halfway/remind');
  assert.equal(again.status, 429);
  assert.equal(sent.length, 1);
  const list = await call('admin', 'GET', '/api/admin/incomplete-signups');
  assert.equal(list.data.find((u) => u.id === 'halfway').can_remind, false);
});

test('reminding someone without an account type links to onboarding; complete profiles are refused', async () => {
  await call('admin', 'POST', '/api/admin/incomplete-signups/norole/remind');
  assert.match(sent.at(-1).html, /\/onboarding/);
  assert.equal((await call('admin', 'POST', '/api/admin/incomplete-signups/done/remind')).status, 409);
});
