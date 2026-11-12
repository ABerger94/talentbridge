'use strict';
// Job pages for search engines and link previews.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.TB_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-test-'));
process.env.TB_JWT_SECRET = 's'.repeat(48);
delete process.env.TURSO_DATABASE_URL;

const app = require('../src/index.js');
const { store } = require('../src/entities.js');
const { jobPostingLd, render, headFor } = require('../src/seo.js');

const TEMPLATE = '<!doctype html><html><head><title>TalentBridge</title><meta name="description" content="generic" /><meta property="og:title" content="generic" /></head><body><div id="root"></div></body></html>';

test('JobPosting data maps the role for Google job search', () => {
  const job = {
    id: 'j1', title: 'QA Technician', description: 'Run QA.\nKeep <records>.', status: 'active', created_date: '2026-11-01T00:00:00Z',
    employment_type: 'full_time', work_type: 'onsite', location: 'Baltimore, MD', salary_min: 55000, salary_max: 70000, company: 'Acme',
  };
  const ld = jobPostingLd(job, { name: 'Acme Labs', website: 'https://acme.example' }, 'https://x/jobs/j1');
  assert.equal(ld['@type'], 'JobPosting');
  assert.equal(ld.employmentType, 'FULL_TIME');
  assert.equal(ld.hiringOrganization.name, 'Acme Labs');
  assert.deepEqual(ld.jobLocation.address, { '@type': 'PostalAddress', addressLocality: 'Baltimore', addressRegion: 'MD', addressCountry: 'US' });
  assert.equal(ld.baseSalary.value.minValue, 55000);
  assert.match(ld.description, /Keep &lt;records&gt;\./);
  const remote = jobPostingLd({ ...job, work_type: 'remote', location: 'Remote' }, null, 'u');
  assert.equal(remote.jobLocationType, 'TELECOMMUTE');
  assert.equal(remote.jobLocation, undefined);
});

test('rendered head replaces the generic tags and cannot be broken out of', () => {
  const html = render(TEMPLATE, headFor({
    title: 'Evil </title><script>alert(1)</script>', description: 'd', url: 'u', image: 'i',
    ld: { description: '</script><script>alert(1)</script>' },
  }));
  assert.equal((html.match(/<title>/g) || []).length, 1);
  assert.doesNotMatch(html, /content="generic"/);
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /application\/ld\+json/);
});

test('sitemap lists open roles only', async () => {
  const open = store.create('Job', { title: 'Open', status: 'active' }, 'e');
  const closed = store.create('Job', { title: 'Closed', status: 'closed' }, 'e');
  const server = app.listen(0);
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/sitemap.xml`);
    const xml = await res.text();
    assert.match(res.headers.get('content-type'), /xml/);
    assert.ok(xml.includes(`/jobs/${open.id}`));
    assert.ok(!xml.includes(`/jobs/${closed.id}`));
  } finally {
    server.close();
  }
});
