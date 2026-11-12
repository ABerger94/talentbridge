'use strict';
// Sessions (revocation, password change), account export and deletion,
// upload content checks, storage request signing, security headers.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

process.env.TB_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-test-'));
process.env.TB_JWT_SECRET = 'a'.repeat(48);
delete process.env.TURSO_DATABASE_URL;

const bcrypt = require('bcryptjs');
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
  return { status: r.status, data: j.data ?? j, headers: r.headers };
};
const addUser = (id, role, password) => db.prepare(
  "INSERT INTO users (id, email, role, email_verified, created_date, data, password_hash) VALUES (?, ?, ?, 1, datetime('now'), '{}', ?)"
).run(id, `${id}@example.test`, role, password ? bcrypt.hashSync(password, 4) : null);

test.before(() => {
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => server.close());

test('changing the password ends other sessions and returns a working token', async () => {
  addUser('pw', 'job_seeker', 'oldpassword1');
  const t1 = tokenFor('pw');
  assert.equal((await call(t1, 'GET', '/api/auth/me')).status, 200);
  const wrong = await call(t1, 'POST', '/api/auth/change-password', { currentPassword: 'nope', newPassword: 'newpassword1' });
  assert.equal(wrong.status, 403);
  const ok = await call(t1, 'POST', '/api/auth/change-password', { currentPassword: 'oldpassword1', newPassword: 'newpassword1' });
  assert.equal(ok.status, 200);
  const old = await call(t1, 'GET', '/api/auth/me');
  assert.equal(old.status, 401);
  assert.equal(old.data.code, 'session_revoked');
  assert.equal((await call(ok.data.access_token, 'GET', '/api/auth/me')).status, 200);
});

test('sign out other devices revokes earlier tokens only', async () => {
  addUser('so', 'job_seeker', 'password123');
  const other = tokenFor('so');
  const res = await call(other, 'POST', '/api/auth/sign-out-others');
  assert.equal(res.status, 200);
  assert.equal((await call(other, 'GET', '/api/auth/me')).status, 401);
  assert.equal((await call(res.data.access_token, 'GET', '/api/auth/me')).status, 200);
  const audit = db.prepare("SELECT * FROM audit_log WHERE action = 'account.signed_out_others'").all();
  assert.equal(audit.length, 1);
});

test('export returns the caller’s data as a download', async () => {
  addUser('ex', 'job_seeker', 'password123');
  store.create('SeekerProfile', { full_name: 'Ex Porter', skills: ['QA'] }, 'ex');
  const res = await call(tokenFor('ex'), 'GET', '/api/account/export');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-disposition'), /attachment/);
  assert.equal(res.data.account.email, 'ex@example.test');
  assert.equal(res.data.seeker_profiles[0].full_name, 'Ex Porter');
});

test('deleting a seeker anonymizes applications and removes personal data', async () => {
  addUser('boss', 'employer');
  addUser('gone', 'job_seeker', 'password123');
  const job = store.create('Job', { title: 'Analyst', status: 'active' }, 'boss');
  const profile = store.create('SeekerProfile', { full_name: 'Gone Person', resume_url: '/api/files/x.pdf' }, 'gone');
  const application = store.create('JobApplication', {
    job_id: job.id, employer_user_id: 'boss', seeker_profile_id: profile.id,
    applicant_name: 'Gone Person', applicant_email: 'gone@example.test', cover_letter: 'Hi', status: 'applied',
  }, 'gone');
  db.prepare('INSERT INTO messages (id, application_id, sender_id, body, created_date) VALUES (?, ?, ?, ?, ?)')
    .run('m1', application.id, 'gone', 'hello from candidate', new Date().toISOString());
  db.prepare('INSERT INTO messages (id, application_id, sender_id, body, created_date) VALUES (?, ?, ?, ?, ?)')
    .run('m2', application.id, 'boss', 'hello from employer', new Date().toISOString());

  const t = tokenFor('gone');
  assert.equal((await call(t, 'POST', '/api/account/delete', { password: 'wrong' })).status, 403);
  const res = await call(t, 'POST', '/api/account/delete', { password: 'password123' });
  assert.equal(res.status, 200, JSON.stringify(res.data));

  assert.equal(db.prepare('SELECT * FROM users WHERE id = ?').get('gone'), undefined);
  assert.equal(store.get('SeekerProfile', profile.id), null);
  const after = store.get('JobApplication', application.id);
  assert.equal(after.applicant_name, 'Deleted user');
  assert.equal(after.applicant_email, null);
  assert.equal(after.cover_letter, null);
  assert.equal(after.created_by_id, null);
  const msgs = db.prepare('SELECT sender_id FROM messages WHERE application_id = ?').all(application.id).map((m) => m.sender_id);
  assert.deepEqual(msgs, ['boss']);
  // The employer still sees the (anonymous) application.
  const seen = await call(tokenFor('boss'), 'GET', `/api/entities/JobApplication/${application.id}`);
  assert.equal(seen.status, 200);
  assert.equal(seen.data.applicant_name, 'Deleted user');
  // The old token is dead.
  assert.equal((await call(t, 'GET', '/api/auth/me')).status, 401);
});

test('deleting an employer closes roles with applicants and removes empty ones', async () => {
  addUser('emp2', 'employer', 'password123');
  addUser('cand2', 'job_seeker');
  const withApps = store.create('Job', { title: 'Has applicants', status: 'active' }, 'emp2');
  const empty = store.create('Job', { title: 'Empty', status: 'active' }, 'emp2');
  const a = store.create('JobApplication', { job_id: withApps.id, employer_user_id: 'emp2', status: 'applied' }, 'cand2');
  const res = await call(tokenFor('emp2'), 'POST', '/api/account/delete', { password: 'password123' });
  assert.equal(res.status, 200);
  assert.equal(store.get('Job', empty.id), null);
  assert.equal(store.get('Job', withApps.id).status, 'closed');
  assert.equal(store.get('JobApplication', a.id).employer_deleted, true);
});

test('admins cannot delete their account here', async () => {
  addUser('adm', 'admin', 'password123');
  const res = await call(tokenFor('adm'), 'POST', '/api/account/delete', { password: 'password123' });
  assert.equal(res.status, 403);
});

test('uploads must really be the type their extension says', async () => {
  addUser('up', 'job_seeker');
  const send = async (name, bytes) => {
    const form = new FormData();
    form.append('file', new Blob([bytes]), name);
    const r = await fetch(`${base}/api/files/upload`, { method: 'POST', headers: { authorization: `Bearer ${tokenFor('up')}` }, body: form });
    return r.status;
  };
  assert.equal(await send('resume.pdf', Buffer.from('%PDF-1.4\n...')), 200);
  assert.equal(await send('resume.pdf', Buffer.from('<html><script>alert(1)</script>')), 415);
  assert.equal(await send('resume.docx', Buffer.from('not a zip')), 415);
  assert.equal(await send('notes.txt', Buffer.from('<svg onload=alert(1)>')), 415);
  assert.equal(await send('evil.html', Buffer.from('<html>')), 415);
  assert.equal(await send('big.pdf', Buffer.concat([Buffer.from('%PDF-'), Buffer.alloc(5 * 1024 * 1024)])), 413);
});

test('S3 request signing matches the AWS Signature V4 test vectors', () => {
  const { signRequest } = require('../src/storage');
  const keys = { accessKeyId: 'AKIAIOSFODNN7EXAMPLE', secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY', region: 'us-east-1', now: new Date('2013-05-24T00:00:00Z') };
  const get = signRequest({
    method: 'GET', url: 'https://examplebucket.s3.amazonaws.com/test.txt', headers: { range: 'bytes=0-9' },
    payloadHash: crypto.createHash('sha256').update('').digest('hex'), ...keys,
  });
  assert.match(get.authorization, /Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41$/);
  const put = signRequest({
    method: 'PUT', url: 'https://examplebucket.s3.amazonaws.com/test%24file.text',
    headers: { date: 'Fri, 24 May 2013 00:00:00 GMT', 'x-amz-storage-class': 'REDUCED_REDUNDANCY' },
    payloadHash: crypto.createHash('sha256').update('Welcome to Amazon S3.').digest('hex'), ...keys,
  });
  assert.match(put.authorization, /Signature=98ad721746da40c64f1a55b78f14c238d841ea1380cd77a1b5971af0ece108bd$/);
});

test('security headers: API responses carry them and vercel.json matches', async () => {
  const res = await call(null, 'GET', '/api/health');
  const { HEADERS } = require('../src/security');
  assert.equal(res.headers.get('content-security-policy'), HEADERS['Content-Security-Policy']);
  assert.equal(res.headers.get('x-frame-options'), 'DENY');
  const vercel = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'vercel.json'), 'utf8'));
  const fromVercel = Object.fromEntries(vercel.headers.find((h) => h.source === '/(.*)').headers.map((h) => [h.key, h.value]));
  assert.deepEqual(fromVercel, HEADERS);
});

test('server errors are grouped and listed for admins', async () => {
  const monitor = require('../src/monitor');
  const err = new Error('Boom 123');
  monitor.captureServerError(err, { method: 'GET', path: '/x' });
  monitor.captureServerError(Object.assign(new Error('Boom 456'), { stack: err.stack }), { method: 'GET', path: '/x' });
  const r = await call(null, 'POST', '/api/client-errors', { message: 'TypeError: x is undefined', url: 'https://site/jobs?q=1' });
  assert.equal(r.status, 204);
  addUser('sysadm', 'admin');
  const sys = await call(tokenFor('sysadm'), 'GET', '/api/admin/system');
  assert.equal(sys.status, 200);
  const boom = sys.data.errors.find((e) => e.message.startsWith('Boom'));
  assert.equal(boom.count, 2);
  assert.ok(sys.data.errors.some((e) => e.source === 'client' && e.path === '/jobs'));
  assert.equal(sys.data.health.storage.backend, 'database');
  assert.equal((await call(tokenFor('up'), 'GET', '/api/admin/system')).status, 403);
});
