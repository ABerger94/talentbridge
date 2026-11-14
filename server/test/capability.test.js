'use strict';
// Capability Graph prompts fit every field: story prompts and the AI's
// instructions are worded for the seeker's field, not just quality work.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');

process.env.TB_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-test-'));
process.env.TB_JWT_SECRET = 'c'.repeat(48);
delete process.env.TURSO_DATABASE_URL;

const cap = require('../src/capability.js');
const RUBRIC = require('../../src/lib/capabilityRubric.json');

const CASES = [
  [{ headline: 'Psychiatric Mental Health Nurse Practitioner (PMHNP-BC)' }, 'healthcare'],
  [{ headline: 'Psychiatrist', work_history: 'Attending psychiatrist, inpatient unit' }, 'healthcare'],
  [{ headline: 'Registered Nurse', skills: ['ICU', 'patient education'] }, 'healthcare'],
  [{ headline: 'Food Safety & Quality Manager', skills: ['HACCP', 'SQF'] }, 'quality_operations'],
  [{ headline: 'Senior Software Engineer', skills: ['TypeScript', 'React', 'AWS'] }, 'technology'],
  [{ headline: 'Journeyman Electrician' }, 'skilled_trades'],
  [{ headline: '5th grade teacher', education: 'M.Ed. Curriculum and Instruction' }, 'education'],
  [{ headline: 'Account Executive', skills: ['Sales', 'Salesforce'] }, 'business'],
  [{ headline: 'Real Estate Broker' }, 'business'],
  [{ headline: 'Licensed Realtor | Managing Broker' }, 'business'],
  [{ headline: 'Mortgage Loan Officer' }, 'business'],
  [{ headline: 'Barista', work_history: 'Changed my job title to shift lead' }, null],
  [{}, null],
];

test('the field is worked out from the profile', () => {
  for (const [profile, want] of CASES) assert.equal(cap.detectFieldFamily(profile), want, JSON.stringify(profile));
});

test('the page and the server work it out the same way', async () => {
  const { detectFieldFamily, thirdPerson } = await import('../../src/lib/fieldFamily.js');
  for (const [profile] of CASES) assert.equal(detectFieldFamily(profile, RUBRIC.field_families), cap.detectFieldFamily(profile));
  assert.equal(thirdPerson('A complex case you worked through'), 'A complex case they worked through');
  assert.equal(thirdPerson('A job you’re proud of'), 'A job they’re proud of');
  assert.equal(thirdPerson("A job you're proud of"), "A job they're proud of");
  assert.equal(thirdPerson('Results that changed your teaching'), 'Results that changed their teaching');
});

test('every field words the same six prompts, so saved stories keep their meaning', () => {
  const ids = RUBRIC.story_prompts.map((p) => p.id);
  assert.equal(ids.length, 6);
  for (const [id, fam] of Object.entries(RUBRIC.field_families)) {
    assert.deepEqual(fam.prompts.map((p) => p.id), ids, id);
    for (const p of fam.prompts) assert.ok(p.title && p.hint, `${id}/${p.id}`);
    assert.ok(fam.label && fam.keywords.length > 5, id);
  }
  // The general set and the level definitions don't assume quality work.
  const general = JSON.stringify(RUBRIC.story_prompts) + JSON.stringify(RUBRIC.levels);
  for (const word of ['recall', 'supplier', 'audit', 'defect', 'HACCP']) assert.ok(!general.includes(word), `general wording mentions "${word}"`);
  // Clinical and teaching stories warn against identifying anyone.
  assert.match(RUBRIC.field_families.healthcare.privacy_note, /patient/);
  assert.match(RUBRIC.field_families.education.privacy_note, /student/);
});

test('a clinician’s graph prompt is written for healthcare', () => {
  const profile = {
    headline: 'Psychiatric Nurse Practitioner',
    proof_stories: [{ prompt_id: 'investigation', action: 'Reworked a treatment plan', result: 'Fewer readmissions' }],
  };
  const prompt = cap.buildGraphPrompt(profile);
  assert.match(prompt, /field looks like: Healthcare/);
  assert.match(prompt, /1\. A complex case you worked through/, 'stories are titled in the clinician’s terms');
  assert.match(prompt, /Never ask for names or details that could identify a patient/);
  assert.match(prompt, /psychiatric nurse practitioner/);
  // The seeker can override the guess.
  const general = cap.buildGraphPrompt({ ...profile, story_field_family: 'general' });
  assert.match(general, /1\. A problem you got to the bottom of/);
  assert.ok(!general.includes('field looks like'));
  assert.equal(cap.familyFor({ headline: 'Barista', story_field_family: 'education' }), 'education');
});

test('graphs record their field; unknown values fall back', () => {
  assert.ok(cap.GRAPH_SCHEMA.properties.field_family.enum.includes('healthcare'));
  assert.equal(cap.normalizeGraph({ field_family: 'technology', core_execution_vectors: [] }).field_family, 'technology');
  assert.equal(cap.normalizeGraph({ field_family: 'astrology', core_execution_vectors: [] }, 'healthcare').field_family, 'healthcare');
  assert.equal(cap.normalizeGraph({ core_execution_vectors: [] }).field_family, 'general');
});

test('a seeker’s choice of field is saved, and only known fields are accepted', async () => {
  const app = require('../src/index.js');
  const { db } = require('../src/db.js');
  const { signToken } = require('../src/auth.js');
  db.prepare("INSERT INTO users (id, email, role, email_verified, created_date, data) VALUES ('np1', 'np1@example.test', 'job_seeker', 1, datetime('now'), '{}')").run();
  const token = signToken(db.prepare('SELECT * FROM users WHERE id = ?').get('np1'));
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, p, body) => {
    const r = await fetch(base + p, { method, headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: body && JSON.stringify(body) });
    return r.json();
  };
  try {
    const created = await call('POST', '/api/entities/SeekerProfile', { full_name: 'Nia Park', headline: 'PMHNP', story_field_family: 'nonsense' });
    const id = (created.data || created).id;
    assert.equal((created.data || created).story_field_family, null);
    const updated = await call('PUT', `/api/entities/SeekerProfile/${id}`, { story_field_family: 'healthcare' });
    assert.equal((updated.data || updated).story_field_family, 'healthcare');
  } finally {
    server.close();
  }
});
