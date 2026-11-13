'use strict';
// A compact, searchable copy of every job's listing fields (job_index), kept
// in step with the Job records. The job board, seeker suggestions, job
// alerts and the sitemap read this instead of loading every full posting —
// with thousands of imported listings, the records are too big to scan.
const { db } = require('./db');

db.exec(`
CREATE TABLE IF NOT EXISTS job_index (
  job_id TEXT PRIMARY KEY,
  status TEXT,
  imported INTEGER NOT NULL DEFAULT 0,
  title TEXT,
  company TEXT,
  location TEXT,
  work_type TEXT,
  employment_type TEXT,
  experience_level TEXT,
  salary_min REAL,
  salary_max REAL,
  posted TEXT,
  source_label TEXT,
  skills TEXT,
  snippet TEXT,
  text TEXT
);
CREATE INDEX IF NOT EXISTS job_index_list ON job_index (status, imported, posted);
`);

const COLS = ['job_id', 'status', 'imported', 'title', 'company', 'location', 'work_type', 'employment_type',
  'experience_level', 'salary_min', 'salary_max', 'posted', 'source_label', 'skills', 'snippet', 'text'];

const STOP = new Set(('the and for with you your our are this that will from have has who what when where which into about across their they them than then more most other such also able work team role roles job jobs years year experience including include includes using use help new well per can may must should would could within over under all any each etc via not but its it’s it\'s our we\'re you\'ll'
).split(' '));

function tokens(text) {
  return String(text || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9+#\s-]/g, ' ')
    .split(/[\s-]+/).filter((w) => w.length >= 3 && !STOP.has(w));
}

function plainSnippet(text, n = 320) {
  return String(text || '').replace(/[*#_>`]/g, '').replace(/\s+/g, ' ').trim().slice(0, n);
}

const STATES = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA', colorado: 'CO', connecticut: 'CT', delaware: 'DE',
  'district of columbia': 'DC', florida: 'FL', georgia: 'GA', hawaii: 'HI', idaho: 'ID', illinois: 'IL', indiana: 'IN', iowa: 'IA',
  kansas: 'KS', kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD', massachusetts: 'MA', michigan: 'MI', minnesota: 'MN',
  mississippi: 'MS', missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ',
  'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK', oregon: 'OR',
  pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC', 'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT',
  vermont: 'VT', virginia: 'VA', washington: 'WA', 'west virginia': 'WV', wisconsin: 'WI', wyoming: 'WY',
};

function toRow(job) {
  const skills = Array.isArray(job.skills) ? job.skills.slice(0, 30).map(String) : [];
  const snippet = plainSnippet(job.description);
  return {
    job_id: job.id,
    status: job.status || 'active',
    imported: job.imported ? 1 : 0,
    title: String(job.title || '').slice(0, 300),
    company: String(job.company || '').slice(0, 200),
    location: String(job.location || '').slice(0, 200),
    work_type: job.work_type || null,
    employment_type: job.employment_type || null,
    experience_level: job.experience_level || null,
    salary_min: Number(job.salary_min) || null,
    salary_max: Number(job.salary_max) || null,
    posted: job.posted_date || job.created_date || new Date().toISOString(),
    // Company boards (Greenhouse, Workday...) link straight to the employer.
    source_label: job.imported ? (job.attribution?.label || 'Company site') : null,
    skills: JSON.stringify(skills),
    snippet,
    text: [job.title, job.company, job.location, skills.join(' '), plainSnippet(job.description, 2500), job.qualifications && plainSnippet(job.qualifications, 600)]
      .filter(Boolean).join(' ').toLowerCase().slice(0, 4000),
  };
}

function upsertRows(rows) {
  for (let i = 0; i < rows.length; i += 50) {
    const chunk = rows.slice(i, i + 50);
    const sql = `INSERT OR REPLACE INTO job_index (${COLS.join(', ')}) VALUES ${chunk.map(() => `(${COLS.map(() => '?').join(', ')})`).join(', ')}`;
    db.prepare(sql).run(...chunk.flatMap((r) => COLS.map((c) => r[c] ?? null)));
  }
}

function upsertJob(job) {
  if (job?.id) upsertRows([toRow(job)]);
}

function removeJob(id) {
  db.prepare('DELETE FROM job_index WHERE job_id = ?').run(id);
}

function setStatus(ids, status) {
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    db.prepare(`UPDATE job_index SET status = ? WHERE job_id IN (${chunk.map(() => '?').join(', ')})`).run(status, ...chunk);
  }
}

// First run after deploy: index the jobs that already exist.
function rebuildIfEmpty() {
  const n = db.prepare('SELECT COUNT(*) AS n FROM job_index').get().n;
  if (n > 0) return;
  const { store } = require('./entities');
  const jobs = store.all('Job');
  if (jobs.length) upsertRows(jobs.map(toRow));
}

const publicRow = (r) => ({
  id: r.job_id,
  title: r.title,
  company: r.company,
  location: r.location,
  work_type: r.work_type,
  employment_type: r.employment_type,
  experience_level: r.experience_level,
  salary_min: r.salary_min,
  salary_max: r.salary_max,
  posted_date: r.posted,
  imported: !!r.imported,
  source_label: r.source_label,
  skills: (() => { try { return JSON.parse(r.skills || '[]'); } catch { return []; } })(),
  snippet: r.snippet,
});

const WORK_TYPES = ['remote', 'hybrid', 'onsite'];
const EMPLOYMENT_TYPES = ['full_time', 'part_time', 'contract', 'internship', 'freelance'];
const LEVELS = ['entry', 'mid', 'senior', 'lead', 'executive'];

// The filters shared by the job board and the seeker's match pool, as SQL.
// Unknown values are ignored rather than matching nothing.
function filterClause({ location = '', work_type, employment_type, experience_level, origin = 'all', min_salary, posted_within } = {}) {
  const where = ["status = 'active'"];
  const args = [];
  const loc = String(location || '').trim().toLowerCase().slice(0, 80);
  if (loc === 'remote') where.push("work_type = 'remote'");
  else if (loc) {
    // "Maryland" also finds "Baltimore, MD", and "md" finds "Maryland".
    const abbr = STATES[loc] || null;
    const name = Object.keys(STATES).find((k) => STATES[k] === loc.toUpperCase()) || null;
    const likes = [`%${loc}%`];
    if (abbr) likes.push(`%, ${abbr.toLowerCase()}%`);
    if (name) likes.push(`%${name}%`);
    where.push(`(${likes.map(() => 'LOWER(location) LIKE ?').join(' OR ')})`);
    args.push(...likes);
  }
  if (WORK_TYPES.includes(work_type)) { where.push('work_type = ?'); args.push(work_type); }
  if (EMPLOYMENT_TYPES.includes(employment_type)) { where.push('employment_type = ?'); args.push(employment_type); }
  if (LEVELS.includes(experience_level)) { where.push('experience_level = ?'); args.push(experience_level); }
  if (origin === 'direct') where.push('imported = 0');
  if (origin === 'imported') where.push('imported = 1');
  // Pay: roles that list pay must reach the minimum; roles that don't list
  // it are kept (most postings don't say).
  const minPay = parseInt(min_salary, 10);
  if (minPay > 0) { where.push('(COALESCE(salary_max, salary_min) IS NULL OR COALESCE(salary_max, salary_min) >= ?)'); args.push(minPay); }
  const days = parseInt(posted_within, 10);
  if (days > 0) { where.push('posted >= ?'); args.push(new Date(Date.now() - days * 86400000).toISOString()); }
  return { where, args };
}

// Job board search. Roles posted on TalentBridge come first, then imported
// ones, newest first within each.
function search({ q = '', page = 1, per = 20, ...filters } = {}) {
  const { where, args } = filterClause(filters);
  const words = tokens(q).slice(0, 6);
  for (const word of words) {
    where.push('text LIKE ?');
    args.push(`%${word}%`);
  }
  // Within each group, roles with the search words in the title come first.
  const titleRank = words.length ? `(${words.map(() => '(LOWER(title) LIKE ?)').join(' + ')}) DESC, ` : '';
  const rankArgs = words.map((w) => `%${w}%`);
  const clause = where.join(' AND ');
  const total = db.prepare(`SELECT COUNT(*) AS n FROM job_index WHERE ${clause}`).get(...args).n;
  const size = Math.min(Math.max(parseInt(per, 10) || 20, 1), 50);
  const offset = (Math.max(parseInt(page, 10) || 1, 1) - 1) * size;
  const rows = db.prepare(`SELECT * FROM job_index WHERE ${clause} ORDER BY imported ASC, ${titleRank}posted DESC LIMIT ? OFFSET ?`)
    .all(...args, ...rankArgs, size, offset);
  return { total, page: Math.max(parseInt(page, 10) || 1, 1), per: size, jobs: rows.map(publicRow) };
}

function profileTokens(profile) {
  const p = profile || {};
  const graph = Array.isArray(p.capability_graph?.core_execution_vectors)
    ? p.capability_graph.core_execution_vectors.map((v) => v?.vector || '').join(' ') : '';
  const strong = new Set([...tokens((p.skills || []).join(' ')), ...tokens(p.headline), ...tokens(graph)]);
  const weak = new Set([...tokens(p.career_goals), ...tokens((p.industries_of_interest || []).join(' ')), ...tokens(String(p.bio || '').slice(0, 600))]);
  return { strong, weak };
}

// Active jobs ranked by word overlap with a seeker's profile: a cheap
// pre-filter so the AI only scores roles worth scoring.
function suggestFor(profile, { limit = 25, since = null, excludeIds = [], filters = {} } = {}) {
  const { strong, weak } = profileTokens(profile);
  if (!strong.size && !weak.size) return [];
  // Narrow in the database first: the seeker's filters, then TalentBridge-
  // posted roles plus imported ones that mention at least one of the
  // profile's key words. Keeps this cheap with thousands of listings.
  const { where, args } = filterClause(filters);
  const keys = [...strong, ...weak].slice(0, 12);
  let sql = `SELECT job_id, imported, title, posted, text FROM job_index WHERE ${where.join(' AND ')}`;
  if (since) { sql += ' AND posted > ?'; args.push(since); }
  sql += ` AND (imported = 0 OR ${keys.map(() => 'text LIKE ?').join(' OR ')})`;
  args.push(...keys.map((k) => `%${k}%`));
  const skip = new Set(excludeIds);
  const scored = [];
  for (const r of db.prepare(sql).all(...args)) {
    if (skip.has(r.job_id)) continue;
    const titleWords = new Set(tokens(r.title));
    const words = new Set(String(r.text || '').split(/[^a-z0-9+#]+/));
    let score = 0;
    for (const w of strong) { if (titleWords.has(w)) score += 4; else if (words.has(w)) score += 2; }
    for (const w of weak) { if (titleWords.has(w)) score += 2; else if (words.has(w)) score += 1; }
    if (!r.imported) score += 3; // roles posted on TalentBridge get a nudge
    if (score > 0) scored.push({ r, score });
  }
  scored.sort((a, b) => b.score - a.score || String(b.r.posted).localeCompare(String(a.r.posted)));
  const top = scored.slice(0, limit);
  if (!top.length) return [];
  const full = new Map(db.prepare(`SELECT * FROM job_index WHERE job_id IN (${top.map(() => '?').join(', ')})`)
    .all(...top.map(({ r }) => r.job_id)).map((row) => [row.job_id, row]));
  return top.filter(({ r }) => full.has(r.job_id)).map(({ r, score }) => ({ ...publicRow(full.get(r.job_id)), relevance: score }));
}

function countWhere(filters) {
  const { where, args } = filterClause(filters);
  return db.prepare(`SELECT COUNT(*) AS n FROM job_index WHERE ${where.join(' AND ')}`).get(...args).n;
}

function counts() {
  const row = db.prepare("SELECT SUM(CASE WHEN imported = 0 THEN 1 ELSE 0 END) AS direct, SUM(CASE WHEN imported = 1 THEN 1 ELSE 0 END) AS imported FROM job_index WHERE status = 'active'").get();
  return { direct: row.direct || 0, imported: row.imported || 0 };
}

module.exports = { filterClause, countWhere, STATES, toRow, upsertRows, upsertJob, removeJob, setStatus, rebuildIfEmpty, search, suggestFor, tokens, counts, publicRow };
