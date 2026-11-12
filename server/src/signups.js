'use strict';
// Admin follow-up on signups that stalled before a usable seeker profile:
// who they are, how far they got, where they stopped, and a one-click
// reminder email (at most once a week per person).
const { db } = require('./db');
const { authRequired, getUserById, publicUser } = require('./auth');
const { store } = require('./entities');
const { profileCompleteness, graphBuilt } = require('./completeness');

const REMINDER_GAP_MS = 7 * 24 * 60 * 60 * 1000;

function fail(status, message) {
  return Object.assign(new Error(message), { status });
}

function dataOf(row) {
  try {
    return JSON.parse(row?.data || '{}') || {};
  } catch {
    return {};
  }
}

// Ordered steps from signup to a complete, visible profile. `tab` is where
// the seeker completes that step (/dashboard?tab=…).
function progressFor(row, profile) {
  const p = profile || {};
  const steps = [
    { key: 'verify', label: 'Verify email', done: !!row.email_verified },
    { key: 'role', label: 'Choose account type', done: row.role !== 'user' },
    { key: 'name', label: 'Add name', done: !!String(p.full_name || '').trim(), tab: 'profile' },
    { key: 'headline', label: 'Write headline or bio', done: !!String(p.headline || p.bio || '').trim(), tab: 'profile' },
    { key: 'resume', label: 'Upload resume', done: !!p.resume_url, tab: 'resume' },
    { key: 'skills', label: 'Add skills or build Capability Graph', done: (Array.isArray(p.skills) && p.skills.length > 0) || graphBuilt(p), tab: 'resume' },
  ];
  const done = steps.filter((s) => s.done).length;
  const next = steps.find((s) => !s.done) || null;
  const last = [...steps].reverse().find((s) => s.done) || null;
  return { percent: Math.round((done / steps.length) * 100), next, last, steps };
}

function incompleteSignups() {
  const profiles = store.all('SeekerProfile');
  const byOwner = new Map(profiles.map((p) => [p.created_by_id, p]));
  const rows = db.prepare("SELECT * FROM users WHERE role IN ('user', 'job_seeker') ORDER BY created_date DESC").all();
  const out = [];
  for (const row of rows) {
    if (publicUser(row).role === 'admin') continue;
    const profile = byOwner.get(row.id) || null;
    if (row.role === 'job_seeker' && profile && profileCompleteness(profile).complete && row.email_verified) continue;
    const data = dataOf(row);
    const progress = progressFor(row, profile);
    out.push({
      id: row.id,
      email: row.email,
      name: String(profile?.full_name || data.full_name || '').trim(),
      role: row.role,
      created_date: row.created_date,
      percent: progress.percent,
      last_step: progress.last?.label || 'Signed up',
      next_step: progress.next?.label || null,
      missing: progress.steps.filter((s) => !s.done).map((s) => s.label),
      last_reminder_at: data.last_reminder_at || null,
      can_remind: !data.last_reminder_at || Date.now() - Date.parse(data.last_reminder_at) >= REMINDER_GAP_MS,
    });
  }
  return out;
}

async function sendReminder(userId) {
  const row = getUserById(userId);
  if (!row || !['user', 'job_seeker'].includes(row.role)) throw fail(404, 'User not found');
  const data = dataOf(row);
  if (data.last_reminder_at && Date.now() - Date.parse(data.last_reminder_at) < REMINDER_GAP_MS) {
    const next = new Date(Date.parse(data.last_reminder_at) + REMINDER_GAP_MS);
    throw fail(429, `Already reminded on ${new Date(data.last_reminder_at).toLocaleDateString('en-US')}. Next reminder possible ${next.toLocaleDateString('en-US')}.`);
  }
  const profile = store.all('SeekerProfile').find((p) => p.created_by_id === row.id) || null;
  const progress = progressFor(row, profile);
  // Same rule as the list: verified seekers with a complete profile are done.
  const complete = row.role === 'job_seeker' && row.email_verified && profile && profileCompleteness(profile).complete;
  if (complete || !progress.next) throw fail(409, 'This profile is already complete');
  const { notify } = require('./notifications');
  const { layout, appUrl, mailConfigured } = require('./mailer');
  if (!mailConfigured()) throw fail(503, 'Email isn’t set up on the server, so reminders can’t be sent');
  const firstName = String(profile?.full_name || data.full_name || '').trim().split(/\s+/)[0];
  const remaining = progress.steps.filter((s) => !s.done && s.key !== 'verify').map((s) => s.label);
  const target = row.role === 'user' ? appUrl('/onboarding') : appUrl(`/dashboard?tab=${progress.next.tab || 'profile'}`);
  const status = await notify('profile_reminder', {
    to: row.email,
    subject: 'Finish your TalentBridge profile so employers can find you',
    ...layout({
      heading: 'You’re almost there',
      paragraphs: [
        `Hi ${firstName || 'there'},`,
        'Thanks for joining TalentBridge! Your profile isn’t visible to employers yet. A few minutes finishes it:',
        remaining.map((s) => `• ${s}`).join('\n'),
        'Tip: uploading your resume fills in most of your profile automatically.',
      ],
      button: { label: row.role === 'user' ? 'Finish signing up' : 'Finish my profile', url: target },
    }),
  }, { user_id: row.id });
  if (status !== 'sent') throw fail(502, 'The reminder couldn’t be sent. Check the email settings and try again.');
  data.last_reminder_at = new Date().toISOString();
  db.prepare('UPDATE users SET data = ? WHERE id = ?').run(JSON.stringify(data), row.id);
  return { sent: true, last_reminder_at: data.last_reminder_at };
}

function registerSignupRoutes(app) {
  const admin = (req, res, next) => (req.user?.role === 'admin' ? next() : res.status(403).json({ error: 'Admins only' }));
  const wrap = (fn) => async (req, res) => {
    try {
      res.json({ data: await fn(req) });
    } catch (e) {
      if (!e.status) console.error('[signups]', e);
      res.status(e.status || 500).json({ error: e.status ? e.message : 'Something went wrong' });
    }
  };
  app.get('/api/admin/incomplete-signups', authRequired, admin, wrap(() => incompleteSignups()));
  app.post('/api/admin/incomplete-signups/:id/remind', authRequired, admin, wrap((req) => sendReminder(req.params.id)));
}

module.exports = { registerSignupRoutes, incompleteSignups, progressFor };
