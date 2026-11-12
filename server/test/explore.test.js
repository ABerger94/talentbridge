'use strict';
// Acceptance tests for the Explore / Job Seekers directory (honest directory).
// Run: npm test (repo root) or `node --test server/test/`.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.TB_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-test-'));
process.env.TB_JWT_SECRET = 't'.repeat(48);
process.env.GEMINI_API_KEY = 'test';
process.env.TB_GEMINI_MODELS = 'test-model';
delete process.env.TURSO_DATABASE_URL;

// Stub the AI: score every seeker it is asked about, and record what was asked.
const aiCalls = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  if (!String(url).includes('generativelanguage.googleapis.com')) return realFetch(url, init);
  const prompt = JSON.parse(init.body).contents[0].parts[0].text;
  const roster = JSON.parse(prompt.split('<untrusted source="seeker profiles">\n')[1].split('\n</untrusted>')[0]);
  aiCalls.push({ prompt, ids: roster.map((r) => r.seeker_id) });
  const matches = roster.map((r) => ({ seeker_id: r.seeker_id, match_score: 80, match_summary: 'Hands-on QA lab experience maps to this role.' }));
  return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ matches }) }] } }] }));
};

const jwt = require('jsonwebtoken');
const app = require('../src/index.js');
const { db } = require('../src/db.js');
const { store } = require('../src/entities.js');

let base;
let server;
const tok = (id) => jwt.sign({ sub: id }, process.env.TB_JWT_SECRET);
const call = async (who, method, p, body) => {
  const r = await realFetch(base + p, {
    method,
    headers: { 'content-type': 'application/json', ...(who ? { authorization: `Bearer ${tok(who)}` } : {}) },
    body: body && JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, data: j.data ?? j };
};
const addUser = (id, role, data = {}) => db.prepare(
  "INSERT INTO users (id, email, role, email_verified, created_date, data) VALUES (?, ?, ?, 1, datetime('now'), ?)"
).run(id, `${id}@example.test`, role, JSON.stringify(data));

let job;
test.before(async () => {
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
  addUser('emp', 'employer'); // pre-verification employer => approved
  addUser('other', 'job_seeker');
  job = store.create('Job', { title: 'QA Technician', status: 'active', skills: ['HACCP'] }, 'emp');
});
test.after(() => server.close());

const explore = async () => (await call('emp', 'POST', '/api/functions/findMatchingSeekers', { job_id: job.id })).data;

test('1. a fresh account with no profile work is not listed', async () => {
  addUser('fresh', 'job_seeker', { full_name: 'Fresh Signup' });
  await call('fresh', 'POST', '/api/entities/SeekerProfile', {}); // e.g. created from the Links tab
  const res = await explore();
  assert.equal(res.matches.some((m) => m.seeker.full_name === 'Fresh Signup'), false);
  const list = await call('emp', 'GET', '/api/entities/SeekerProfile');
  assert.equal(list.data.some((p) => p.full_name === 'Fresh Signup'), false);
  const asOtherSeeker = await call('other', 'GET', '/api/entities/SeekerProfile');
  assert.equal(asOtherSeeker.data.length, 0);
});

test('2. name + bio but no skills and no graph is gated out (never scored)', async () => {
  addUser('bioonly', 'job_seeker');
  await call('bioonly', 'POST', '/api/entities/SeekerProfile', { full_name: 'Bio Only', bio: 'I like people.' });
  aiCalls.length = 0;
  const res = await explore();
  assert.equal(res.matches.some((m) => m.seeker.full_name === 'Bio Only'), false);
  for (const c of aiCalls) assert.equal(c.prompt.includes('I like people.'), false);
});

test('3. a complete profile with a graph is listed with a real score and graph data', async () => {
  addUser('maya', 'job_seeker');
  const p = await call('maya', 'POST', '/api/entities/SeekerProfile', {
    full_name: 'Maya Chen', headline: 'Food-safety QA lead', skills: ['HACCP'], resume_url: null,
    capability_graph: { core_execution_vectors: [{ vector: 'Root-cause investigations', strength: 90 }] },
  });
  assert.equal(p.status, 200);
  const res = await explore();
  const m = res.matches.find((x) => x.seeker.full_name === 'Maya Chen');
  assert.ok(m, 'complete profile is listed');
  assert.equal(m.status, 'scored');
  assert.equal(typeof m.match_score, 'number');
  assert.equal(m.seeker.capability_graph.core_execution_vectors[0].vector, 'Root-cause investigations');
  assert.equal('resume_url' in m.seeker, false, 'employers never get resume links from matching');
});

test('3b. scores are cached per (job, seeker): only changed profiles are re-scored', async () => {
  await explore();
  aiCalls.length = 0;
  await explore();
  assert.equal(aiCalls.length, 0, 'nothing changed => no AI calls');
  const maya = store.all('SeekerProfile').find((p) => p.full_name === 'Maya Chen');
  await call('maya', 'PUT', `/api/entities/SeekerProfile/${maya.id}`, { headline: 'Food-safety QA lead (SQF)' });
  await explore();
  assert.equal(aiCalls.length, 1);
  assert.deepEqual(aiCalls[0].ids, [maya.id], 'only the edited profile is re-scored');
});

test('3c. the matching prompt forbids treating missing data as a weakness', async () => {
  aiCalls.length = 0;
  await call('emp', 'POST', '/api/functions/findMatchingSeekers', { job_id: job.id, force: true });
  assert.ok(aiCalls[0].prompt.includes('A missing field is NOT evidence of weakness'));
});

test('4. no UI source renders "Name not provided"', () => {
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);
  const files = walk(path.join(__dirname, '..', '..', 'src')).filter((f) => /\.(jsx?|tsx?)$/.test(f));
  for (const f of files) assert.equal(fs.readFileSync(f, 'utf8').includes('Name not provided'), false, f);
});

test('4b. profiles take the account name and a name cannot be blanked', async () => {
  addUser('g', 'job_seeker', { full_name: 'Google Name' });
  const p = await call('g', 'POST', '/api/entities/SeekerProfile', { headline: 'x' });
  assert.equal(p.data.full_name, 'Google Name');
  const blank = await call('g', 'PUT', `/api/entities/SeekerProfile/${p.data.id}`, { full_name: '  ' });
  assert.equal(blank.status, 400);
});

test('5. an incomplete profile\'s external links are not visible to anyone else', async () => {
  addUser('therapist', 'job_seeker');
  const p = await call('therapist', 'POST', '/api/entities/SeekerProfile', {
    professional_links: [{ url: 'https://care.headway.co/providers/someone?utm_source=x' }],
  });
  const res = await explore();
  assert.equal(JSON.stringify(res).includes('headway'), false);
  const direct = await call('emp', 'GET', `/api/entities/SeekerProfile/${p.data.id}`);
  assert.equal(direct.status, 404);
  const own = await call('therapist', 'GET', `/api/entities/SeekerProfile/${p.data.id}`);
  assert.equal(own.status, 200, 'the owner still sees their own profile');
});

test('6. zero complete seekers => empty list (UI shows the honest empty state)', async () => {
  const job2 = store.create('Job', { title: 'Other role', status: 'active' }, 'emp');
  for (const sp of store.all('SeekerProfile')) store.update('SeekerProfile', sp.id, { open_to_opportunities: false });
  const res = (await call('emp', 'POST', '/api/functions/findMatchingSeekers', { job_id: job2.id })).data;
  assert.deepEqual(res.matches, []);
  for (const sp of store.all('SeekerProfile')) store.update('SeekerProfile', sp.id, { open_to_opportunities: true });
});

test('apply requires the same minimum; invitations only reach listed seekers', async () => {
  const fresh = store.all('SeekerProfile').find((p) => p.full_name === 'Fresh Signup');
  const blocked = await call('fresh', 'POST', '/api/entities/JobApplication', { job_id: job.id });
  assert.equal(blocked.status, 409);
  assert.equal(blocked.data.code, 'profile_incomplete');
  assert.ok(blocked.data.missing.length > 0);
  const ok = await call('maya', 'POST', '/api/entities/JobApplication', { job_id: job.id });
  assert.equal(ok.status, 200);
  const invite = await call('emp', 'POST', '/api/functions/inviteSeekerToJob', { job_id: job.id, seeker_profile_id: fresh.id });
  assert.equal(invite.status, 404);
});

test('"Visible to employers" off hides a complete profile from Explore', async () => {
  const maya = store.all('SeekerProfile').find((p) => p.full_name === 'Maya Chen');
  await call('maya', 'PUT', `/api/entities/SeekerProfile/${maya.id}`, { open_to_opportunities: false });
  const res = await explore();
  assert.equal(res.matches.some((m) => m.seeker_id === maya.id), false);
  // ...but the employer she applied to can still open her profile.
  assert.equal((await call('emp', 'GET', `/api/entities/SeekerProfile/${maya.id}`)).status, 200);
  await call('maya', 'PUT', `/api/entities/SeekerProfile/${maya.id}`, { open_to_opportunities: true });
});
