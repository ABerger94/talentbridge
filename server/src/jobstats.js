'use strict';
// Per-role numbers for employers: unique daily visitors to the role page,
// applicants, where they are in the pipeline, and how quickly the employer
// responds. Visitors are counted as a salted hash (no IPs or ids stored).
const crypto = require('crypto');
const { db } = require('./db');
const { authRequired } = require('./auth');
const { store } = require('./entities');

db.exec(`
CREATE TABLE IF NOT EXISTS job_views (
  job_id TEXT NOT NULL,
  visitor TEXT NOT NULL,
  day TEXT NOT NULL,
  PRIMARY KEY (job_id, visitor, day)
);
`);

const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|embedly|headless/i;

function recordView(req, job) {
  try {
    if (!job || job.status !== 'active') return;
    if (req.user && (req.user.id === job.created_by_id || req.user.role === 'admin')) return;
    const ua = String(req.headers['user-agent'] || '');
    if (!ua || BOT.test(ua)) return;
    const day = new Date().toISOString().slice(0, 10);
    const who = req.user?.id || `${req.ip}|${ua}`;
    const visitor = crypto.createHash('sha256').update(`${day}|${who}|${process.env.TB_JWT_SECRET || ''}`).digest('hex').slice(0, 20);
    db.prepare('INSERT OR IGNORE INTO job_views (job_id, visitor, day) VALUES (?, ?, ?)').run(job.id, visitor, day);
  } catch { /* stats must never break the page */ }
}

const PIPELINE = ['applied', 'reviewed', 'shortlisted', 'interview', 'offered', 'rejected', 'withdrawn'];

function statsFor(job) {
  const since7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const views = db.prepare('SELECT COUNT(*) AS n FROM job_views WHERE job_id = ?').get(job.id).n;
  const views7 = db.prepare('SELECT COUNT(*) AS n FROM job_views WHERE job_id = ? AND day >= ?').get(job.id, since7).n;
  const apps = store.filter('JobApplication', { job_id: job.id });
  const by = Object.fromEntries(PIPELINE.map((s) => [s, 0]));
  for (const a of apps) by[a.status === 'offer_extended' ? 'offered' : a.status] = (by[a.status] || 0) + 1;
  const active = apps.filter((a) => a.status !== 'withdrawn');
  // "Responded" = moved past New, or the employer messaged them.
  const responded = active.filter((a) => a.status !== 'applied'
    || db.prepare('SELECT 1 FROM messages WHERE application_id = ? AND sender_id = ? LIMIT 1').get(a.id, job.created_by_id));
  return {
    job_id: job.id,
    views,
    views_7d: views7,
    applicants: active.length,
    apply_rate: views ? Math.round((active.length / views) * 100) : null,
    pipeline: by,
    hired: apps.filter((a) => a.status === 'offered' && a.offer_response === 'accepted').length,
    awaiting_response: active.filter((a) => a.status === 'applied').length,
    response_rate: active.length ? Math.round((responded.length / active.length) * 100) : null,
  };
}

function registerJobStatsRoutes(app) {
  app.get('/api/employer/job-stats', authRequired, (req, res) => {
    if (!['employer', 'admin'].includes(req.user.role)) return res.status(403).json({ error: 'Employers only' });
    const jobs = store.filter('Job', { created_by_id: req.user.id });
    res.json({ data: jobs.map(statsFor) });
  });
}

module.exports = { registerJobStatsRoutes, recordView, statsFor };
