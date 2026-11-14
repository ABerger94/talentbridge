'use strict';
// Seeker profile pages: who can see them, what's hidden, views, the public
// share link, and profile photos.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.TB_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-test-'));
process.env.TB_JWT_SECRET = 'p'.repeat(48);
delete process.env.TURSO_DATABASE_URL;

const app = require('../src/index.js');
const { db } = require('../src/db.js');
const { store } = require('../src/entities.js');
const { signToken } = require('../src/auth.js');

let base;
let server;
const tokenFor = (id) => signToken(db.prepare('SELECT * FROM users WHERE id = ?').get(id));
const call = async (who, method, p, body) => {
  const r = await fetch(base + p, {
    method,
    headers: { 'content-type': 'application/json', ...(who ? { authorization: `Bearer ${tokenFor(who)}` } : {}) },
    body: body && JSON.stringify(body),
  });
  const text = await r.text();
  let j = {};
  try { j = JSON.parse(text); } catch { /* html or image */ }
  return { status: r.status, data: j.data ?? j, text, headers: r.headers };
};
const addUser = (id, role, data = {}) => db.prepare("INSERT INTO users (id, email, role, email_verified, created_date, data) VALUES (?, ?, ?, 1, datetime('now'), ?)")
  .run(id, `${id}@example.test`, role, JSON.stringify(data));

// A real 1x1 PNG.
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

let profile;
test.before(async () => {
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
  addUser('seek', 'job_seeker');
  addUser('other', 'job_seeker');
  addUser('emp', 'employer', { employer_status: 'approved', company: { name: 'Acme Foods' } });
  addUser('pend', 'employer', { employer_status: 'pending', company: { name: 'Waiting Co' } });
  addUser('adm', 'admin');
  const r = await call('seek', 'POST', '/api/entities/SeekerProfile', {
    full_name: 'Dana Quality', headline: 'Food safety QA lead', skills: ['HACCP'], phone: '555-0100',
    work_history: 'QA Lab Manager, Cloverland Farms', education: 'B.S. Biology',
    professional_links: [{ url: 'https://github.com/dana' }],
    resume_url: null,
    proof_stories: [
      { prompt_id: 'investigation', action: 'Traced coliform rise to a cracked gasket', result: 'No recurrence' },
      { prompt_id: 'risk', action: 'Confidential supplier issue', result: 'Contained', private: true },
    ],
    capability_graph: { rubric_version: 2, capability_headline: 'Builds lab systems that prevent repeat problems.', core_execution_vectors: [
      { vector: 'Root cause investigation', level: 4, evidence_type: 'demonstrated', differentiator: true, evidence: 'Gasket fix' },
    ] },
    profile_sharing: { public_enabled: true, public_slug: 'hijacked' }, // ignored: server-controlled
  });
  assert.equal(r.status, 200, r.text);
  profile = r.data;
});
test.after(() => server.close());

test('approved employers see the profile page, without contact details or private stories', async () => {
  const r = await call('emp', 'GET', `/api/profiles/${profile.id}`);
  assert.equal(r.status, 200, r.text);
  assert.equal(r.data.full_name, 'Dana Quality');
  assert.equal(r.data.capability_graph.core_execution_vectors[0].level, 4);
  assert.deepEqual(r.data.proof_stories.map((s) => s.action), ['Traced coliform rise to a cracked gasket']);
  assert.equal(r.data.work_history, 'QA Lab Manager, Cloverland Farms');
  assert.equal(r.data.links[0].url, 'https://github.com/dana');
  assert.ok(!r.text.includes('555-0100') && !r.text.includes('seek@example.test') && !r.text.includes('Confidential'), 'no phone, email or private story');
  assert.equal(r.data.sharing, undefined, 'settings are the seeker’s own');
  // The sharing settings sent with the profile were ignored.
  assert.equal(store.get('SeekerProfile', profile.id).profile_sharing, undefined);
});

test('others can’t see it: pending employers, other seekers, signed-out visitors', async () => {
  assert.equal((await call('pend', 'GET', `/api/profiles/${profile.id}`)).status, 404);
  assert.equal((await call('other', 'GET', `/api/profiles/${profile.id}`)).status, 404);
  assert.equal((await call(null, 'GET', `/api/profiles/${profile.id}`)).status, 401);
  // Hidden from employers: gone, unless they applied to that employer.
  await call('seek', 'PUT', `/api/entities/SeekerProfile/${profile.id}`, { open_to_opportunities: false });
  assert.equal((await call('emp', 'GET', `/api/profiles/${profile.id}`)).status, 404);
  const job = store.create('Job', { title: 'QA Lead', status: 'active' }, 'emp');
  store.create('JobApplication', { job_id: job.id, seeker_profile_id: profile.id, employer_user_id: 'emp', status: 'applied' }, 'seek');
  assert.equal((await call('emp', 'GET', `/api/profiles/${profile.id}`)).status, 200);
  await call('seek', 'PUT', `/api/entities/SeekerProfile/${profile.id}`, { open_to_opportunities: true });
});

test('the seeker previews their own page and sees who viewed it', async () => {
  await call('emp', 'GET', `/api/profiles/${profile.id}`);
  const me = await call('seek', 'GET', '/api/profiles/me');
  assert.equal(me.status, 200);
  assert.equal(me.data.audience, 'owner');
  assert.equal(me.data.views.last_7d, 1, 'one employer, counted once a day');
  assert.equal(me.data.views.recent[0].company, 'Acme Foods');
  assert.equal(me.data.sharing.public_enabled, false);
  // Admins can look, but don't count as views.
  await call('adm', 'GET', `/api/profiles/${profile.id}`);
  assert.equal((await call('seek', 'GET', '/api/profiles/me')).data.views.last_7d, 1);
});

test('hidden sections disappear from every view', async () => {
  const r = await call('seek', 'PUT', '/api/profiles/me/sharing', { hidden_sections: ['work_history', 'links', 'nonsense'] });
  assert.deepEqual(r.data.sharing.hidden_sections, ['work_history', 'links']);
  const e = await call('emp', 'GET', `/api/profiles/${profile.id}`);
  assert.equal(e.data.work_history, null);
  assert.deepEqual(e.data.links, []);
  assert.equal(e.data.education, 'B.S. Biology');
  await call('seek', 'PUT', '/api/profiles/me/sharing', { hidden_sections: [] });
});

test('public link: off by default, a page with preview tags when on, and a new link retires the old one', async () => {
  assert.equal((await call(null, 'GET', '/api/public/profiles/hijacked')).status, 404);
  const on = await call('seek', 'PUT', '/api/profiles/me/sharing', { public_enabled: true });
  const slug = on.data.sharing.public_slug;
  assert.match(slug, /^dana-quality-[a-z0-9]{3,5}$/);
  assert.match(on.data.sharing.public_url, new RegExp(`/p/${slug}$`));
  const pub = await call(null, 'GET', `/api/public/profiles/${slug}`);
  assert.equal(pub.status, 200);
  assert.equal(pub.data.audience, 'public');
  assert.equal(pub.data.full_name, 'Dana Quality');
  assert.ok(!pub.text.includes('Confidential'));
  assert.equal(pub.headers.get('x-robots-tag'), 'noindex, nofollow');
  // The shareable page itself: real preview tags, never indexed.
  const page = await fetch(`${base}/p/${slug}`);
  const html = await page.text();
  assert.match(html, /<title>Dana Quality · Food safety QA lead \| TalentBridge<\/title>/);
  assert.match(html, /og:description" content="Builds lab systems that prevent repeat problems\./);
  assert.match(html, /<meta name="robots" content="noindex, nofollow"/);
  // A new link; the old one stops working.
  const fresh = await call('seek', 'PUT', '/api/profiles/me/sharing', { public_enabled: true, new_link: true });
  assert.notEqual(fresh.data.sharing.public_slug, slug);
  assert.equal((await call(null, 'GET', `/api/public/profiles/${slug}`)).status, 404);
  // Off: the link stops working.
  await call('seek', 'PUT', '/api/profiles/me/sharing', { public_enabled: false });
  assert.equal((await call(null, 'GET', `/api/public/profiles/${fresh.data.sharing.public_slug}`)).status, 404);
});

test('profile photos: images only, shown to the same people as the page', async () => {
  assert.equal((await call('seek', 'POST', '/api/profiles/me/photo', { data_url: 'data:text/html;base64,PGgxPg==' })).status, 400);
  const fake = Buffer.from('<svg onload=alert(1)>').toString('base64');
  assert.equal((await call('seek', 'POST', '/api/profiles/me/photo', { data_url: `data:image/png;base64,${fake}` })).status, 415);
  const up = await call('seek', 'POST', '/api/profiles/me/photo', { data_url: `data:image/png;base64,${PNG}` });
  assert.equal(up.status, 200, up.text);
  // Can't be set through a normal profile save.
  await call('seek', 'PUT', `/api/entities/SeekerProfile/${profile.id}`, { photo_file: 'someone-elses.png' });
  assert.match(store.get('SeekerProfile', profile.id).photo_file, /\.png$/);
  assert.notEqual(store.get('SeekerProfile', profile.id).photo_file, 'someone-elses.png');
  // Employers get a signed link that works in an <img>.
  const e = await call('emp', 'GET', `/api/profiles/${profile.id}`);
  assert.match(e.data.photo_url, /^\/api\/files\/.+\.png\?exp=\d+&sig=/);
  const img = await fetch(base + e.data.photo_url);
  assert.equal(img.status, 200);
  assert.equal(img.headers.get('content-type'), 'image/png');
  // Public photo only while the public link is on.
  const on = await call('seek', 'PUT', '/api/profiles/me/sharing', { public_enabled: true });
  const pub = await call(null, 'GET', `/api/public/profiles/${on.data.sharing.public_slug}`);
  assert.match(pub.data.photo_url, /^\/api\/public\/profiles\/.+\/photo/);
  assert.equal((await fetch(base + pub.data.photo_url)).status, 200);
  const html = await (await fetch(`${base}/p/${on.data.sharing.public_slug}`)).text();
  assert.match(html, /og:image" content="[^"]*\/api\/public\/profiles\/[^"]+\/photo/, 'the photo is the link preview image');
  await call('seek', 'PUT', '/api/profiles/me/sharing', { public_enabled: false });
  assert.equal((await fetch(base + pub.data.photo_url)).status, 404);
  // Removing it deletes the file.
  const name = store.get('SeekerProfile', profile.id).photo_file;
  await call('seek', 'POST', '/api/profiles/me/photo', { remove: true });
  assert.equal(store.get('SeekerProfile', profile.id).photo_file, null);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM files WHERE name = ?').get(name).n, 0);
});
