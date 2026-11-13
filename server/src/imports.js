'use strict';
// Real job listings from outside TalentBridge, refreshed daily:
//   greenhouse / lever / ashby  a company's own public job board (free, no key)
//   remotive                    remote jobs (credit + link back required)
//   usajobs                     federal jobs (USAJOBS_API_KEY + USAJOBS_EMAIL)
//   adzuna                      broad aggregator (ADZUNA_APP_ID + ADZUNA_APP_KEY)
//   jooble                      broad aggregator (JOOBLE_API_KEY)
// Imported jobs are Job records with imported: true. They link out to apply
// (no in-app applications), carry attribution, stay out of Google's job data
// and the sitemap, and are closed when they disappear from their source.
// Each run has a time budget; sources not reached run next time.
const crypto = require('crypto');
const { db } = require('./db');
const { authRequired } = require('./auth');

const DAY = 24 * 60 * 60 * 1000;
const DESCRIPTION_MAX = 12000;
const FETCH_TIMEOUT_MS = 30000;

const KINDS = {
  greenhouse: { label: 'Greenhouse', company: true, minGapMs: 20 * 60 * 60 * 1000 },
  lever: { label: 'Lever', company: true, minGapMs: 20 * 60 * 60 * 1000 },
  ashby: { label: 'Ashby', company: true, minGapMs: 20 * 60 * 60 * 1000 },
  workday: { label: 'Workday', company: true, minGapMs: 20 * 60 * 60 * 1000 },
  smartrecruiters: { label: 'SmartRecruiters', company: true, minGapMs: 20 * 60 * 60 * 1000 },
  workable: { label: 'Workable', company: true, minGapMs: 20 * 60 * 60 * 1000 },
  workable_search: { label: 'Workable job search', minGapMs: 6 * 60 * 60 * 1000 },
  remotive: { label: 'Remotive', company: false, minGapMs: 6 * 60 * 60 * 1000 },
  usajobs: { label: 'USAJOBS', company: false, minGapMs: 20 * 60 * 60 * 1000, env: ['USAJOBS_API_KEY', 'USAJOBS_EMAIL'] },
  adzuna: { label: 'Adzuna', company: false, minGapMs: 20 * 60 * 60 * 1000, env: ['ADZUNA_APP_ID', 'ADZUNA_APP_KEY'] },
  jooble: { label: 'Jooble', company: false, minGapMs: 20 * 60 * 60 * 1000, env: ['JOOBLE_API_KEY'] },
};

// Starting set: real boards checked to be live, picked for a spread of work
// (clinical, food service, retail and auto, nonprofit, aerospace technicians,
// logistics, finance, media, software). Admins add or remove them in Admin.
// Jobs kept per source (newest, local first). Admins can change it per source.
const MAX_PER_SOURCE = 100;

const DEFAULT_SOURCES = [
  ['greenhouse', 'onemedical', 'One Medical', MAX_PER_SOURCE], ['greenhouse', 'oscar', 'Oscar Health', MAX_PER_SOURCE],
  ['lever', 'lyrahealth', 'Lyra Health', MAX_PER_SOURCE], ['lever', 'ro', 'Ro', MAX_PER_SOURCE], ['greenhouse', 'talkspace', 'Talkspace', MAX_PER_SOURCE],
  ['greenhouse', 'zocdoc', 'Zocdoc', MAX_PER_SOURCE], ['greenhouse', 'mavenclinic', 'Maven Clinic', MAX_PER_SOURCE], ['greenhouse', 'honor', 'Honor', MAX_PER_SOURCE],
  ['greenhouse', 'omadahealth', 'Omada Health', MAX_PER_SOURCE], ['greenhouse', 'twinhealth', 'Twin Health', MAX_PER_SOURCE], ['greenhouse', 'tia', 'Tia', MAX_PER_SOURCE],
  ['greenhouse', 'galileo', 'Galileo', MAX_PER_SOURCE], ['ashby', 'benchling', 'Benchling', MAX_PER_SOURCE],
  ['greenhouse', 'sweetgreen', 'sweetgreen', MAX_PER_SOURCE], ['greenhouse', 'toast', 'Toast', MAX_PER_SOURCE], ['greenhouse', 'instacart', 'Instacart', MAX_PER_SOURCE],
  ['greenhouse', 'carvana', 'Carvana', MAX_PER_SOURCE], ['greenhouse', 'glossier', 'Glossier', MAX_PER_SOURCE], ['greenhouse', 'peloton', 'Peloton', MAX_PER_SOURCE],
  ['greenhouse', 'codeforamerica', 'Code for America', MAX_PER_SOURCE], ['greenhouse', 'khanacademy', 'Khan Academy', MAX_PER_SOURCE],
  ['greenhouse', 'wikimedia', 'Wikimedia Foundation', MAX_PER_SOURCE], ['greenhouse', 'mozilla', 'Mozilla', MAX_PER_SOURCE], ['greenhouse', 'duolingo', 'Duolingo', MAX_PER_SOURCE],
  ['greenhouse', 'rocketlab', 'Rocket Lab', MAX_PER_SOURCE], ['greenhouse', 'relativity', 'Relativity Space', MAX_PER_SOURCE], ['greenhouse', 'astranis', 'Astranis', MAX_PER_SOURCE],
  ['lever', 'zoox', 'Zoox', MAX_PER_SOURCE], ['greenhouse', 'samsara', 'Samsara', MAX_PER_SOURCE], ['greenhouse', 'flexport', 'Flexport', MAX_PER_SOURCE],
  ['greenhouse', 'affirm', 'Affirm', MAX_PER_SOURCE], ['greenhouse', 'sofi', 'SoFi', MAX_PER_SOURCE], ['greenhouse', 'betterment', 'Betterment', MAX_PER_SOURCE],
  ['greenhouse', 'gusto', 'Gusto', MAX_PER_SOURCE], ['greenhouse', 'mercury', 'Mercury', MAX_PER_SOURCE], ['greenhouse', 'chime', 'Chime', MAX_PER_SOURCE],
  ['greenhouse', 'robinhood', 'Robinhood', MAX_PER_SOURCE], ['ashby', 'ramp', 'Ramp', MAX_PER_SOURCE],
  ['greenhouse', 'gitlab', 'GitLab', MAX_PER_SOURCE], ['greenhouse', 'reddit', 'Reddit', MAX_PER_SOURCE], ['greenhouse', 'pinterest', 'Pinterest', MAX_PER_SOURCE],
  ['greenhouse', 'figma', 'Figma', MAX_PER_SOURCE], ['greenhouse', 'axios', 'Axios', MAX_PER_SOURCE], ['greenhouse', 'twilio', 'Twilio', MAX_PER_SOURCE],
  ['greenhouse', 'datadog', 'Datadog', MAX_PER_SOURCE], ['greenhouse', 'dropbox', 'Dropbox', MAX_PER_SOURCE], ['greenhouse', 'asana', 'Asana', MAX_PER_SOURCE],
  ['greenhouse', 'everlaw', 'Everlaw', MAX_PER_SOURCE], ['greenhouse', 'nextdoor', 'Nextdoor', MAX_PER_SOURCE], ['greenhouse', 'taskrabbit', 'Taskrabbit', MAX_PER_SOURCE],
  ['ashby', 'notion', 'Notion', MAX_PER_SOURCE], ['ashby', 'openai', 'OpenAI', MAX_PER_SOURCE], ['ashby', 'harvey', 'Harvey', MAX_PER_SOURCE], ['ashby', 'vanta', 'Vanta', MAX_PER_SOURCE],
  ['ashby', 'replit', 'Replit', MAX_PER_SOURCE], ['ashby', 'supabase', 'Supabase', MAX_PER_SOURCE], ['lever', 'palantir', 'Palantir', MAX_PER_SOURCE], ['lever', 'greenlight', 'Greenlight', MAX_PER_SOURCE],
  // Maryland / DC / Virginia employers.
  ['greenhouse', 'appian', 'Appian', MAX_PER_SOURCE], ['lever', 'aledade', 'Aledade', MAX_PER_SOURCE], ['greenhouse', 'aclu', 'ACLU', MAX_PER_SOURCE],
  ['greenhouse', 'huntress', 'Huntress', MAX_PER_SOURCE], ['greenhouse', 'dragos', 'Dragos', MAX_PER_SOURCE], ['greenhouse', 'navapbc', 'Nava PBC', MAX_PER_SOURCE],
  ['ashby', 'socure', 'Socure', MAX_PER_SOURCE], ['greenhouse', 'oddball', 'Oddball', MAX_PER_SOURCE], ['greenhouse', 'civisanalytics', 'Civis Analytics', MAX_PER_SOURCE],
  ['remotive', '', 'Remotive (remote jobs)', MAX_PER_SOURCE],
  ['usajobs', JSON.stringify({ location: 'Maryland' }), 'USAJOBS: Maryland', MAX_PER_SOURCE],
  ['usajobs', JSON.stringify({ location: 'Washington, District of Columbia' }), 'USAJOBS: Washington, DC', MAX_PER_SOURCE],
  ['usajobs', JSON.stringify({ location: 'Virginia' }), 'USAJOBS: Virginia', MAX_PER_SOURCE],
  ['adzuna', JSON.stringify({ where: 'Maryland' }), 'Adzuna: Maryland', MAX_PER_SOURCE],
  ['adzuna', JSON.stringify({ where: 'Washington, DC' }), 'Adzuna: Washington, DC', MAX_PER_SOURCE],
  ['jooble', JSON.stringify({ location: 'Maryland' }), 'Jooble: Maryland', MAX_PER_SOURCE],
  // Large employers on Workday (verified live 2026-11-13).
  ['workday', 'cvshealth.wd1.myworkdayjobs.com/CVS_Health_Careers', 'CVS Health', MAX_PER_SOURCE],
  ['workday', 'globalhr.wd5.myworkdayjobs.com/REC_RTX_Ext_Gateway', 'RTX', MAX_PER_SOURCE],
  ['workday', 'capitalone.wd12.myworkdayjobs.com/Capital_One', 'Capital One', MAX_PER_SOURCE],
  ['workday', 'walmart.wd504.myworkdayjobs.com/WalmartExternal', 'Walmart', MAX_PER_SOURCE],
  ['workday', 'target.wd5.myworkdayjobs.com/targetcareers', 'Target', MAX_PER_SOURCE],
  ['workday', 'abbott.wd5.myworkdayjobs.com/AbbottCareers', 'Abbott', MAX_PER_SOURCE],
  ['workday', 'accenture.wd103.myworkdayjobs.com/AccentureCareers', 'Accenture', MAX_PER_SOURCE],
  ['workday', 'ghr.wd1.myworkdayjobs.com/Lateral-US', 'Bank of America', MAX_PER_SOURCE],
  ['workday', 'amgen.wd1.myworkdayjobs.com/Careers', 'Amgen', MAX_PER_SOURCE],
  ['workday', 'jj.wd5.myworkdayjobs.com/JJ', 'Johnson & Johnson', MAX_PER_SOURCE],
  ['workday', 'salesforce.wd12.myworkdayjobs.com/External_Career_Site', 'Salesforce', MAX_PER_SOURCE],
  ['workday', 'mdlz.wd3.myworkdayjobs.com/External', 'Mondelez', MAX_PER_SOURCE],
  ['workday', 'cisco.wd5.myworkdayjobs.com/Cisco_Careers', 'Cisco', MAX_PER_SOURCE],
  ['workday', 'wf.wd1.myworkdayjobs.com/WellsFargoJobs', 'Wells Fargo', MAX_PER_SOURCE],
  ['workday', 'medtronic.wd1.myworkdayjobs.com/MedtronicCareers', 'Medtronic', MAX_PER_SOURCE],
  ['workday', 'heinz.wd1.myworkdayjobs.com/KraftHeinz_Careers', 'Kraft Heinz', MAX_PER_SOURCE],
  ['workday', 'pg.wd5.myworkdayjobs.com/1000', 'Procter & Gamble', MAX_PER_SOURCE],
  ['workday', '3m.wd1.myworkdayjobs.com/Search', '3M', MAX_PER_SOURCE],
  ['workday', 'boeing.wd1.myworkdayjobs.com/EXTERNAL_CAREERS', 'Boeing', MAX_PER_SOURCE],
  ['workday', 'pfizer.wd1.myworkdayjobs.com/PfizerCareers', 'Pfizer', MAX_PER_SOURCE],
  ['workday', 'tysonfoods.wd5.myworkdayjobs.com/TSN', 'Tyson Foods', MAX_PER_SOURCE],
  ['workday', 'generalmotors.wd5.myworkdayjobs.com/Careers_GM', 'General Motors', MAX_PER_SOURCE],
  ['workday', 'bristolmyerssquibb.wd5.myworkdayjobs.com/BMS', 'Bristol Myers Squibb', MAX_PER_SOURCE],
  ['workday', 'sbdinc.wd1.myworkdayjobs.com/Stanley_Black_Decker_Career_Site', 'Stanley Black & Decker', MAX_PER_SOURCE],
  ['workday', 'geaerospace.wd5.myworkdayjobs.com/GE_ExternalSite', 'GE Aerospace', MAX_PER_SOURCE],
  ['workday', 'lilly.wd115.myworkdayjobs.com/LLY', 'Eli Lilly', MAX_PER_SOURCE],
  ['workday', 'smithfieldfoods.wd1.myworkdayjobs.com/Careers', 'Smithfield Foods', MAX_PER_SOURCE],
  ['workday', 'mymvw.wd5.myworkdayjobs.com/MVW', 'Marriott Vacations Worldwide', MAX_PER_SOURCE],
  ['workday', 'genmills.wd1.myworkdayjobs.com/GMI_External_Careers', 'General Mills', MAX_PER_SOURCE],
  ['workday', 'workday.wd5.myworkdayjobs.com/Workday', 'Workday', MAX_PER_SOURCE],
  ['workday', 'campbellsoup.wd5.myworkdayjobs.com/ExternalCareers_GlobalSite', "Campbell's", MAX_PER_SOURCE],
  ['workday', 'adobe.wd5.myworkdayjobs.com/external_experienced', 'Adobe', MAX_PER_SOURCE],
  ['workday', 'coke.wd1.myworkdayjobs.com/coca-cola-careers', 'Coca-Cola', MAX_PER_SOURCE],
  ['workday', 'unilever.wd3.myworkdayjobs.com/Unilever_Experienced_Professionals', 'Unilever', MAX_PER_SOURCE],
  ['workday', 'ingredion.wd1.myworkdayjobs.com/IngredionCareers', 'Ingredion', MAX_PER_SOURCE],
  ['workday', 'conagrabrands.wd1.myworkdayjobs.com/Careers_US', 'Conagra Brands', MAX_PER_SOURCE],
  ['workday', 'troweprice.wd5.myworkdayjobs.com/TRowePrice', 'T. Rowe Price', MAX_PER_SOURCE],
  // Maryland / DC / Virginia employers on Workday (verified live 2026-11-13).
  ['workday', 'leidos.wd5.myworkdayjobs.com/External', 'Leidos', MAX_PER_SOURCE],
  ['workday', 'bah.wd1.myworkdayjobs.com/BAH_Jobs', 'Booz Allen Hamilton', MAX_PER_SOURCE],
  ['workday', 'gdit.wd5.myworkdayjobs.com/External_Career_Site', 'GDIT', MAX_PER_SOURCE],
  ['workday', 'astrazeneca.wd3.myworkdayjobs.com/Careers', 'AstraZeneca', MAX_PER_SOURCE],
  ['workday', 'ciena.wd5.myworkdayjobs.com/Careers', 'Ciena', MAX_PER_SOURCE],
  ['workday', 'fanniemae.wd1.myworkdayjobs.com/FanniemaeCareers', 'Fannie Mae', MAX_PER_SOURCE],
  ['workday', 'freddiemac.wd5.myworkdayjobs.com/External', 'Freddie Mac', MAX_PER_SOURCE],
  // SmartRecruiters companies with US openings (verified live 2026-11-13).
  ['smartrecruiters', 'AbbVie', 'AbbVie', MAX_PER_SOURCE], ['smartrecruiters', 'BoschGroup', 'Bosch', MAX_PER_SOURCE],
  ['smartrecruiters', 'Continental', 'Continental', MAX_PER_SOURCE], ['smartrecruiters', 'Dominos', 'Domino’s', MAX_PER_SOURCE],
  ['smartrecruiters', 'Equinox', 'Equinox', MAX_PER_SOURCE], ['smartrecruiters', 'Eurofins', 'Eurofins', MAX_PER_SOURCE],
  ['smartrecruiters', 'Experian', 'Experian', MAX_PER_SOURCE], ['smartrecruiters', 'SGS', 'SGS', MAX_PER_SOURCE],
  ['smartrecruiters', 'ServiceNow', 'ServiceNow', MAX_PER_SOURCE], ['smartrecruiters', 'WesternDigital', 'Western Digital', MAX_PER_SOURCE],
  ['smartrecruiters', 'Wix2', 'Wix', MAX_PER_SOURCE],
  // Workable's job search: smaller local employers the big boards miss.
  ['workable_search', JSON.stringify({ location: 'Maryland' }), 'Workable: Maryland', MAX_PER_SOURCE],
  ['workable_search', JSON.stringify({ location: 'Washington, DC' }), 'Workable: Washington, DC', MAX_PER_SOURCE],
  ['workable_search', JSON.stringify({ location: 'Virginia' }), 'Workable: Virginia', MAX_PER_SOURCE],
];

db.exec(`
CREATE TABLE IF NOT EXISTS job_sources (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  token TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  max_jobs INTEGER NOT NULL DEFAULT 100,
  last_run_at TEXT,
  last_status TEXT,
  last_error TEXT,
  last_found INTEGER,
  active_count INTEGER NOT NULL DEFAULT 0,
  created_date TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS app_flags (key TEXT PRIMARY KEY, value TEXT);
`);

// Adds any default source not added before. Removing one in Admin is
// remembered, so it never comes back on its own.
function seedDefaults() {
  const row = db.prepare("SELECT value FROM app_flags WHERE key = 'job_sources_seeded_keys'").get();
  let seeded = [];
  try { seeded = JSON.parse(row?.value || '[]'); } catch { seeded = []; }
  const done = new Set(seeded);
  const now = new Date().toISOString();
  for (const [kind, token, name, max] of DEFAULT_SOURCES) {
    const key = `${kind}:${token}`;
    if (done.has(key)) continue;
    if (!db.prepare('SELECT 1 FROM job_sources WHERE kind = ? AND token = ?').get(kind, token)) {
      db.prepare('INSERT INTO job_sources (id, kind, token, name, enabled, max_jobs, created_date) VALUES (?, ?, ?, ?, 1, ?, ?)')
        .run(crypto.randomUUID(), kind, token, name, max, now);
    }
    done.add(key);
  }
  if (done.size !== seeded.length) {
    db.prepare("INSERT OR REPLACE INTO app_flags (key, value) VALUES ('job_sources_seeded_keys', ?)").run(JSON.stringify([...done]));
  }
}
seedDefaults();

// One-time: sources saved with the old caps all move to MAX_PER_SOURCE.
if (!db.prepare("SELECT 1 FROM app_flags WHERE key = 'job_sources_max_100'").get()) {
  db.prepare('UPDATE job_sources SET max_jobs = ?').run(MAX_PER_SOURCE);
  db.prepare("INSERT OR REPLACE INTO app_flags (key, value) VALUES ('job_sources_max_100', ?)").run(new Date().toISOString());
}

function fail(status, message) {
  return Object.assign(new Error(message), { status });
}

const env = (n) => (process.env[n] || '').trim();
const REGION = new RegExp(env('TB_JOB_REGION') || '\\b(MD|Maryland|Baltimore|Bethesda|Rockville|Silver Spring|Columbia|Annapolis|Frederick|Hanover|Towson|DC|D\\.C\\.|District of Columbia|Washington, D|VA|Virginia|Arlington|Alexandria|Reston|McLean|Tysons|Herndon|Fairfax)\\b', 'i');
// States searched first where a source can filter by state (SmartRecruiters).
const LOCAL_STATES = (env('TB_JOB_STATES') || 'MD,DC,VA').split(',').map((x) => x.trim()).filter(Boolean);
const missingEnv = (kind) => (KINDS[kind].env || []).filter((n) => !env(n));

// --- Text helpers ------------------------------------------------------------
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', ndash: '–', mdash: '—', hellip: '…', bull: '•', middot: '·', trade: '™', reg: '®', copy: '©' };
function decode(s) {
  return String(s || '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : '';
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

// HTML job description -> light Markdown (rendered by react-markdown, which
// never renders raw HTML).
function htmlToMarkdown(html) {
  let s = String(html || '');
  if (/&lt;\/?[a-z]/i.test(s)) s = decode(s); // Greenhouse double-escapes
  s = s.replace(/<(script|style|iframe|noscript)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi, (m, t) => `\n\n**${t.replace(/<[^>]+>/g, '').trim()}**\n\n`)
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<\/(li|ul|ol)>/gi, '\n')
    .replace(/<(strong|b)>\s*([\s\S]*?)\s*<\/\1>/gi, (m, tag, t) => (t.trim() ? `**${t.trim()}**` : ''))
    .replace(/<\/?(p|div|section|article|tr|table)[^>]*>/gi, '\n\n')
    .replace(/<[^>]+>/g, '');
  s = decode(s)
    .replace(/\*\*\s*\*\*/g, '')
    // Bold markers must hug their text, or Markdown prints the asterisks.
    .replace(/\*\*[ \t]*([^*\n]*?\S)[ \t]*\*\*/g, '**$1**')
    .replace(/\*\*([^*\n]+)\*\*(?=[A-Za-z0-9])/g, '**$1** ')
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return s.length > DESCRIPTION_MAX ? `${s.slice(0, DESCRIPTION_MAX).replace(/\s+\S*$/, '')}…` : s;
}

function safeUrl(u) {
  try {
    const url = new URL(String(u || ''));
    return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

const US_STATE_ABBR = /\b(A[LKZR]|C[AOT]|D[EC]|FL|GA|HI|I[ADLN]|K[SY]|LA|M[ADEINOST]|N[CDEHJMVY]|O[HKR]|PA|RI|S[CD]|T[NX]|UT|V[AT]|W[AIVY])\b/;
const US_WORDS = /united states|\busa\b|\bu\.s\.|\bus\b|remote|anywhere|americas|north america|new york|san francisco|los angeles|chicago|boston|seattle|austin|denver|atlanta|miami|dallas|houston|phoenix|baltimore|washington|philadelphia|portland|san diego|san jose|nashville|raleigh|salt lake|minneapolis|detroit/i;
const NON_US = /\b(canada|toronto|vancouver|montreal|uk|united kingdom|london|ireland|dublin|germany|berlin|munich|france|paris|spain|madrid|barcelona|netherlands|amsterdam|india|bangalore|bengaluru|hyderabad|pune|singapore|japan|tokyo|australia|sydney|melbourne|brazil|são paulo|sao paulo|mexico|poland|warsaw|israel|tel aviv|sweden|stockholm|switzerland|zurich|italy|milan|portugal|lisbon|korea|seoul|china|hong kong|philippines|argentina|colombia|chile|new zealand|auckland|emea|apac|europe|latam)\b/i;

// Full state names ("Home Office - Virginia"). Georgia is left out: it's a country too.
const US_STATE_NAMES = new RegExp(`\\b(${Object.keys(require('./jobindex').STATES).filter((n) => n !== 'georgia').join('|')})\\b`, 'i');

function looksUS(location, country) {
  const c = String(country || '').trim().toLowerCase();
  if (c) return ['us', 'usa', 'united states', 'united states of america'].includes(c);
  const loc = String(location || '');
  if (!loc) return true;
  if (/remote/i.test(loc) && !NON_US.test(loc)) return true;
  if (US_STATE_NAMES.test(loc)) return true;
  if (NON_US.test(loc) && !/united states|\busa\b|\bus\b/i.test(loc)) return false;
  return US_WORDS.test(loc) || US_STATE_ABBR.test(loc);
}

function workTypeOf(...hints) {
  const t = hints.filter(Boolean).join(' ').toLowerCase();
  if (/hybrid/.test(t)) return 'hybrid';
  if (/remote/.test(t)) return 'remote';
  return 'onsite';
}

function employmentOf(text) {
  const t = String(text || '').toLowerCase().replace(/[^a-z]/g, '');
  if (!t) return null;
  if (t.includes('intern')) return 'internship';
  if (t.includes('parttime')) return 'part_time';
  if (t.includes('contract') || t.includes('temporary') || t.includes('temp')) return 'contract';
  if (t.includes('freelance')) return 'freelance';
  if (t.includes('fulltime') || t.includes('permanent')) return 'full_time';
  return null;
}

function levelOf(title) {
  const t = String(title || '').toLowerCase();
  if (/\b(intern|internship|apprentice|trainee)\b/.test(t)) return 'entry';
  if (/\b(chief|vp|vice president|head of|director)\b/.test(t)) return 'executive';
  if (/\b(lead|principal|staff)\b/.test(t)) return 'lead';
  if (/\b(senior|sr\.?|iii|iv|manager)\b/.test(t)) return 'senior';
  if (/\b(junior|jr\.?|associate|entry|assistant|i)\b/.test(t)) return 'entry';
  return 'mid';
}

// "$120K – $150K", "$58,000 - $70,000", "$14 - $20/hour" -> yearly numbers.
function salaryOf(text) {
  const s = String(text || '').replace(/,/g, '');
  const m = s.match(/\$\s?(\d+(?:\.\d+)?)\s*([kK])?\s*(?:-|–|to)\s*\$?\s?(\d+(?:\.\d+)?)\s*([kK])?/);
  if (!m) return {};
  let lo = parseFloat(m[1]) * (m[2] ? 1000 : 1);
  let hi = parseFloat(m[3]) * (m[4] ? 1000 : 1);
  if (/hour|hr\b/i.test(s) && hi < 500) { lo *= 2080; hi *= 2080; }
  if (hi < 10000 || lo > hi) return {};
  return { salary_min: Math.round(lo), salary_max: Math.round(hi) };
}

async function getJSON(url, init = {}) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), headers: { Accept: 'application/json', ...(init.headers || {}) } });
  if (!res.ok) throw fail(res.status === 404 ? 404 : 502, `${new URL(url).host} answered HTTP ${res.status}`);
  return res.json();
}

async function mapLimit(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) {
      const k = i++;
      try { out[k] = await fn(items[k]); } catch { out[k] = null; }
    }
  }));
  return out;
}

function parseQuery(token) {
  try { return JSON.parse(token || '{}') || {}; } catch { return {}; }
}

// --- Workday --------------------------------------------------------------------
// Workday boards have no single API host: each company lives on its own
// shard (ingredion.wd1.myworkdayjobs.com/IngredionCareers). The token stores
// "{host}/{site}" (or "{host}/{tenant}/{site}" for wdN.myworkdaysite.com).
// Only Workday's own domains are accepted, so a token can't point anywhere else.
const WD_JOBS_HOST = /^([a-z0-9-]+)\.(?:wd\d+\.)?myworkdayjobs\.com$/;
const WD_SITE_HOST = /^wd\d+\.myworkdaysite\.com$/;
const WD_NAME = /^[A-Za-z0-9_-]{1,80}$/;
const WD_PAGE = 20; // Workday rejects larger pages (HTTP 400)
const WD_MAX_LIST = 300; // newest listings read per run, before local-first sorting and the per-source cap

function parseWorkday(input) {
  let raw = String(input || '').trim();
  if (!raw) return null;
  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;
  let url;
  try { url = new URL(raw); } catch { return null; }
  const host = url.hostname.toLowerCase();
  let parts = url.pathname.split('/').filter(Boolean);
  if (parts[0] === 'wday' && parts[1] === 'cxs') parts = parts.slice(2); // a pasted API URL: tenant/site
  else if (parts.length > 1 && /^[a-z]{2}(-[a-z]{2})?$/i.test(parts[0])) parts = parts.slice(1); // locale, e.g. en-US (a site can be called "JJ")
  const jobs = host.match(WD_JOBS_HOST);
  if (jobs) {
    if (parts.length >= 2 && parts[0].toLowerCase() === jobs[1] && WD_NAME.test(parts[1]) && url.pathname.includes('/wday/cxs/')) parts = parts.slice(1);
    const site = parts[0];
    if (!site || !WD_NAME.test(site) || site === 'job') return null;
    return { host, tenant: jobs[1], site, token: `${host}/${site}` };
  }
  if (WD_SITE_HOST.test(host)) {
    if (parts[0] === 'recruiting') parts = parts.slice(1);
    const [tenant, site] = parts;
    if (!tenant || !site || !WD_NAME.test(tenant) || !WD_NAME.test(site)) return null;
    return { host, tenant: tenant.toLowerCase(), site, token: `${host}/${tenant.toLowerCase()}/${site}` };
  }
  return null;
}

const workdayApi = (w) => `https://${w.host}/wday/cxs/${encodeURIComponent(w.tenant)}/${encodeURIComponent(w.site)}`;
const workdayJobUrl = (w, path) => (WD_SITE_HOST.test(w.host)
  ? `https://${w.host}/en-US/recruiting/${w.tenant}/${w.site}${path}`
  : `https://${w.host}/en-US/${w.site}${path}`);

async function workdayPage(w, { offset = 0, limit = WD_PAGE, facets = {} } = {}) {
  return getJSON(`${workdayApi(w)}/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ appliedFacets: facets, limit, offset, searchText: '' }),
  });
}

// "Posted Today" / "Posted Yesterday" / "Posted 3 Days Ago" / "Posted 30+ Days Ago"
function workdayPosted(text, now = Date.now()) {
  const t = String(text || '').toLowerCase();
  let days = 0;
  if (t.includes('yesterday')) days = 1;
  else if (/(\d+)\+?\s*days?/.test(t)) days = parseInt(t.match(/(\d+)\+?\s*days?/)[1], 10);
  return new Date(now - days * DAY).toISOString();
}

// Checks a board exists; returns { total, us } (us = US postings, or null).
async function workdayProbe(w) {
  const first = await workdayPage(w, { limit: 1 });
  if (typeof first?.total !== 'number') throw fail(400, 'That address didn’t answer like a Workday job board');
  // Boards name their country filter differently (Country, Location_Country,
  // LocationCountry, ...), but its values are countries: find the one that
  // offers "United States of America".
  const groups = (first.facets || []).flatMap((f) => [f, ...(f.values || []).filter((v) => v.facetParameter)]);
  let found = null;
  for (const f of groups) {
    const us = (f.values || []).find((v) => !v.facetParameter && /^united states( of america)?$/i.test(String(v.descriptor || '').trim()));
    if (us?.id) { found = { param: f.facetParameter, id: us.id, count: us.count }; break; }
  }
  return { total: first.total, us: found ? found.count : null, usFacet: found };
}

// --- Fetchers: each returns normalized jobs (newest first, US-relevant) -------
// A normalized job: { external_id, title, company, location, work_type,
// employment_type, description, salary_min, salary_max, salary_text,
// external_url, posted_date, attribution?, needsDetail? }
const FETCHERS = {
  async greenhouse(src) {
    const data = await getJSON(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(src.token)}/jobs`);
    return (data.jobs || [])
      .filter((j) => looksUS(j.location?.name))
      .map((j) => ({
        external_id: String(j.id),
        title: String(j.title || '').trim(),
        company: src.name || String(j.company_name || '').trim(),
        location: j.location?.name || '',
        work_type: workTypeOf(j.location?.name, j.title),
        employment_type: null,
        description: null,
        external_url: safeUrl(j.absolute_url),
        posted_date: j.first_published || j.updated_at,
        needsDetail: true,
      }));
  },
  async greenhouseDetail(src, job) {
    const d = await getJSON(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(src.token)}/jobs/${encodeURIComponent(job.external_id)}`);
    const description = htmlToMarkdown(d.content);
    return { ...job, description, ...salaryOf(description.match(/\$[\d,.]+[kK]?\s*(?:-|–|to)\s*\$?[\d,.]+[kK]?[^\n]{0,20}/)?.[0]) };
  },
  async workday(src) {
    const w = parseWorkday(src.token);
    if (!w) throw fail(400, 'Not a Workday job board address');
    const probe = await workdayProbe(w);
    // Ask Workday for US postings only when the board offers a Country filter;
    // otherwise filter by the location text and the job details.
    const facets = probe.usFacet ? { [probe.usFacet.param]: [probe.usFacet.id] } : {};
    // Workday reports the total only on the first page (later pages say 0),
    // so read page one, then the rest in parallel.
    const first = (await workdayPage(w, { facets })) || {};
    const total = Math.min(typeof first.total === 'number' ? first.total : 0, WD_MAX_LIST);
    const offsets = [];
    for (let o = WD_PAGE; o < total; o += WD_PAGE) offsets.push(o);
    const pages = await mapLimit(offsets, 5, (offset) => workdayPage(w, { offset, facets }));
    const rows = [first, ...pages].flatMap((p) => p?.jobPostings || []); // a page can come back empty
    const seen = new Set();
    return rows
      .filter((j) => j.externalPath && j.title && !seen.has(j.externalPath) && seen.add(j.externalPath))
      .filter((j) => probe.usFacet || /\d+ locations/i.test(j.locationsText || '') || looksUS(j.locationsText))
      .map((j) => ({
        external_id: String((j.bulletFields || [])[0] || j.externalPath),
        title: String(j.title).trim(),
        company: src.name,
        location: j.locationsText || '',
        work_type: workTypeOf(j.locationsText, j.title),
        employment_type: null,
        description: null,
        external_url: safeUrl(workdayJobUrl(w, j.externalPath)),
        posted_date: workdayPosted(j.postedOn),
        path: j.externalPath,
        needsDetail: true,
      }));
  },
  async workdayDetail(src, job) {
    const w = parseWorkday(src.token);
    const d = await getJSON(`${workdayApi(w)}${job.path}`);
    const info = d.jobPostingInfo || {};
    const extra = Array.isArray(info.additionalLocations) ? info.additionalLocations.filter(Boolean) : [];
    const location = info.location ? `${info.location}${extra.length ? ` + ${extra.length} more` : ''}` : job.location;
    const country = info.jobRequisitionLocation?.country?.alpha2Code || info.country?.alpha2Code || info.country?.descriptor;
    if (country ? !looksUS('', country) : !looksUS(location)) return null; // not a US role
    const description = htmlToMarkdown(info.jobDescription);
    const { path, ...rest } = job;
    return {
      ...rest,
      title: String(info.title || job.title).trim(),
      location,
      work_type: workTypeOf(info.remoteType, location, info.title),
      employment_type: employmentOf(info.timeType),
      description,
      ...salaryOf(description.match(/\$[\d,.]+[kK]?\s*(?:-|–|to)\s*\$?[\d,.]+[kK]?[^\n]{0,20}/)?.[0]),
      posted_date: info.startDate ? new Date(`${info.startDate}T12:00:00Z`).toISOString() : job.posted_date,
    };
  },
  // SmartRecruiters: public postings API, filtered to the US. The list has
  // no descriptions, so new postings are read one by one (smartrecruitersDetail).
  async smartrecruiters(src) {
    const id = encodeURIComponent(src.token);
    // Local states first (big boards list thousands of US roles), then the
    // newest anywhere in the US.
    const local = await Promise.all(LOCAL_STATES.map((st) => getJSON(`https://api.smartrecruiters.com/v1/companies/${id}/postings?country=us&region=${encodeURIComponent(st)}&limit=100`)
      .then((p) => p.content || []).catch(() => [])));
    const rows = local.flat();
    for (let offset = 0; offset < 300; offset += 100) {
      const page = await getJSON(`https://api.smartrecruiters.com/v1/companies/${id}/postings?country=us&limit=100&offset=${offset}`);
      rows.push(...(page.content || []));
      if ((page.content || []).length < 100 || offset + 100 >= (page.totalFound || 0)) break;
    }
    const seen = new Set();
    return rows.filter((j) => j.id && j.name && !seen.has(j.id) && seen.add(j.id) && String(j.location?.country || 'us').toLowerCase() === 'us').map((j) => {
      const l = j.location || {};
      const location = l.remote && !l.city ? 'Remote' : [l.city, l.region].filter(Boolean).join(', ') || String(l.fullLocation || '').replace(/,\s*United States$/, '');
      return {
        external_id: String(j.id),
        title: String(j.name).trim(),
        company: src.name,
        location,
        work_type: l.remote ? 'remote' : l.hybrid ? 'hybrid' : 'onsite',
        employment_type: employmentOf(j.typeOfEmployment?.label),
        description: null,
        external_url: safeUrl(`https://jobs.smartrecruiters.com/${id}/${encodeURIComponent(j.id)}`),
        posted_date: j.releasedDate || null,
        needsDetail: true,
      };
    });
  },
  async smartrecruitersDetail(src, job) {
    const d = await getJSON(`https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(src.token)}/postings/${encodeURIComponent(job.external_id)}`);
    const sec = d.jobAd?.sections || {};
    const parts = ['jobDescription', 'qualifications', 'additionalInformation']
      .filter((k) => sec[k]?.text)
      .map((k) => `**${decode(sec[k].title || '')}**\n\n${htmlToMarkdown(sec[k].text)}`);
    const description = parts.join('\n\n').slice(0, DESCRIPTION_MAX);
    return { ...job, description, ...salaryOf(description.match(/\$[\d,.]+[kK]?\s*(?:-|–|to)\s*\$?[\d,.]+[kK]?[^\n]{0,20}/)?.[0]), external_url: safeUrl(d.postingUrl) || job.external_url };
  },
  // Workable: one company's public job widget (descriptions included).
  async workable(src) {
    const d = await getJSON(`https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(src.token)}?details=true`);
    return (d.jobs || []).map((j) => {
      const us = (j.locations || []).find((l) => l.countryCode === 'US' && !l.hidden)
        || (j.country === 'United States' ? { city: j.city, region: j.state } : null);
      if (!us) return null;
      return {
        external_id: String(j.shortcode),
        title: String(j.title || '').trim(),
        company: src.name,
        location: [us.city, us.region].filter(Boolean).join(', ') || (j.telecommuting ? 'Remote' : 'United States'),
        work_type: j.telecommuting ? 'remote' : workTypeOf(j.title),
        employment_type: employmentOf(j.employment_type),
        description: htmlToMarkdown(j.description),
        ...salaryOf(String(j.description || '').replace(/<[^>]+>/g, ' ')),
        external_url: safeUrl(j.url || j.shortlink),
        posted_date: j.published_on ? new Date(`${j.published_on}T12:00:00Z`).toISOString() : null,
      };
    }).filter((j) => j && j.external_id && j.title);
  },
  // Workable's public job search across every employer that hires on
  // Workable: mostly smaller companies the big boards miss. 20 per page.
  async workable_search(src) {
    const q = parseQuery(src.token);
    const params = new URLSearchParams();
    if (q.location) params.set('location', q.location);
    if (q.keywords) params.set('query', q.keywords);
    const rows = [];
    let pageToken = '';
    for (let i = 0; i < 15; i += 1) {
      if (pageToken) params.set('pageToken', pageToken);
      const page = await getJSON(`https://jobs.workable.com/api/v1/jobs?${params}`);
      rows.push(...(page.jobs || []));
      pageToken = page.nextPageToken;
      if (!pageToken || !(page.jobs || []).length) break;
    }
    return rows
      .filter((j) => j.id && j.title && j.state !== 'closed' && /united states/i.test(j.location?.countryName || (j.locations || []).join(' ')))
      .map((j) => {
        const html = [j.description, j.requirementsSection && `<h3>Requirements</h3>${j.requirementsSection}`, j.benefitsSection && `<h3>Benefits</h3>${j.benefitsSection}`].filter(Boolean).join('');
        const loc = j.location || {};
        return {
          external_id: String(j.id),
          title: String(j.title).trim(),
          company: String(j.company?.title || '').trim(),
          location: [loc.city, loc.subregion].filter(Boolean).join(', ') || (j.workplace === 'remote' ? 'Remote' : ''),
          work_type: j.workplace === 'remote' ? 'remote' : j.workplace === 'hybrid' ? 'hybrid' : 'onsite',
          employment_type: employmentOf(j.employmentType),
          description: htmlToMarkdown(html),
          ...salaryOf(String(html).replace(/<[^>]+>/g, ' ')),
          external_url: safeUrl(j.url),
          posted_date: j.created || null,
          attribution: { label: 'Workable', url: 'https://jobs.workable.com' },
        };
      });
  },
  async lever(src) {
    const data = await getJSON(`https://api.lever.co/v0/postings/${encodeURIComponent(src.token)}?mode=json`);
    return (Array.isArray(data) ? data : [])
      .filter((j) => looksUS(j.categories?.location, j.country))
      .map((j) => {
        const lists = (j.lists || []).map((l) => `\n\n**${decode(l.text)}**\n${htmlToMarkdown(`<ul>${l.content}</ul>`)}`).join('');
        const description = `${htmlToMarkdown(j.description)}${lists}${j.additional ? `\n\n${htmlToMarkdown(j.additional)}` : ''}`.slice(0, DESCRIPTION_MAX);
        const range = j.salaryRange && j.salaryRange.min && j.salaryRange.interval === 'per-year-salary'
          ? { salary_min: Math.round(j.salaryRange.min), salary_max: Math.round(j.salaryRange.max) } : salaryOf(j.additionalPlain);
        return {
          external_id: String(j.id),
          title: String(j.text || '').trim(),
          company: src.name,
          location: j.categories?.location || '',
          work_type: workTypeOf(j.workplaceType, j.categories?.location),
          employment_type: employmentOf(j.categories?.commitment),
          description,
          ...range,
          external_url: safeUrl(j.hostedUrl),
          posted_date: j.createdAt ? new Date(Number(j.createdAt)).toISOString() : null,
        };
      });
  },
  async ashby(src) {
    const data = await getJSON(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(src.token)}?includeCompensation=true`);
    return (data.jobs || [])
      .filter((j) => j.isListed !== false)
      .filter((j) => {
        const country = j.address?.postalAddress?.addressCountry;
        if (looksUS(j.location, country)) return true;
        return (j.secondaryLocations || []).some((l) => looksUS(l.location, l.address?.postalAddress?.addressCountry));
      })
      .map((j) => ({
        external_id: String(j.id),
        title: String(j.title || '').trim(),
        company: src.name,
        location: String(j.location || '').replace(/\s*\(HQ\)\s*/i, '').trim(),
        work_type: workTypeOf(j.workplaceType, j.isRemote ? 'remote' : '', j.location),
        employment_type: employmentOf(j.employmentType),
        description: htmlToMarkdown(j.descriptionHtml),
        ...salaryOf(j.compensation?.scrapeableCompensationSalarySummary || j.compensation?.compensationTierSummary),
        external_url: safeUrl(j.jobUrl),
        posted_date: j.publishedAt,
      }));
  },
  async remotive() {
    const data = await getJSON('https://remotive.com/api/remote-jobs');
    return (data.jobs || [])
      .filter((j) => /usa|united states|americas|north america|worldwide|anywhere|global/i.test(j.candidate_required_location || ''))
      .map((j) => ({
        external_id: String(j.id),
        title: decode(j.title).trim(),
        company: decode(j.company_name).trim(),
        location: `Remote (${j.candidate_required_location || 'anywhere'})`,
        work_type: 'remote',
        employment_type: employmentOf(j.job_type),
        description: htmlToMarkdown(j.description),
        salary_text: j.salary || null,
        ...salaryOf(j.salary),
        external_url: safeUrl(j.url),
        posted_date: j.publication_date ? `${j.publication_date}Z`.replace(/ZZ$/, 'Z') : null,
        company_logo_url: safeUrl(j.company_logo),
        attribution: { label: 'Remotive', url: safeUrl(j.url) },
      }));
  },
  async usajobs(src) {
    const q = parseQuery(src.token);
    const params = new URLSearchParams({ ResultsPerPage: String(Math.min(src.max_jobs * 2, 250)), DatePosted: '30', SortField: 'opendate', SortDirection: 'desc' });
    if (q.location) params.set('LocationName', q.location);
    if (q.keyword) params.set('Keyword', q.keyword);
    const data = await getJSON(`https://data.usajobs.gov/api/search?${params}`, {
      headers: { Host: 'data.usajobs.gov', 'User-Agent': env('USAJOBS_EMAIL'), 'Authorization-Key': env('USAJOBS_API_KEY') },
    });
    return (data.SearchResult?.SearchResultItems || []).map((it) => {
      const d = it.MatchedObjectDescriptor || {};
      const pay = (d.PositionRemuneration || [])[0] || {};
      const yearly = pay.RateIntervalCode === 'PA' || pay.RateIntervalCode === 'Per Year';
      const details = d.UserArea?.Details || {};
      const description = [details.JobSummary, details.MajorDuties?.length ? `**Duties**\n${details.MajorDuties.map((x) => `- ${x}`).join('\n')}` : '',
        d.QualificationSummary ? `**Qualifications**\n${d.QualificationSummary}` : ''].filter(Boolean).join('\n\n');
      return {
        external_id: String(d.PositionID || it.MatchedObjectId),
        title: String(d.PositionTitle || '').trim(),
        company: [d.OrganizationName, d.DepartmentName && d.DepartmentName !== d.OrganizationName ? d.DepartmentName : ''].filter(Boolean).join(' · '),
        location: d.PositionLocationDisplay || '',
        work_type: workTypeOf(details.TeleworkEligible ? 'hybrid' : '', d.PositionLocationDisplay),
        employment_type: employmentOf((d.PositionSchedule || [])[0]?.Name),
        description: htmlToMarkdown(description),
        ...(yearly ? { salary_min: Math.round(Number(pay.MinimumRange)) || null, salary_max: Math.round(Number(pay.MaximumRange)) || null } : {}),
        external_url: safeUrl((d.ApplyURI || [])[0] || d.PositionURI),
        posted_date: d.PublicationStartDate,
        attribution: { label: 'USAJOBS', url: safeUrl(d.PositionURI) },
      };
    });
  },
  async adzuna(src) {
    const q = parseQuery(src.token);
    const params = new URLSearchParams({
      app_id: env('ADZUNA_APP_ID'), app_key: env('ADZUNA_APP_KEY'), results_per_page: '50', max_days_old: '21', sort_by: 'date',
      'content-type': 'application/json',
    });
    if (q.where) params.set('where', q.where);
    if (q.what) params.set('what', q.what);
    const pages = Math.max(1, Math.min(3, Math.ceil(src.max_jobs / 50)));
    const results = [];
    for (let p = 1; p <= pages; p += 1) {
      const data = await getJSON(`https://api.adzuna.com/v1/api/jobs/us/search/${p}?${params}`);
      results.push(...(data.results || []));
      if ((data.results || []).length < 50) break;
    }
    return results.map((j) => ({
      external_id: String(j.id),
      title: decode(String(j.title || '').replace(/<[^>]+>/g, '')).trim(),
      company: decode(j.company?.display_name || '').trim(),
      location: j.location?.display_name || '',
      work_type: workTypeOf(j.title, j.description),
      employment_type: employmentOf(j.contract_time || j.contract_type),
      description: htmlToMarkdown(j.description),
      salary_min: j.salary_min && !j.salary_is_predicted ? Math.round(j.salary_min) : null,
      salary_max: j.salary_max && !j.salary_is_predicted ? Math.round(j.salary_max) : null,
      external_url: safeUrl(j.redirect_url),
      posted_date: j.created,
      attribution: { label: 'Jobs by Adzuna', url: 'https://www.adzuna.com' },
    }));
  },
  async jooble(src) {
    const q = parseQuery(src.token);
    const data = await getJSON(`https://jooble.org/api/${encodeURIComponent(env('JOOBLE_API_KEY'))}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keywords: q.keywords || '', location: q.location || '', page: 1, ResultOnPage: Math.min(src.max_jobs, 100) }),
    });
    return (data.jobs || []).map((j) => ({
      external_id: String(j.id),
      title: decode(String(j.title || '').replace(/<[^>]+>/g, '')).trim(),
      company: decode(j.company || '').trim(),
      location: j.location || '',
      work_type: workTypeOf(j.title, j.location, j.snippet),
      employment_type: employmentOf(j.type),
      description: htmlToMarkdown(j.snippet),
      salary_text: j.salary || null,
      ...salaryOf(j.salary),
      external_url: safeUrl(j.link),
      posted_date: j.updated,
      attribution: { label: 'Jooble', url: 'https://jooble.org' },
    }));
  },
};

// --- Sync one source -----------------------------------------------------------
function withoutDuplicates(src, jobs) {
  const urls = [...new Set(jobs.map((j) => j.external_url).filter(Boolean))];
  const taken = new Set();
  for (let i = 0; i < urls.length; i += 200) {
    const chunk = urls.slice(i, i + 200);
    const rows = db.prepare(`SELECT json_extract(data, '$.external_url') AS url FROM records WHERE entity = 'Job'
      AND json_extract(data, '$.external_url') IN (${chunk.map(() => '?').join(', ')})
      AND json_extract(data, '$.status') = 'active' AND json_extract(data, '$.source_id') != ?`).all(...chunk, src.id);
    for (const r of rows) taken.add(r.url);
  }
  return jobs.filter((j) => !taken.has(j.external_url));
}

function existingJobs(sourceId) {
  return db.prepare("SELECT id, data FROM records WHERE entity = 'Job' AND json_extract(data, '$.source_id') = ?").all(sourceId)
    .map((r) => ({ id: r.id, ...JSON.parse(r.data || '{}') }));
}

function toRecord(src, j, now) {
  const kind = KINDS[src.kind];
  return {
    title: j.title.slice(0, 300),
    company: (j.company || src.name).slice(0, 200),
    location: (j.location || '').slice(0, 200),
    work_type: j.work_type || null,
    employment_type: j.employment_type || null,
    experience_level: levelOf(j.title),
    description: j.description || '',
    salary_min: j.salary_min || null,
    salary_max: j.salary_max || null,
    salary_text: j.salary_text || null,
    skills: [],
    status: 'active',
    imported: true,
    source: src.kind,
    source_id: src.id,
    source_name: kind.label,
    external_key: `${src.kind}:${src.token}:${j.external_id}`,
    external_url: j.external_url,
    company_logo_url: j.company_logo_url || null,
    attribution: j.attribution || null,
    posted_date: j.posted_date ? new Date(j.posted_date).toISOString() : now,
    imported_at: now,
  };
}

function insertJobs(records) {
  const { upsertRows, toRow } = require('./jobindex');
  const now = new Date().toISOString();
  const rows = records.map((data) => ({ id: crypto.randomUUID(), data }));
  for (let i = 0; i < rows.length; i += 80) {
    const chunk = rows.slice(i, i + 80);
    db.prepare(`INSERT INTO records (entity, id, created_by_id, created_date, updated_date, data) VALUES ${chunk.map(() => "('Job', ?, NULL, ?, ?, ?)").join(', ')}`)
      .run(...chunk.flatMap((r) => [r.id, r.data.posted_date || now, now, JSON.stringify(r.data)]));
  }
  upsertRows(rows.map((r) => toRow({ id: r.id, ...r.data, created_date: r.data.posted_date })));
}

function setJobsStatus(ids, status) {
  const { setStatus } = require('./jobindex');
  const now = new Date().toISOString();
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    db.prepare(`UPDATE records SET data = json_set(data, '$.status', ?), updated_date = ? WHERE entity = 'Job' AND id IN (${chunk.map(() => '?').join(', ')})`)
      .run(status, now, ...chunk);
  }
  setStatus(ids, status);
}

async function syncSource(src) {
  const kind = KINDS[src.kind];
  if (!kind) throw fail(400, `Unknown source type ${src.kind}`);
  const missing = missingEnv(src.kind);
  if (missing.length) throw fail(412, `Needs ${missing.join(' and ')}`);
  const now = new Date().toISOString();
  let fetched = await FETCHERS[src.kind](src);
  fetched = fetched.filter((j) => j.title && j.external_id && j.external_url);
  // Local roles first (TB_JOB_REGION, default Maryland / DC / Virginia), then
  // newest, capped per source.
  const local = (j) => (REGION.test(j.location || '') ? 1 : 0);
  fetched.sort((a, b) => local(b) - local(a) || String(b.posted_date || '').localeCompare(String(a.posted_date || '')));
  const wanted = fetched.slice(0, src.max_jobs);

  const existing = existingJobs(src.id);
  const byKey = new Map(existing.map((j) => [j.external_key, j]));
  const wantedKeys = new Set(wanted.map((j) => `${src.kind}:${src.token}:${j.external_id}`));

  let fresh = wanted.filter((j) => !byKey.has(`${src.kind}:${src.token}:${j.external_id}`));
  // Boards whose lists omit descriptions: fetch details for new jobs only.
  const detail = FETCHERS[`${src.kind}Detail`];
  // The same posting can come from two sources (overlapping searches, an
  // aggregator repeating a company board): keep the copy already listed.
  fresh = withoutDuplicates(src, fresh);
  if (detail) fresh = (await mapLimit(fresh, 8, (j) => detail(src, j))).filter(Boolean);
  // Again right before saving (no await in between), since other sources may
  // have saved the same posting while details were being fetched.
  if (detail) fresh = withoutDuplicates(src, fresh);
  if (fresh.length) insertJobs(fresh.map((j) => toRecord(src, j, now)));

  // Jobs back in the feed after being closed reopen; gone ones close.
  const reopen = existing.filter((j) => j.status !== 'active' && wantedKeys.has(j.external_key)).map((j) => j.id);
  const close = existing.filter((j) => j.status === 'active' && !wantedKeys.has(j.external_key)).map((j) => j.id);
  if (reopen.length) setJobsStatus(reopen, 'active');
  if (close.length) setJobsStatus(close, 'closed');

  const active = db.prepare("SELECT COUNT(*) AS n FROM records WHERE entity = 'Job' AND json_extract(data, '$.source_id') = ? AND json_extract(data, '$.status') = 'active'").get(src.id).n;
  return { found: fetched.length, added: fresh.length, reopened: reopen.length, closed: close.length, active };
}

// A failed run keeps the old last_run_at, so the source is retried on the
// next run instead of waiting a day.
function recordRun(src, result, error) {
  db.prepare('UPDATE job_sources SET last_run_at = ?, last_status = ?, last_error = ?, last_found = ?, active_count = ? WHERE id = ?').run(
    error && error.status !== 412 ? src.last_run_at : new Date().toISOString(),
    error ? (error.status === 412 ? 'needs_key' : 'error') : 'ok',
    error ? String(error.message).slice(0, 300) : null,
    result?.found ?? null,
    result?.active ?? (db.prepare("SELECT COUNT(*) AS n FROM records WHERE entity = 'Job' AND json_extract(data, '$.source_id') = ? AND json_extract(data, '$.status') = 'active'").get(src.id).n),
    src.id
  );
}

// Runs due sources (or the given ones) within a time budget.
async function runImports({ budgetMs = 45000, force = false, sourceIds = null, concurrency = 5 } = {}) {
  require('./jobindex').rebuildIfEmpty();
  const started = Date.now();
  const all = db.prepare('SELECT * FROM job_sources WHERE enabled = 1 ORDER BY COALESCE(last_run_at, \'\') ASC').all();
  const due = all.filter((s) => {
    if (sourceIds) return sourceIds.includes(s.id);
    if (missingEnv(s.kind).length) return false;
    if (force) return true;
    const last = Date.parse(s.last_run_at || '') || 0;
    return Date.now() - last >= KINDS[s.kind].minGapMs;
  });
  const report = { due: due.length, ran: 0, added: 0, closed: 0, errors: [], skipped: 0 };
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, due.length) }, async () => {
    while (next < due.length) {
      // Stop starting sources a little past halfway: the slowest take ~25s, and
      // the whole run must finish inside Vercel's 60-second limit.
      if (Date.now() - started > budgetMs * 0.55) { report.skipped = due.length - next; next = due.length; break; }
      const src = due[next++];
      try {
        const r = await syncSource(src);
        recordRun(src, r, null);
        report.ran += 1;
        report.added += r.added;
        report.closed += r.closed;
      } catch (e) {
        recordRun(src, null, e);
        report.errors.push(`${src.name}: ${e.message}`);
      }
    }
  }));
  return report;
}

function listSources() {
  return db.prepare('SELECT * FROM job_sources ORDER BY kind, name').all().map((s) => ({
    ...s,
    enabled: !!s.enabled,
    kind_label: KINDS[s.kind]?.label || s.kind,
    needs: missingEnv(s.kind),
    query: KINDS[s.kind]?.company ? null : parseQuery(s.token),
  }));
}

async function addSource(body) {
  const kind = String(body.kind || '');
  if (!KINDS[kind]) throw fail(400, 'Choose a source type');
  let token = '';
  let workday = null;
  if (kind === 'workday') {
    workday = parseWorkday(body.token);
    if (!workday) throw fail(400, 'Paste the company’s Workday careers address, e.g. https://ingredion.wd1.myworkdayjobs.com/en-US/IngredionCareers');
    token = workday.token;
  } else if (kind === 'smartrecruiters') {
    // Company identifiers are case-sensitive ("BoschGroup").
    token = String(body.token || '').trim();
    const m = token.match(/(?:jobs|careers)\.smartrecruiters\.com\/([A-Za-z0-9_-]+)/i) || token.match(/api\.smartrecruiters\.com\/v1\/companies\/([A-Za-z0-9_-]+)/i);
    if (m) token = m[1];
    if (!/^[A-Za-z0-9_-]{2,80}$/.test(token)) throw fail(400, 'Enter the company’s SmartRecruiters name, e.g. BoschGroup from jobs.smartrecruiters.com/BoschGroup');
  } else if (KINDS[kind].company) {
    token = String(body.token || '').trim().toLowerCase();
    // Accept a pasted board URL as well as the bare name.
    const m = token.match(/(?:boards\.greenhouse\.io|job-boards\.greenhouse\.io|jobs\.lever\.co|jobs\.ashbyhq\.com|apply\.workable\.com)\/(?:api\/v1\/widget\/accounts\/)?([a-z0-9_-]+)/);
    if (m) token = m[1];
    if (!/^[a-z0-9_-]{2,80}$/.test(token)) throw fail(400, 'Enter the company’s board name (the part after the domain in its jobs URL)');
  } else if (kind !== 'remotive') {
    const q = {};
    for (const k of ['location', 'keyword', 'where', 'what', 'keywords']) if (body[k]) q[k] = String(body[k]).trim().slice(0, 100);
    token = JSON.stringify(q);
  }
  if (db.prepare('SELECT 1 FROM job_sources WHERE kind = ? AND token = ?').get(kind, token)) throw fail(409, 'That source is already on the list');
  const src = {
    id: crypto.randomUUID(),
    kind,
    token,
    name: String(body.name || '').trim().slice(0, 80) || (KINDS[kind].company ? token : `${KINDS[kind].label}${token && token !== '{}' ? `: ${Object.values(parseQuery(token)).join(', ')}` : ''}`),
    max_jobs: Math.min(Math.max(parseInt(body.max_jobs, 10) || MAX_PER_SOURCE, 1), 200),
  };
  // Company boards: check the board exists before saving it.
  if (workday) {
    const probe = await workdayProbe(workday).catch((e) => {
      throw fail(400, e.status === 404 ? `No Workday job board at ${workday.host}/${workday.site}. Check the careers address.` : e.message);
    });
    src.preview = probe.us ?? probe.total;
    if (!body.name) src.name = workday.tenant.charAt(0).toUpperCase() + workday.tenant.slice(1);
  } else if (kind === 'smartrecruiters') {
    // Unknown names return an empty list, not a 404: require open postings.
    const base = `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(token)}/postings?limit=1`;
    const [all, us] = await Promise.all([getJSON(base), getJSON(`${base}&country=us`)]);
    if (!all.totalFound) throw fail(400, `No open jobs on SmartRecruiters for “${token}”. Check the name in the company’s jobs.smartrecruiters.com link (capitals matter).`);
    src.preview = us.totalFound || 0;
    if (!body.name && all.content?.[0]?.company?.name) src.name = all.content[0].company.name;
  } else if (kind === 'workable') {
    const d = await getJSON(`https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(token)}`)
      .catch((e) => { throw fail(400, e.status === 404 ? `No Workable careers page called “${token}”. Check the name in the company’s apply.workable.com link.` : e.message); });
    src.preview = (d.jobs || []).filter((j) => (j.locations || []).some((l) => l.countryCode === 'US') || j.country === 'United States').length;
    if (!body.name && d.name) src.name = d.name;
  } else if (KINDS[kind].company) {
    const jobs = await FETCHERS[kind]({ ...src }).catch((e) => { throw fail(400, e.status === 404 ? `No ${KINDS[kind].label} board called “${token}”` : e.message); });
    src.preview = jobs.length;
  }
  db.prepare('INSERT INTO job_sources (id, kind, token, name, enabled, max_jobs, created_date) VALUES (?, ?, ?, ?, 1, ?, ?)')
    .run(src.id, src.kind, src.token, src.name, src.max_jobs, new Date().toISOString());
  return src;
}

function updateSource(id, body) {
  const src = db.prepare('SELECT * FROM job_sources WHERE id = ?').get(id);
  if (!src) throw fail(404, 'Source not found');
  if ('enabled' in body) {
    db.prepare('UPDATE job_sources SET enabled = ? WHERE id = ?').run(body.enabled ? 1 : 0, id);
    if (!body.enabled) closeSourceJobs(id);
  }
  if ('max_jobs' in body) db.prepare('UPDATE job_sources SET max_jobs = ? WHERE id = ?').run(Math.min(Math.max(parseInt(body.max_jobs, 10) || MAX_PER_SOURCE, 1), 200), id);
  if ('name' in body && String(body.name).trim()) db.prepare('UPDATE job_sources SET name = ? WHERE id = ?').run(String(body.name).trim().slice(0, 80), id);
  return listSources().find((s) => s.id === id);
}

function closeSourceJobs(id) {
  const ids = db.prepare("SELECT id FROM records WHERE entity = 'Job' AND json_extract(data, '$.source_id') = ? AND json_extract(data, '$.status') = 'active'").all(id).map((r) => r.id);
  if (ids.length) setJobsStatus(ids, 'closed');
  db.prepare('UPDATE job_sources SET active_count = 0 WHERE id = ?').run(id);
  return ids.length;
}

function removeSource(id) {
  const closed = closeSourceJobs(id);
  db.prepare('DELETE FROM job_sources WHERE id = ?').run(id);
  return { removed: true, closed };
}

function registerImportRoutes(app) {
  const wrap = (fn) => async (req, res) => {
    try {
      res.json({ data: await fn(req) });
    } catch (e) {
      if (!e.status || e.status >= 500) require('./monitor').captureServerError(e, req);
      res.status(e.status || 500).json({ error: e.message });
    }
  };
  const admin = (req) => { if (req.user?.role !== 'admin') throw fail(403, 'Admins only'); };

  app.get('/api/admin/job-sources', authRequired, wrap((req) => {
    admin(req);
    return { sources: listSources(), kinds: Object.entries(KINDS).map(([id, k]) => ({ id, label: k.label, company: k.company, needs: missingEnv(id) })), totals: require('./jobindex').counts() };
  }));
  app.post('/api/admin/job-sources', authRequired, wrap(async (req) => {
    admin(req);
    const src = await addSource(req.body || {});
    require('./audit').audit(req.user, 'jobs.source_added', { type: 'job_source', id: src.id }, { kind: src.kind, name: src.name });
    return src;
  }));
  app.put('/api/admin/job-sources/:id', authRequired, wrap((req) => { admin(req); return updateSource(req.params.id, req.body || {}); }));
  app.delete('/api/admin/job-sources/:id', authRequired, wrap((req) => {
    admin(req);
    const out = removeSource(req.params.id);
    require('./audit').audit(req.user, 'jobs.source_removed', { type: 'job_source', id: req.params.id }, out);
    return out;
  }));
  app.post('/api/admin/job-sources/run', authRequired, wrap(async (req) => {
    admin(req);
    const ids = Array.isArray(req.body?.source_ids) ? req.body.source_ids.map(String) : null;
    const report = await runImports({ force: true, sourceIds: ids });
    require('./audit').audit(req.user, 'jobs.import_run', { type: 'job_sources' }, { ran: report.ran, added: report.added, closed: report.closed, errors: report.errors.length });
    return report;
  }));

  // Daily, from Vercel Cron (same CRON_SECRET as job alerts).
  app.get('/api/cron/import-jobs', wrap(async (req) => {
    const secret = process.env.CRON_SECRET;
    if (!secret) throw fail(503, 'Set CRON_SECRET to enable scheduled imports');
    const given = Buffer.from(String(req.headers.authorization || ''));
    const expected = Buffer.from(`Bearer ${secret}`);
    if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) throw fail(401, 'Unauthorized');
    const report = await runImports();
    console.log('[imports] run', report);
    return report;
  }));
}

module.exports = { parseWorkday, workdayPosted, registerImportRoutes, runImports, syncSource, listSources, addSource, htmlToMarkdown, looksUS, salaryOf, levelOf, KINDS, FETCHERS, DEFAULT_SOURCES };
