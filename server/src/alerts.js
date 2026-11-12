'use strict';
// Job alerts: seekers opt in to a daily or weekly email of NEW open roles
// that match their profile well (cached AI match score >= their minimum).
//
//   GET/PUT /api/alerts/preferences          the seeker's own setting
//   GET     /api/cron/job-alerts              run by Vercel Cron (CRON_SECRET)
//   POST    /api/admin/alerts/run             same, on demand (admins)
//   GET/POST /api/alerts/unsubscribe?u=&sig=  signed one-click unsubscribe
//
// Each run works within a time budget; seekers it doesn't reach stay due
// and are picked up by the next run.
const crypto = require('crypto');
const { db } = require('./db');
const { authRequired, getUserById, publicUser, jwtSecret } = require('./auth');
const { store } = require('./entities');

const FREQUENCIES = ['off', 'daily', 'weekly'];
const DEFAULT_MIN_SCORE = 70;
const DUE_AFTER_MS = { daily: 20 * 60 * 60 * 1000, weekly: 6.5 * 24 * 60 * 60 * 1000 };
const FIRST_LOOKBACK_MS = { daily: 24 * 60 * 60 * 1000, weekly: 7 * 24 * 60 * 60 * 1000 };
const RUN_BUDGET_MS = 40 * 1000;
const MAX_JOBS_PER_EMAIL = 10;

function fail(status, message) {
  return Object.assign(new Error(message), { status });
}

function dataOf(row) {
  try { return JSON.parse(row?.data || '{}') || {}; } catch { return {}; }
}

function preferencesOf(row) {
  const p = dataOf(row).job_alerts || {};
  return {
    frequency: FREQUENCIES.includes(p.frequency) ? p.frequency : 'off',
    min_score: Number.isFinite(p.min_score) ? p.min_score : DEFAULT_MIN_SCORE,
    last_sent_at: p.last_sent_at || null,
    last_checked_at: p.last_checked_at || null,
    subscribed_at: p.subscribed_at || null,
  };
}

function savePreferences(userId, changes) {
  const row = getUserById(userId);
  const data = dataOf(row);
  data.job_alerts = { ...(data.job_alerts || {}), ...changes };
  db.prepare('UPDATE users SET data = ? WHERE id = ?').run(JSON.stringify(data), userId);
  return preferencesOf(getUserById(userId));
}

// --- Signed unsubscribe links ------------------------------------------------
function unsubscribeSig(userId) {
  const key = crypto.createHash('sha256').update(`alerts-unsubscribe:${jwtSecret()}`).digest();
  return crypto.createHmac('sha256', key).update(String(userId)).digest('base64url').slice(0, 32);
}

function unsubscribeUrl(userId) {
  const { appUrl } = require('./mailer');
  return appUrl(`/api/alerts/unsubscribe?u=${encodeURIComponent(userId)}&sig=${unsubscribeSig(userId)}`);
}

function validUnsubscribe(userId, sig) {
  if (!userId || typeof sig !== 'string') return false;
  const a = Buffer.from(unsubscribeSig(userId));
  const b = Buffer.from(sig);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// --- The run -----------------------------------------------------------------
function dueSubscribers(now) {
  const { isListable, hasMatchableData } = require('./completeness');
  const out = [];
  for (const row of db.prepare("SELECT * FROM users WHERE role = 'job_seeker'").all()) {
    const prefs = preferencesOf(row);
    if (prefs.frequency === 'off') continue;
    const last = Date.parse(prefs.last_checked_at || '') || 0;
    if (last && now - last < DUE_AFTER_MS[prefs.frequency]) continue;
    const profile = store.filter('SeekerProfile', { created_by_id: row.id })[0];
    if (!profile || !isListable(profile) || !hasMatchableData(profile)) continue;
    const since = last || Math.max(Date.parse(prefs.subscribed_at || '') || 0, now - FIRST_LOOKBACK_MS[prefs.frequency]);
    out.push({ row, prefs, profile, since });
  }
  return out;
}

function alertEmail(row, profile, prefs, matches) {
  const { layout, appUrl } = require('./mailer');
  const first = String(profile.full_name || '').trim().split(/\s+/)[0];
  const lines = matches.map(({ job, score, summary }) => {
    const where = job.work_type === 'remote' ? 'Remote' : job.location || '';
    return `• ${job.title}${job.company ? ` at ${job.company}` : ''}${where ? ` (${where})` : ''}: ${score}% match\n  ${summary ? `${summary}\n  ` : ''}${appUrl(`/jobs/${job.id}`)}`;
  });
  const unsubscribe = unsubscribeUrl(row.id);
  const mail = layout({
    heading: matches.length === 1 ? 'A new role matches your profile' : `${matches.length} new roles match your profile`,
    paragraphs: [
      `Hi ${first || 'there'},`,
      `These roles were posted ${prefs.frequency === 'weekly' ? 'this week' : 'since your last alert'} and scored ${prefs.min_score}% or higher against your profile (AI-assisted; your name and contact details aren’t used for matching).`,
      lines.join('\n\n'),
      `Change how often you get these, or turn them off, in your settings: ${appUrl('/settings')}\nUnsubscribe in one click: ${unsubscribe}`,
    ],
    button: { label: 'See all open roles', url: appUrl('/jobs') },
  });
  return {
    to: row.email,
    subject: matches.length === 1
      ? `New match: ${matches[0].job.title}${matches[0].job.company ? ` at ${matches[0].job.company}` : ''}`
      : `${matches.length} new roles match your profile`,
    ...mail,
    headers: {
      'List-Unsubscribe': `<${unsubscribe}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  };
}

async function runJobAlerts({ now = Date.now(), budgetMs = RUN_BUDGET_MS } = {}) {
  const started = Date.now();
  const { scoreAndCache, cachedMatch, matchJobKey } = require('./functions');
  const { notify } = require('./notifications');
  const subs = dueSubscribers(now);
  const report = { due: subs.length, emailed: 0, no_new_matches: 0, deferred: 0, scored: 0 };
  if (!subs.length) return report;

  // Candidates per subscriber come from the job index: new active roles
  // ranked by overlap with the profile (roles posted on TalentBridge always
  // qualify), so the AI scores a dozen likely fits, not every listing.
  const { suggestFor } = require('./jobindex');
  const jobCache = new Map();
  const loadJob = (id) => {
    if (!jobCache.has(id)) jobCache.set(id, store.get('Job', id));
    return jobCache.get(id);
  };
  const candidates = new Map();
  for (const s of subs) {
    const applied = store.filter('JobApplication', { created_by_id: s.row.id }).map((a) => a.job_id);
    const picks = suggestFor(s.profile, { limit: 12, since: new Date(s.since).toISOString(), excludeIds: applied })
      .map((p) => loadJob(p.id))
      .filter((j) => j && j.status === 'active' && j.created_by_id !== s.row.id);
    candidates.set(s.row.id, picks);
  }
  const jobsFor = (s) => candidates.get(s.row.id) || [];
  const activeJobs = [...jobCache.values()].filter(Boolean);

  // Score every (new job, subscriber) pair that isn't cached, one job at a
  // time (each job's subscribers in batched AI calls), within the budget.
  const keys = new Map(activeJobs.map((j) => [j.id, matchJobKey(j)]));
  const needs = new Map(); // job id -> profiles to score
  for (const s of subs) {
    for (const job of jobsFor(s)) {
      if (cachedMatch(job.id, s.profile, keys.get(job.id))) continue;
      if (!needs.has(job.id)) needs.set(job.id, []);
      needs.get(job.id).push(s.profile);
    }
  }
  for (const [jobId, profiles] of needs) {
    if (Date.now() - started > budgetMs * 0.7) break;
    const job = activeJobs.find((j) => j.id === jobId);
    await scoreAndCache(job, profiles, keys.get(jobId));
    report.scored += profiles.length;
  }

  for (const s of subs) {
    if (Date.now() - started > budgetMs) { report.deferred += 1; continue; }
    const jobs = jobsFor(s);
    const results = jobs.map((job) => ({ job, row: cachedMatch(job.id, s.profile, keys.get(job.id)) }));
    // A pair the AI couldn't score yet: try again next run.
    if (results.some((r) => !r.row)) { report.deferred += 1; continue; }
    const matches = results
      .filter((r) => r.row.score >= s.prefs.min_score)
      .sort((a, b) => b.row.score - a.row.score)
      .slice(0, MAX_JOBS_PER_EMAIL)
      .map((r) => ({ job: r.job, score: r.row.score, summary: r.row.summary }));
    const checkedAt = new Date(now).toISOString();
    if (!matches.length) {
      savePreferences(s.row.id, { last_checked_at: checkedAt });
      report.no_new_matches += 1;
      continue;
    }
    const status = await notify('job_alert', alertEmail(s.row, s.profile, s.prefs, matches), {
      user_id: s.row.id, job_ids: matches.map((m) => m.job.id),
    });
    if (status === 'sent' || status === 'queued_no_mailer') {
      savePreferences(s.row.id, { last_checked_at: checkedAt, last_sent_at: checkedAt });
      report.emailed += status === 'sent' ? 1 : 0;
    } else {
      report.deferred += 1; // email failed: keep the window so the next run retries
    }
  }
  return report;
}

const UNSUB_PAGE = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#f6f5f2;color:#1c1b22;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:16px}
main{background:#fff;border-radius:12px;padding:28px;max-width:420px}h1{font-size:20px;margin:0 0 8px}a{color:#5b2bd9}</style></head>
<body><main><h1>${title}</h1><p>${body}</p><p><a href="/settings">Manage email settings</a></p></main></body></html>`;

function registerAlertRoutes(app) {
  const wrap = (fn) => async (req, res) => {
    try {
      res.json({ data: await fn(req) });
    } catch (e) {
      if (!e.status || e.status >= 500) require('./monitor').captureServerError(e, req);
      res.status(e.status || 500).json({ error: e.message });
    }
  };

  app.get('/api/alerts/preferences', authRequired, wrap((req) => preferencesOf(getUserById(req.user.id))));

  app.put('/api/alerts/preferences', authRequired, wrap((req) => {
    if (!['job_seeker', 'admin'].includes(req.user.role)) throw fail(403, 'Job alerts are for job seekers');
    const { frequency, min_score: minScore } = req.body || {};
    const changes = {};
    if (frequency !== undefined) {
      if (!FREQUENCIES.includes(frequency)) throw fail(400, 'frequency must be off, daily or weekly');
      const before = preferencesOf(getUserById(req.user.id));
      changes.frequency = frequency;
      if (frequency !== 'off' && before.frequency === 'off') {
        changes.subscribed_at = new Date().toISOString();
        changes.last_checked_at = null;
      }
    }
    if (minScore !== undefined) {
      const n = Math.round(Number(minScore));
      if (!Number.isFinite(n) || n < 40 || n > 95) throw fail(400, 'min_score must be between 40 and 95');
      changes.min_score = n;
    }
    return savePreferences(req.user.id, changes);
  }));

  // Vercel Cron calls this with "Authorization: Bearer $CRON_SECRET".
  app.get('/api/cron/job-alerts', wrap(async (req) => {
    const secret = process.env.CRON_SECRET;
    if (!secret) throw fail(503, 'Set CRON_SECRET to enable scheduled job alerts');
    const given = Buffer.from(String(req.headers.authorization || ''));
    const expected = Buffer.from(`Bearer ${secret}`);
    if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) throw fail(401, 'Unauthorized');
    const report = await runJobAlerts();
    console.log('[alerts] run', report);
    return report;
  }));

  app.post('/api/admin/alerts/run', authRequired, wrap(async (req) => {
    if (req.user.role !== 'admin') throw fail(403, 'Admins only');
    const report = await runJobAlerts();
    require('./audit').audit(req.user, 'alerts.run', { type: 'job_alerts' }, report);
    return report;
  }));

  const unsubscribe = (req, res) => {
    const userId = String(req.query.u || '');
    if (!validUnsubscribe(userId, req.query.sig) || !getUserById(userId)) {
      return res.status(400).type('html').send(UNSUB_PAGE('Link not valid', 'This unsubscribe link isn’t valid. You can turn job alerts off in your account settings.'));
    }
    savePreferences(userId, { frequency: 'off' });
    if (req.method === 'POST') return res.status(200).json({ unsubscribed: true });
    return res.type('html').send(UNSUB_PAGE('You’re unsubscribed', 'You won’t get job alert emails anymore. Emails about your applications and messages still arrive as usual.'));
  };
  app.get('/api/alerts/unsubscribe', unsubscribe);
  app.post('/api/alerts/unsubscribe', unsubscribe);
}

module.exports = { registerAlertRoutes, runJobAlerts, preferencesOf, unsubscribeUrl };
