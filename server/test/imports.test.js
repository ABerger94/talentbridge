'use strict';
// Imported job listings: normalization, sync (add / close / reopen), search,
// suggestions, and the rules that keep them link-out only and unindexed.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.TB_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-test-'));
process.env.TB_JWT_SECRET = 'i'.repeat(48);
delete process.env.TURSO_DATABASE_URL;
delete process.env.USAJOBS_API_KEY;

let ghJobs = [
  { id: 1, title: 'Line Cook', absolute_url: 'https://careers.example/jobs/1', location: { name: 'Baltimore, MD' }, first_published: '2026-11-10T10:00:00Z' },
  { id: 2, title: 'Senior QA Analyst', absolute_url: 'https://careers.example/jobs/2', location: { name: 'Remote - US' }, first_published: '2026-11-09T10:00:00Z' },
  { id: 3, title: 'Barista', absolute_url: 'https://careers.example/jobs/3', location: { name: 'London, UK' }, first_published: '2026-11-08T10:00:00Z' },
];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const u = String(url);
  if (u.includes('boards-api.greenhouse.io')) {
    const m = u.match(/jobs\/(\d+)$/);
    if (m) {
      return new Response(JSON.stringify({ content: '&lt;h3&gt;About&lt;/h3&gt;&lt;p&gt;Pay: $20 - $25 per hour. &lt;strong&gt;HACCP&lt;/strong&gt; a plus.&lt;/p&gt;&lt;script&gt;x&lt;/script&gt;' }));
    }
    return new Response(JSON.stringify({ jobs: ghJobs }));
  }
  if (u.includes('api.lever.co')) {
    return new Response(JSON.stringify([{ id: 'lv1', text: 'Clinical Operations Lead', hostedUrl: 'https://jobs.lever.co/x/lv1', categories: { location: 'New York, NY', commitment: 'Full-time' }, country: 'US', workplaceType: 'hybrid', description: '<p>Run clinics.</p>', lists: [{ text: 'You will', content: '<li>Hire</li>' }], createdAt: Date.parse('2026-11-01') }]));
  }
  return realFetch(url, init);
};

const app = require('../src/index.js');
const { db } = require('../src/db.js');
const { store } = require('../src/entities.js');
const { signToken } = require('../src/auth.js');
const { syncSource, runImports, htmlToMarkdown, looksUS, salaryOf } = require('../src/imports.js');
const jobindex = require('../src/jobindex.js');

let base;
let server;
const tokenFor = (id) => signToken(db.prepare('SELECT * FROM users WHERE id = ?').get(id));
const call = async (who, method, p, body) => {
  const r = await realFetch(base + p, { method, headers: { 'content-type': 'application/json', ...(who ? { authorization: `Bearer ${tokenFor(who)}` } : {}) }, body: body && JSON.stringify(body) });
  const text = await r.text();
  let j = {}; try { j = JSON.parse(text); } catch { /* html */ }
  return { status: r.status, data: j.data ?? j, text, json: j };
};
const addUser = (id, role) => db.prepare("INSERT INTO users (id, email, role, email_verified, created_date, data) VALUES (?, ?, ?, 1, datetime('now'), '{}')").run(id, `${id}@example.test`, role);
const source = (kind, token, name, max = 30) => {
  const id = `${kind}-${token}`;
  db.prepare("INSERT OR REPLACE INTO job_sources (id, kind, token, name, enabled, max_jobs, created_date) VALUES (?, ?, ?, ?, 1, ?, datetime('now'))").run(id, kind, token, name, max);
  return db.prepare('SELECT * FROM job_sources WHERE id = ?').get(id);
};

test.before(() => {
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
  // Keep the default seeded sources from running in these tests.
  db.prepare('UPDATE job_sources SET enabled = 0').run();
});
test.after(() => server.close());

test('helpers: HTML to Markdown, US filter, pay parsing', () => {
  const md = htmlToMarkdown('&lt;h3&gt;About&lt;/h3&gt;&lt;p&gt;Hi &lt;b&gt;there &lt;/b&gt;&lt;/p&gt;&lt;ul&gt;&lt;li&gt;One&lt;/li&gt;&lt;/ul&gt;&lt;script&gt;alert(1)&lt;/script&gt;');
  assert.match(md, /\*\*About\*\*/);
  assert.match(md, /\*\*there\*\*/);
  assert.match(md, /- One/);
  assert.doesNotMatch(md, /alert|<|>/);
  assert.equal(looksUS('Baltimore, MD'), true);
  assert.equal(looksUS('Remote - US'), true);
  assert.equal(looksUS('London, UK'), false);
  assert.equal(looksUS('Toronto', 'Canada'), false);
  assert.deepEqual(salaryOf('$20 - $25 per hour'), { salary_min: 41600, salary_max: 52000 });
  assert.deepEqual(salaryOf('$120K – $150K'), { salary_min: 120000, salary_max: 150000 });
});

test('a board sync imports US jobs, then closes and reopens as the board changes', async () => {
  const src = source('greenhouse', 'tasty', 'Tasty Foods');
  const first = await syncSource(src);
  assert.equal(first.added, 2); // London job filtered out
  const jobs = store.filter('Job', { source_id: src.id });
  const cook = jobs.find((j) => j.title === 'Line Cook');
  assert.equal(cook.imported, true);
  assert.equal(cook.company, 'Tasty Foods');
  assert.equal(cook.external_url, 'https://careers.example/jobs/1');
  assert.equal(cook.salary_min, 41600);
  assert.match(cook.description, /\*\*HACCP\*\*/);
  assert.equal(store.filter('Job', { source_id: src.id }).find((j) => j.title === 'Senior QA Analyst').work_type, 'remote');

  // Unchanged board: nothing new.
  assert.equal((await syncSource(src)).added, 0);
  // Job 1 comes down at the source: closed here.
  ghJobs = ghJobs.filter((j) => j.id !== 1);
  const second = await syncSource(src);
  assert.equal(second.closed, 1);
  assert.equal(store.get('Job', cook.id).status, 'closed');
  // ...and back up: reopened, not duplicated.
  ghJobs.push({ id: 1, title: 'Line Cook', absolute_url: 'https://careers.example/jobs/1', location: { name: 'Baltimore, MD' }, first_published: '2026-11-10T10:00:00Z' });
  const third = await syncSource(src);
  assert.equal(third.reopened, 1);
  assert.equal(third.added, 0);
  assert.equal(store.get('Job', cook.id).status, 'active');
});

test('lever sync maps commitment, workplace and sections', async () => {
  const src = source('lever', 'clinic', 'Clinic Co');
  await syncSource(src);
  const [job] = store.filter('Job', { source_id: src.id });
  assert.equal(job.employment_type, 'full_time');
  assert.equal(job.work_type, 'hybrid');
  assert.equal(job.experience_level, 'lead');
  assert.match(job.description, /\*\*You will\*\*\n- Hire/);
});

test('keyed sources wait for their keys and report it', async () => {
  const src = source('usajobs', '{"location":"Maryland"}', 'USAJOBS: Maryland');
  await assert.rejects(() => syncSource(src), /USAJOBS_API_KEY/);
  const report = await runImports({ sourceIds: [src.id], force: true });
  assert.equal(report.errors.length, 1);
  assert.equal(db.prepare('SELECT last_status FROM job_sources WHERE id = ?').get(src.id).last_status, 'needs_key');
});

test('search: TalentBridge roles first, filters, state names, paging', async () => {
  addUser('emp', 'employer');
  store.create('Job', { title: 'QA Lead', company: 'Acme', location: 'Annapolis, MD', status: 'active', work_type: 'onsite' }, 'emp');
  const all = await call(null, 'GET', '/api/jobs/search');
  assert.equal(all.status, 200);
  assert.equal(all.data.jobs[0].title, 'QA Lead');
  assert.equal(all.data.jobs[0].imported, false);
  assert.ok(all.data.jobs.some((j) => j.imported && j.title === 'Line Cook'));
  const md = await call(null, 'GET', '/api/jobs/search?location=maryland');
  assert.deepEqual(md.data.jobs.map((j) => j.title).sort(), ['Line Cook', 'QA Lead']);
  const remote = await call(null, 'GET', '/api/jobs/search?location=remote');
  assert.deepEqual(remote.data.jobs.map((j) => j.title), ['Senior QA Analyst']);
  const imported = await call(null, 'GET', '/api/jobs/search?origin=imported&q=cook');
  assert.deepEqual(imported.data.jobs.map((j) => j.title), ['Line Cook']);
  const paged = await call(null, 'GET', '/api/jobs/search?per=1&page=2');
  assert.equal(paged.data.jobs.length, 1);
  assert.equal(paged.data.total, all.data.total);
});

test('suggestions rank roles by overlap with the profile', async () => {
  addUser('seek', 'job_seeker');
  store.create('SeekerProfile', { full_name: 'Sam', headline: 'Food safety QA analyst', skills: ['HACCP', 'QA'] }, 'seek');
  const res = await call('seek', 'GET', '/api/jobs/suggested');
  assert.equal(res.status, 200);
  const titles = res.data.map((j) => j.title);
  assert.ok(titles.includes('Senior QA Analyst'));
  assert.ok(titles.indexOf('Senior QA Analyst') < titles.indexOf('Clinical Operations Lead') || !titles.includes('Clinical Operations Lead'));
});

test('imported jobs: no in-app applications, noindex page, not in sitemap', async () => {
  const cook = store.filter('Job', { source_id: 'greenhouse-tasty' }).find((j) => j.title === 'Line Cook');
  const apply = await call('seek', 'POST', '/api/entities/JobApplication', { job_id: cook.id });
  assert.equal(apply.status, 409);
  assert.equal(apply.json.code, 'external_job');
  const sitemap = await realFetch(`${base}/sitemap.xml`).then((r) => r.text());
  assert.ok(!sitemap.includes(cook.id));
  assert.equal(jobindex.counts().imported >= 3, true);
});

test('admins manage sources; others cannot', async () => {
  addUser('adm', 'admin');
  assert.equal((await call('seek', 'GET', '/api/admin/job-sources')).status, 403);
  const list = await call('adm', 'GET', '/api/admin/job-sources');
  assert.equal(list.status, 200);
  assert.ok(list.data.sources.length > 50); // seeded defaults
  const added = await call('adm', 'POST', '/api/admin/job-sources', { kind: 'greenhouse', token: 'https://boards.greenhouse.io/newco', name: 'NewCo' });
  assert.equal(added.status, 200, JSON.stringify(added.data));
  assert.equal(added.data.token, 'newco');
  const dup = await call('adm', 'POST', '/api/admin/job-sources', { kind: 'greenhouse', token: 'newco' });
  assert.equal(dup.status, 409);
  const off = await call('adm', 'PUT', '/api/admin/job-sources/greenhouse-tasty', { enabled: false });
  assert.equal(off.status, 200);
  assert.equal(store.filter('Job', { source_id: 'greenhouse-tasty' }).filter((j) => j.status === 'active').length, 0);
});
