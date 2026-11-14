'use strict';
// Announcement emails: drafts, preview, tests, confirmed sending in batches,
// provider limits, retries, cancel, and API-key permissions for agents.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.TB_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-test-'));
process.env.TB_JWT_SECRET = 'n'.repeat(48);
process.env.BREVO_API_KEY = 'test';
process.env.TB_MAIL_FROM = 'TalentBridge <team@example.test>';
process.env.CRON_SECRET = 'cron-secret';
delete process.env.TURSO_DATABASE_URL;

// The email provider: records messages; can hit a sending limit or reject an address.
const sent = [];
const provider = { limitAfter: Infinity, reject: new Set() };
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  if (String(url).includes('api.brevo.com')) {
    const mail = JSON.parse(init.body);
    const to = mail.to[0].email;
    if (provider.reject.has(to)) return new Response('{"message":"invalid email"}', { status: 400 });
    if (sent.length >= provider.limitAfter) return new Response('{"message":"You have exceeded your daily sending limit"}', { status: 429 });
    sent.push(mail);
    return new Response('{"messageId":"x"}', { status: 201 });
  }
  return realFetch(url, init);
};

const app = require('../src/index.js');
const { db } = require('../src/db.js');
const { signToken } = require('../src/auth.js');

let base;
let server;
const tokenFor = (id) => signToken(db.prepare('SELECT * FROM users WHERE id = ?').get(id));
const call = async (token, method, p, body, headers = {}) => {
  const r = await realFetch(base + p, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers }, body: body && JSON.stringify(body) });
  const text = await r.text();
  let j = {};
  try { j = JSON.parse(text); } catch { /* not json */ }
  return { status: r.status, data: j.data ?? j, json: j, text };
};
const addUser = (id, role, verified = 1, data = {}) => db.prepare("INSERT INTO users (id, email, role, email_verified, created_date, data) VALUES (?, ?, ?, ?, datetime('now'), ?)")
  .run(id, `${id}@example.test`, role, verified, JSON.stringify(data));
const to = (m) => m.to[0].email;
let admin;
const draft = { subject: 'We updated our Terms', body: 'We’ve updated our Terms of Service.\n\nRead them at https://example.test/terms before December 1.', audience: 'all', button_label: 'Read the terms', button_url: '/terms' };

test.before(() => {
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
  addUser('boss', 'admin', 1, { full_name: 'Bea Boss' });
  addUser('s1', 'job_seeker', 1, { full_name: 'Sam One' });
  addUser('s2', 'job_seeker', 1, { full_name: 'Sky Two' });
  addUser('s3', 'job_seeker', 0); // unverified
  addUser('e1', 'employer', 1, { full_name: 'Erin Emp' });
  admin = tokenFor('boss');
});
test.after(() => server.close());

test('drafts: validated, previewed exactly as sent, counted per audience', async () => {
  assert.equal((await call(admin, 'POST', '/api/admin/announcements', { ...draft, subject: 'x' })).status, 400);
  assert.equal((await call(admin, 'POST', '/api/admin/announcements', { ...draft, button_url: 'javascript:alert(1)' })).status, 400);
  const pv = await call(admin, 'POST', '/api/admin/announcements/preview', draft);
  assert.equal(pv.status, 200);
  assert.equal(pv.data.recipients, 4, 'everyone with a verified email');
  assert.match(pv.data.html, /Hi Bea,/);
  assert.match(pv.data.html, /<a href="https:\/\/example\.test\/terms"/);
  assert.match(pv.data.html, /href="https:\/\/[^"]+\/terms"[^>]*>Read the terms/);
  assert.match(pv.data.text, /We don’t send marketing email\./);
  const list = await call(admin, 'GET', '/api/admin/announcements');
  assert.deepEqual(list.data.audiences.job_seeker, { label: 'Job seekers', verified: 2, all: 3 });
  assert.equal(list.data.mail_configured, true);
  // Content is escaped: no HTML injection.
  const evil = await call(admin, 'POST', '/api/admin/announcements/preview', { ...draft, body: '<script>alert(1)</script>' });
  assert.ok(!evil.data.html.includes('<script>'));
});

test('a test copy goes only to the admin; sending needs the exact recipient count', async () => {
  const d = (await call(admin, 'POST', '/api/admin/announcements', { ...draft, audience: 'job_seeker' })).data;
  assert.equal(d.status, 'draft');
  assert.equal(d.recipients_now, 2);
  sent.length = 0;
  const t = await call(admin, 'POST', `/api/admin/announcements/${d.id}/test`);
  assert.equal(t.data.sent_to, 'boss@example.test');
  assert.deepEqual(sent.map(to), ['boss@example.test']);
  assert.match(sent[0].subject, /^\[Test\]/);
  sent.length = 0;
  const wrong = await call(admin, 'POST', `/api/admin/announcements/${d.id}/send`, { confirm_count: 99 });
  assert.equal(wrong.status, 409);
  assert.equal(wrong.json.recipients, 2);
  assert.equal(sent.length, 0, 'nothing sent');
  const ok = await call(admin, 'POST', `/api/admin/announcements/${d.id}/send`, { confirm_count: 2 });
  assert.equal(ok.status, 200, ok.text);
  assert.equal(ok.data.status, 'done');
  assert.deepEqual(ok.data.progress, { total: 2, sent: 2, failed: 0, pending: 0, cancelled: 0 });
  assert.deepEqual(sent.map(to).sort(), ['s1@example.test', 's2@example.test'], 'verified job seekers only');
  assert.match(sent.find((m) => to(m) === 's1@example.test').htmlContent, /Hi Sam,/);
  // Sent announcements are a record: no edits, no deletion, no resending.
  assert.equal((await call(admin, 'PUT', `/api/admin/announcements/${d.id}`, { subject: 'Changed it' })).status, 409);
  assert.equal((await call(admin, 'DELETE', `/api/admin/announcements/${d.id}`)).status, 409);
  assert.equal((await call(admin, 'POST', `/api/admin/announcements/${d.id}/send`, { confirm_count: 2 })).status, 409);
  const log = db.prepare("SELECT detail FROM audit_log WHERE action = 'announcement.sent'").get();
  assert.equal(JSON.parse(log.detail).recipients, 2);
});

test('a provider limit pauses sending; it resumes later without emailing anyone twice', async () => {
  const d = (await call(admin, 'POST', '/api/admin/announcements', { ...draft, audience: 'all', verified_only: false })).data;
  assert.equal(d.recipients_now, 5);
  sent.length = 0;
  provider.limitAfter = 2;
  const r = await call(admin, 'POST', `/api/admin/announcements/${d.id}/send`, { confirm_count: 5 });
  assert.equal(r.data.status, 'paused');
  assert.match(r.data.note, /sending limit/);
  assert.equal(r.data.progress.sent, 2);
  assert.equal(r.data.progress.pending, 3);
  // The next day: the cron resumes it.
  provider.limitAfter = Infinity;
  assert.equal((await call(null, 'GET', '/api/cron/announcements')).status, 401);
  const c = await call(null, 'GET', '/api/cron/announcements', null, { authorization: 'Bearer cron-secret' });
  assert.equal(c.status, 200);
  const after = (await call(admin, 'GET', `/api/admin/announcements/${d.id}`)).data;
  assert.equal(after.status, 'done');
  assert.equal(after.progress.sent, 5);
  const counts = {};
  for (const m of sent) counts[to(m)] = (counts[to(m)] || 0) + 1;
  assert.equal(Object.keys(counts).length, 5);
  assert.ok(Object.values(counts).every((n) => n === 1), 'nobody twice');
});

test('failed addresses can be retried; sending can be cancelled', async () => {
  const d = (await call(admin, 'POST', '/api/admin/announcements', { ...draft, audience: 'employer' })).data;
  sent.length = 0;
  provider.reject.add('e1@example.test');
  const r = await call(admin, 'POST', `/api/admin/announcements/${d.id}/send`, { confirm_count: 1 });
  assert.equal(r.data.progress.failed, 1);
  const detail = (await call(admin, 'GET', `/api/admin/announcements/${d.id}`)).data;
  assert.equal(detail.failures[0].email, 'e1@example.test');
  provider.reject.clear();
  const retry = await call(admin, 'POST', `/api/admin/announcements/${d.id}/retry`);
  assert.equal(retry.data.progress.sent, 1);
  assert.equal(retry.data.status, 'done');
  // Cancel: nobody still pending is emailed.
  const d2 = (await call(admin, 'POST', '/api/admin/announcements', { ...draft, audience: 'job_seeker' })).data;
  provider.limitAfter = 0;
  sent.length = 0;
  await call(admin, 'POST', `/api/admin/announcements/${d2.id}/send`, { confirm_count: 2 });
  const cancelled = await call(admin, 'POST', `/api/admin/announcements/${d2.id}/cancel`);
  assert.equal(cancelled.data.status, 'cancelled');
  provider.limitAfter = Infinity;
  await call(null, 'GET', '/api/cron/announcements', null, { authorization: 'Bearer cron-secret' });
  assert.equal(sent.length, 0);
});

test('agents: a drafts key writes, previews and tests; only a send key sends', async () => {
  const mk = async (scopes) => (await call(admin, 'POST', '/api/admin/api-keys', { name: `Agent ${scopes.join('+')}`, scopes })).data.key;
  const drafter = await mk(['announcement_drafts']);
  const sender = await mk(['announcements']);
  const created = await call(drafter, 'POST', '/api/admin/announcements', { ...draft, audience: 'employer' });
  assert.equal(created.status, 200, created.text);
  assert.equal(created.data.created_by, 'API key: Agent announcement_drafts');
  assert.equal((await call(drafter, 'PUT', `/api/admin/announcements/${created.data.id}`, { subject: 'Agent-edited subject' })).data.subject, 'Agent-edited subject');
  assert.equal((await call(drafter, 'POST', '/api/admin/announcements/preview', draft)).status, 200);
  sent.length = 0;
  const t = await call(drafter, 'POST', `/api/admin/announcements/${created.data.id}/test`);
  assert.equal(t.status, 200);
  assert.deepEqual(sent.map(to), ['boss@example.test'], 'tests go to the key’s owner');
  const denied = await call(drafter, 'POST', `/api/admin/announcements/${created.data.id}/send`, { confirm_count: 1 });
  assert.equal(denied.status, 403);
  assert.equal(denied.json.code, 'missing_scope');
  // A key without either permission can't even read them.
  const other = await mk(['read']);
  assert.equal((await call(other, 'GET', '/api/admin/announcements')).status, 403);
  // The send key does the whole job.
  sent.length = 0;
  const go = await call(sender, 'POST', `/api/admin/announcements/${created.data.id}/send`, { confirm_count: 1 });
  assert.equal(go.data.status, 'done');
  assert.deepEqual(sent.map(to), ['e1@example.test']);
  const entry = db.prepare("SELECT actor_email FROM audit_log WHERE action = 'announcement.sent' ORDER BY created_date DESC, rowid DESC LIMIT 1").get();
  assert.equal(entry.actor_email, 'API key: Agent announcements');
});
