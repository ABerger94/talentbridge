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
const wdCalls = [];
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
  if (u.includes('acme.wd5.myworkdayjobs.com/wday/cxs/acme/')) {
    if (!u.includes('/AcmeCareers')) return new Response('{}', { status: 404 });
    if (init?.method === 'POST') {
      wdCalls.push(JSON.parse(init.body));
      const { offset, limit } = JSON.parse(init.body);
      const all = Array.from({ length: 25 }, (_, i) => ({
        title: `Plant Operator ${i + 1}`,
        externalPath: `/job/Cedar-Rapids-IA/Plant-Operator-${i + 1}_R-${100 + i}`,
        locationsText: i === 0 ? '2 Locations' : 'Cedar Rapids, IA',
        postedOn: i === 0 ? 'Posted Yesterday' : 'Posted 30+ Days Ago',
        bulletFields: [`R-${100 + i}`],
      }));
      return new Response(JSON.stringify({
        total: offset === 0 ? all.length : 0, // like Workday: only the first page says
        jobPostings: all.slice(offset, offset + limit),
        facets: [{ facetParameter: 'timeType', values: [{ descriptor: 'Full time', id: 'ft', count: 25 }] }, { facetParameter: 'Location_Country', values: [{ descriptor: 'Canada', id: 'ca1', count: 3 }, { descriptor: 'United States of America', id: 'us1', count: 25 }] }],
      }));
    }
    const n = Number(u.match(/Plant-Operator-(\d+)_/)[1]);
    return new Response(JSON.stringify({ jobPostingInfo: {
      title: `Plant Operator ${n}`,
      jobDescription: '<p>Run the mill. <b>Pay:</b> $22 - $28 per hour.</p>',
      location: 'Cedar Rapids, IA', additionalLocations: n === 1 ? ['Decatur, IL'] : undefined,
      startDate: '2026-11-12', timeType: 'Full time',
      jobRequisitionLocation: { country: { alpha2Code: n === 2 ? 'CA' : 'US' } },
    } }));
  }
  if (u.includes('api.smartrecruiters.com/v1/companies/')) {
    const co = u.match(/companies\/([^/?]+)/)[1];
    if (co !== 'AcmeCo') return new Response(JSON.stringify({ totalFound: 0, content: [] }));
    const detail = u.match(/postings\/([^/?]+)$/);
    if (detail) {
      return new Response(JSON.stringify({ id: detail[1], postingUrl: `https://jobs.smartrecruiters.com/AcmeCo/${detail[1]}-role`, jobAd: { sections: {
        jobDescription: { title: 'Job Description', text: '<p>Inspect product. Pay $50,000 - $60,000.</p>' },
        qualifications: { title: 'Qualifications', text: '<ul><li>HACCP</li></ul>' } } } }));
    }
    const region = new URL(u).searchParams.get('region');
    const all = [
      { id: 'sr1', name: 'QA Inspector', releasedDate: '2026-11-10T00:00:00Z', location: { city: 'Columbia', region: 'MD', country: 'us', remote: false, hybrid: true }, typeOfEmployment: { label: 'Full-time' }, company: { name: 'Acme Co' } },
      { id: 'sr2', name: 'Remote Auditor', releasedDate: '2026-11-11T00:00:00Z', location: { city: '', region: '', country: 'us', remote: true }, typeOfEmployment: { label: 'Contract' }, company: { name: 'Acme Co' } },
    ];
    const content = region ? all.filter((j) => j.location.region === region) : all;
    return new Response(JSON.stringify({ totalFound: content.length, content }));
  }
  if (u.includes('apply.workable.com/api/v1/widget/accounts/')) {
    if (!u.includes('/accounts/acmework')) return new Response('Not Found', { status: 404 });
    return new Response(JSON.stringify({ name: 'Acme Works', jobs: [
      { title: 'Lab Tech', shortcode: 'AB1', employment_type: 'Full-time', telecommuting: false, url: 'https://apply.workable.com/j/AB1', published_on: '2026-11-09', locations: [{ countryCode: 'US', city: 'Rockville', region: 'Maryland' }], description: '<p>Run the lab.</p>' },
      { title: 'Berlin Tech', shortcode: 'AB2', employment_type: 'Full-time', url: 'https://apply.workable.com/j/AB2', locations: [{ countryCode: 'DE', city: 'Berlin' }], description: '<p>x</p>' },
    ] }));
  }
  if (u.includes('jobs.workable.com/api/v1/jobs')) {
    const token = new URL(u).searchParams.get('pageToken');
    const job = (id, city, sub) => ({ id, title: `Coordinator ${id}`, state: 'published', description: '<p>Coordinate.</p>', requirementsSection: '<p>HACCP</p>', employmentType: 'Full-time', url: `https://jobs.workable.com/view/${id}`, location: { city, subregion: sub, countryName: 'United States' }, created: '2026-11-12T00:00:00Z', company: { title: 'Local Co' }, workplace: 'on_site' });
    if (!token) return new Response(JSON.stringify({ jobs: [job('w1', 'Baltimore', 'Maryland'), job('w2', 'Arlington', 'Virginia')], nextPageToken: 'p2' }));
    return new Response(JSON.stringify({ jobs: [job('w3', 'Bethesda', 'Maryland'), { ...job('w4', 'Toronto', 'Ontario'), location: { city: 'Toronto', countryName: 'Canada' } }] }));
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
const { syncSource, runImports, htmlToMarkdown, looksUS, salaryOf, parseWorkday } = require('../src/imports.js');
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

test('workday: careers URLs parse to host/site, and only Workday hosts', () => {
  const w = parseWorkday('https://ingredion.wd1.myworkdayjobs.com/en-US/IngredionCareers');
  assert.deepEqual(w, { host: 'ingredion.wd1.myworkdayjobs.com', tenant: 'ingredion', site: 'IngredionCareers', token: 'ingredion.wd1.myworkdayjobs.com/IngredionCareers' });
  assert.equal(parseWorkday('ingredion.wd1.myworkdayjobs.com/IngredionCareers/job/Bedford-Park-IL/Lead_Req-1').token, w.token);
  assert.equal(parseWorkday('https://ingredion.wd1.myworkdayjobs.com/wday/cxs/ingredion/IngredionCareers/jobs').token, w.token);
  assert.equal(parseWorkday('https://evil.example.com/en-US/IngredionCareers'), null);
  assert.equal(parseWorkday('https://myworkdayjobs.com.evil.com/x'), null);
  assert.equal(parseWorkday('https://ingredion.wd1.myworkdayjobs.com/'), null);
  // A site can look like a language code; it is only a locale when something follows it.
  assert.equal(parseWorkday('https://jj.wd5.myworkdayjobs.com/en-US/JJ').token, 'jj.wd5.myworkdayjobs.com/JJ');
  assert.equal(parseWorkday('jj.wd5.myworkdayjobs.com/JJ').token, 'jj.wd5.myworkdayjobs.com/JJ');
});

test('workday sync pages through the US filter, reads details, links to the job page', async () => {
  wdCalls.length = 0;
  const src = source('workday', 'acme.wd5.myworkdayjobs.com/AcmeCareers', 'Acme Foods', 100);
  const r = await syncSource(src);
  // Page size 20 with the US Country facet applied: 25 postings take two pages.
  const pages = wdCalls.filter((b) => b.limit === 20);
  assert.deepEqual(pages.map((b) => b.offset), [0, 20]);
  assert.deepEqual(pages[0].appliedFacets, { Location_Country: ['us1'] });
  assert.equal(r.found, 25);
  const jobs = store.filter('Job', { source_id: src.id });
  assert.equal(jobs.length, 24, 'the posting whose details say Canada is dropped');
  const one = jobs.find((j) => j.title === 'Plant Operator 1');
  assert.equal(one.company, 'Acme Foods');
  assert.equal(one.location, 'Cedar Rapids, IA + 1 more');
  assert.equal(one.external_url, 'https://acme.wd5.myworkdayjobs.com/en-US/AcmeCareers/job/Cedar-Rapids-IA/Plant-Operator-1_R-100');
  assert.equal(one.employment_type, 'full_time');
  assert.equal(one.salary_min, 22 * 2080);
  assert.match(one.description, /Run the mill/);
  assert.equal(one.posted_date.slice(0, 10), '2026-11-12');
  assert.equal(one.external_key, 'workday:acme.wd5.myworkdayjobs.com/AcmeCareers:R-100');
  // Leave the later tests the same data as before.
  for (const j of jobs) store.remove('Job', j.id);
  db.prepare('DELETE FROM job_sources WHERE id = ?').run(src.id);
});

test('smartrecruiters: local states first, details for new postings', async () => {
  const src = source('smartrecruiters', 'AcmeCo', 'Acme Co', 100);
  const r = await syncSource(src);
  assert.equal(r.found, 2, 'the MD posting appears in both the state and US lists but is kept once');
  const jobs = store.filter('Job', { source_id: src.id });
  const qa = jobs.find((j) => j.title === 'QA Inspector');
  assert.equal(qa.location, 'Columbia, MD');
  assert.equal(qa.work_type, 'hybrid');
  assert.match(qa.description, /Inspect product/);
  assert.match(qa.description, /HACCP/);
  assert.equal(qa.salary_min, 50000);
  assert.equal(qa.external_url, 'https://jobs.smartrecruiters.com/AcmeCo/sr1-role');
  const remote = jobs.find((j) => j.title === 'Remote Auditor');
  assert.equal(remote.location, 'Remote');
  assert.equal(remote.employment_type, 'contract');
  for (const j of jobs) store.remove('Job', j.id);
  db.prepare('DELETE FROM job_sources WHERE id = ?').run(src.id);
});

test('workable board keeps US roles; workable search pages and skips duplicates', async () => {
  const board = source('workable', 'acmework', 'Acme Works', 100);
  await syncSource(board);
  const bj = store.filter('Job', { source_id: board.id });
  assert.deepEqual(bj.map((j) => [j.title, j.location, j.external_url]), [['Lab Tech', 'Rockville, Maryland', 'https://apply.workable.com/j/AB1']]);
  const md = source('workable_search', JSON.stringify({ location: 'Maryland' }), 'Workable: Maryland', 100);
  const va = source('workable_search', JSON.stringify({ location: 'Virginia' }), 'Workable: Virginia', 100);
  const r1 = await syncSource(md);
  assert.equal(r1.found, 3, 'two pages, Canada dropped');
  const mj = store.filter('Job', { source_id: md.id });
  assert.equal(mj.find((j) => j.title === 'Coordinator w1').company, 'Local Co');
  assert.match(mj[0].description, /HACCP/);
  assert.equal(mj[0].attribution.label, 'Workable');
  // The Virginia search returns the same postings: they aren't listed twice.
  const r2 = await syncSource(va);
  assert.equal(r2.added, 0);
  for (const j of [...bj, ...mj]) store.remove('Job', j.id);
  for (const s2 of [board, md, va]) db.prepare('DELETE FROM job_sources WHERE id = ?').run(s2.id);
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

test('suggestions honor the seeker\'s filters and report the pool size', async () => {
  const base = store.create('Job', { title: 'QA Food Safety Tech', company: 'Mill Co', location: 'Frederick, MD', status: 'active', work_type: 'onsite', employment_type: 'full_time', salary_min: 45000, salary_max: 52000, skills: ['HACCP'] }, 'emp');
  const remote = store.create('Job', { title: 'Remote QA Lead', company: 'Cloud Co', location: 'Remote', status: 'active', work_type: 'remote', employment_type: 'contract', salary_min: 90000, salary_max: 120000, skills: ['QA'] }, 'emp');
  const nopay = store.create('Job', { title: 'HACCP Coordinator', company: 'Quiet Co', location: 'Austin, TX', status: 'active', work_type: 'onsite', skills: ['HACCP'] }, 'emp');
  const ids = async (qs) => {
    const r = await call('seek', 'GET', `/api/jobs/suggested?${qs}`);
    assert.equal(r.status, 200);
    return { ids: r.json.data.map((j) => j.id), pool: r.json.pool };
  };
  const all = await ids('');
  assert.ok(all.ids.includes(base.id) && all.ids.includes(remote.id));
  const rem = await ids('work_type=remote');
  assert.ok(rem.ids.includes(remote.id) && !rem.ids.includes(base.id));
  assert.ok(rem.pool >= 1 && rem.pool < all.pool);
  const md = await ids('location=maryland');
  assert.ok(md.ids.includes(base.id) && !md.ids.includes(remote.id));
  // Pay: listed pay must reach the minimum; unlisted pay is kept.
  const pay = await ids('min_salary=80000');
  assert.ok(pay.ids.includes(remote.id) && !pay.ids.includes(base.id));
  assert.ok(pay.ids.includes(nopay.id), 'roles without listed pay are kept');
  const contract = await ids('employment_type=contract&origin=direct');
  assert.deepEqual(contract.ids, [remote.id]);
  const bogus = await ids('work_type=spaceship&posted_within=abc');
  assert.equal(bogus.pool, all.pool, 'unknown filter values are ignored');
  store.remove('Job', base.id);
  store.remove('Job', remote.id);
  store.remove('Job', nopay.id);
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
  const wd = await call('adm', 'POST', '/api/admin/job-sources', { kind: 'workday', token: 'https://acme.wd5.myworkdayjobs.com/en-US/AcmeCareers' });
  assert.equal(wd.status, 200, wd.text);
  assert.equal(wd.data.token, 'acme.wd5.myworkdayjobs.com/AcmeCareers');
  assert.equal(wd.data.name, 'Acme');
  assert.equal(wd.data.preview, 25);
  const bogus = await call('adm', 'POST', '/api/admin/job-sources', { kind: 'workday', token: 'https://acme.wd5.myworkdayjobs.com/en-US/NoSuchSite' });
  assert.equal(bogus.status, 400);
  assert.match(bogus.json.error || bogus.text, /No Workday job board/);
  const offsite = await call('adm', 'POST', '/api/admin/job-sources', { kind: 'workday', token: 'https://example.com/en-US/AcmeCareers' });
  assert.equal(offsite.status, 400);
  const sr = await call('adm', 'POST', '/api/admin/job-sources', { kind: 'smartrecruiters', token: 'https://jobs.smartrecruiters.com/AcmeCo' });
  assert.equal(sr.status, 200, sr.text);
  assert.equal(sr.data.token, 'AcmeCo');
  assert.equal(sr.data.name, 'Acme Co');
  const srBad = await call('adm', 'POST', '/api/admin/job-sources', { kind: 'smartrecruiters', token: 'NoSuchCo' });
  assert.equal(srBad.status, 400);
  assert.match(srBad.json.error || srBad.text, /No open jobs on SmartRecruiters/);
  const wk = await call('adm', 'POST', '/api/admin/job-sources', { kind: 'workable', token: 'https://apply.workable.com/acmework/' });
  assert.equal(wk.status, 200, wk.text);
  assert.equal(wk.data.token, 'acmework');
  assert.equal(wk.data.preview, 1);
  const wkBad = await call('adm', 'POST', '/api/admin/job-sources', { kind: 'workable', token: 'nosuchco' });
  assert.equal(wkBad.status, 400);
  const ws = await call('adm', 'POST', '/api/admin/job-sources', { kind: 'workable_search', location: 'Baltimore, MD' });
  assert.equal(ws.status, 200, ws.text);
  const off = await call('adm', 'PUT', '/api/admin/job-sources/greenhouse-tasty', { enabled: false });
  assert.equal(off.status, 200);
  assert.equal(store.filter('Job', { source_id: 'greenhouse-tasty' }).filter((j) => j.status === 'active').length, 0);
});
