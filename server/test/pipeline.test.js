'use strict';
// Interviews in the employer's time zone with calendar invites, and per-role stats.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.TB_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-test-'));
process.env.TB_JWT_SECRET = 'p'.repeat(48);
process.env.BREVO_API_KEY = 'test';
process.env.TB_MAIL_FROM = 'TalentBridge <team@example.test>';
delete process.env.TURSO_DATABASE_URL;

const sent = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  if (String(url).includes('api.brevo.com')) {
    sent.push(JSON.parse(init.body));
    return new Response('{}', { status: 201 });
  }
  return realFetch(url, init);
};

const app = require('../src/index.js');
const { db } = require('../src/db.js');
const { store } = require('../src/entities.js');
const { signToken } = require('../src/auth.js');
const { ics, fold, interviewEvent } = require('../src/calendar.js');

let base;
let server;
const tokenFor = (id) => signToken(db.prepare('SELECT * FROM users WHERE id = ?').get(id));
const call = async (who, method, p, body, headers = {}) => {
  const r = await realFetch(base + p, {
    method,
    headers: { 'content-type': 'application/json', ...(who ? { authorization: `Bearer ${tokenFor(who)}` } : {}), ...headers },
    body: body && JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, data: j.data ?? j };
};
const addUser = (id, role, data = {}) => db.prepare(
  "INSERT INTO users (id, email, role, email_verified, created_date, data) VALUES (?, ?, ?, 1, datetime('now'), ?)"
).run(id, `${id}@example.test`, role, JSON.stringify(data));

let job;
let application;
test.before(() => {
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
  addUser('emp', 'employer');
  addUser('cand', 'job_seeker');
  job = store.create('Job', { title: 'QA Technician', company: 'Acme', status: 'active' }, 'emp');
  application = store.create('JobApplication', {
    job_id: job.id, employer_user_id: 'emp', applicant_name: 'Sam Lee', applicant_email: 'cand@example.test', status: 'applied',
  }, 'cand');
});
test.after(() => server.close());

test('interview invitations show the employer’s time zone and save length and place', async () => {
  const res = await call('emp', 'POST', '/api/functions/sendInterviewInvitation', {
    application_id: application.id, proposed_time: '2026-11-18T19:00:00.000Z',
    timezone: 'America/New_York', duration_minutes: 30, location: 'https://meet.example/abc',
  });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  const saved = store.get('JobApplication', application.id);
  assert.equal(saved.interview_timezone, 'America/New_York');
  assert.equal(saved.interview_duration_minutes, 30);
  const mail = sent.at(-1);
  assert.match(mail.textContent, /2:00 PM EST \(7:00 PM UTC\)/);
  assert.match(mail.textContent, /meet\.example\/abc/);
});

test('accepting sends both sides a calendar invite', async () => {
  sent.length = 0;
  const res = await call('cand', 'POST', '/api/functions/respondToInterview', { application_id: application.id, response: 'accepted' });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  assert.equal(sent.length, 2);
  for (const m of sent) {
    assert.equal(m.attachment[0].name, 'interview.ics');
    const body = Buffer.from(m.attachment[0].content, 'base64').toString('utf8');
    assert.match(body, /DTSTART:20261118T190000Z/);
    assert.match(body, /DTEND:20261118T193000Z/);
  }
  assert.deepEqual(sent.map((m) => m.to[0].email).sort(), ['cand@example.test', 'emp@example.test']);
});

test('calendar files fold long lines and escape text', () => {
  const event = interviewEvent({ id: 'x', interview_proposed_time: '2026-11-18T19:00:00Z', interview_location: 'Room 4; Floor 2, Building A' }, { title: 'T'.repeat(120) });
  const text = ics(event);
  assert.ok(text.split('\r\n').every((l) => Buffer.byteLength(l) <= 75));
  assert.match(text, /LOCATION:Room 4\; Floor 2\\, Building A/);
  assert.equal(fold('é'.repeat(60)).split('\r\n').every((l) => Buffer.byteLength(l) <= 75), true);
});

test('role stats count unique visitors (not the owner or bots) and the pipeline', async () => {
  const ua = { 'user-agent': 'Mozilla/5.0 Test' };
  await call(null, 'GET', `/api/entities/Job/${job.id}`, null, ua);
  await call(null, 'GET', `/api/entities/Job/${job.id}`, null, ua); // same visitor, same day
  await call('cand', 'GET', `/api/entities/Job/${job.id}`, null, ua);
  await call('emp', 'GET', `/api/entities/Job/${job.id}`, null, ua); // owner: not counted
  await call(null, 'GET', `/api/entities/Job/${job.id}`, null, { 'user-agent': 'Googlebot/2.1' });
  const stats = await call('emp', 'GET', '/api/employer/job-stats');
  assert.equal(stats.status, 200);
  const s = stats.data.find((x) => x.job_id === job.id);
  assert.equal(s.views, 2);
  assert.equal(s.applicants, 1);
  assert.equal(s.pipeline.interview, 1);
  assert.equal(s.response_rate, 100);
  assert.equal((await call('cand', 'GET', '/api/employer/job-stats')).status, 403);
});

test('a role whose only applications were withdrawn can be deleted; active ones block it', async () => {
  const solo = store.create('Job', { title: 'Temp role', status: 'closed' }, 'emp');
  const gone = store.create('JobApplication', { job_id: solo.id, employer_user_id: 'emp', status: 'withdrawn' }, 'cand');
  const live = store.create('Job', { title: 'Busy role', status: 'active' }, 'emp');
  store.create('JobApplication', { job_id: live.id, employer_user_id: 'emp', status: 'applied' }, 'cand');
  assert.equal((await call('emp', 'DELETE', `/api/entities/Job/${live.id}`)).status, 409);
  const res = await call('emp', 'DELETE', `/api/entities/Job/${solo.id}`);
  assert.equal(res.status, 200);
  assert.equal(store.get('Job', solo.id), null);
  assert.equal(store.get('JobApplication', gone.id), null);
});
