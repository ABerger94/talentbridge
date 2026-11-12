'use strict';
// Job alert emails: opt-in, new roles only, threshold, one-click unsubscribe.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.TB_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-test-'));
process.env.TB_JWT_SECRET = 'l'.repeat(48);
process.env.GEMINI_API_KEY = 'test';
process.env.TB_GEMINI_MODELS = 'test-model';
process.env.BREVO_API_KEY = 'test';
process.env.TB_MAIL_FROM = 'TalentBridge <team@example.test>';
process.env.CRON_SECRET = 'cron-secret';
delete process.env.TURSO_DATABASE_URL;

const sent = [];
let aiCalls = 0;
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const u = String(url);
  if (u.includes('api.brevo.com')) {
    sent.push(JSON.parse(init.body));
    return new Response('{}', { status: 201 });
  }
  if (u.includes('generativelanguage.googleapis.com')) {
    aiCalls += 1;
    const prompt = JSON.parse(init.body).contents[0].parts[0].text;
    const roster = JSON.parse(prompt.split('<untrusted source="seeker profiles">\n')[1].split('\n</untrusted>')[0]);
    const title = prompt.match(/Title: (.*)/)[1];
    const matches = roster.map((r) => ({ seeker_id: r.seeker_id, match_score: /QA/.test(title) ? 88 : 30, match_summary: `Fit for ${title}` }));
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ matches }) }] } }] }));
  }
  return realFetch(url, init);
};

const app = require('../src/index.js');
const { db } = require('../src/db.js');
const { store } = require('../src/entities.js');
const { signToken } = require('../src/auth.js');
const { runJobAlerts, unsubscribeUrl } = require('../src/alerts.js');

let base;
let server;
const tokenFor = (id) => signToken(db.prepare('SELECT * FROM users WHERE id = ?').get(id));
const call = async (token, method, p, body, headers = {}) => {
  const r = await realFetch(base + p, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
    body: body && JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, data: j.data ?? j };
};
const addUser = (id, role) => db.prepare(
  "INSERT INTO users (id, email, role, email_verified, created_date, data) VALUES (?, ?, ?, 1, datetime('now'), '{}')"
).run(id, `${id}@example.test`, role);

test.before(() => {
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
  addUser('emp', 'employer');
  addUser('alice', 'job_seeker');
  addUser('bob', 'job_seeker'); // never opts in
  for (const id of ['alice', 'bob']) {
    store.create('SeekerProfile', { full_name: `${id} Smith`, headline: 'QA analyst', skills: ['QA'] }, id);
  }
});
test.after(() => server.close());

test('only opted-in seekers get alerts, for new roles above their minimum', async () => {
  const old = store.create('Job', { title: 'QA Old', status: 'active' }, 'emp');
  db.prepare("UPDATE records SET created_date = '2020-01-01T00:00:00Z' WHERE id = ?").run(old.id);
  const pref = await call(tokenFor('alice'), 'PUT', '/api/alerts/preferences', { frequency: 'daily', min_score: 80 });
  assert.equal(pref.status, 200);
  assert.equal(pref.data.frequency, 'daily');
  await new Promise((r) => setTimeout(r, 5));
  store.create('Job', { title: 'QA Lead', company: 'Acme', status: 'active' }, 'emp');
  store.create('Job', { title: 'Sales Rep', status: 'active' }, 'emp');

  const report = await runJobAlerts();
  assert.equal(report.due, 1);
  assert.equal(report.emailed, 1);
  assert.equal(sent.length, 1);
  const mail = sent[0];
  assert.equal(mail.to[0].email, 'alice@example.test');
  assert.match(mail.subject, /QA Lead at Acme/);
  assert.doesNotMatch(mail.textContent, /Sales Rep|QA Old/);
  assert.ok(mail.headers['List-Unsubscribe'].includes('/api/alerts/unsubscribe'));

  // Not due again the same day.
  const again = await runJobAlerts();
  assert.equal(again.due, 0);
});

test('cron endpoint requires the secret', async () => {
  assert.equal((await call(null, 'GET', '/api/cron/job-alerts')).status, 401);
  const ok = await call(null, 'GET', '/api/cron/job-alerts', null, { authorization: 'Bearer cron-secret' });
  assert.equal(ok.status, 200);
});

test('one-click unsubscribe works and rejects forged links', async () => {
  const url = new URL(unsubscribeUrl('alice'));
  const forged = await realFetch(`${base}/api/alerts/unsubscribe?u=alice&sig=nope`);
  assert.equal(forged.status, 400);
  const res = await realFetch(`${base}${url.pathname}${url.search}`, { method: 'POST' });
  assert.equal(res.status, 200);
  const pref = await call(tokenFor('alice'), 'GET', '/api/alerts/preferences');
  assert.equal(pref.data.frequency, 'off');
});

test('employers cannot subscribe and bad values are refused', async () => {
  assert.equal((await call(tokenFor('emp'), 'PUT', '/api/alerts/preferences', { frequency: 'daily' })).status, 403);
  assert.equal((await call(tokenFor('bob'), 'PUT', '/api/alerts/preferences', { frequency: 'hourly' })).status, 400);
});
