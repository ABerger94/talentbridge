'use strict';
// Announcement emails to all users (or job seekers / employers): service
// updates such as changes to the Terms or Privacy Policy, important feature
// changes, or outages. Not marketing: the Privacy Policy says we don't send
// marketing email, and every announcement says why it was received.
//
// Flow: draft -> preview / test to yourself -> send. Sending snapshots the
// recipient list (the caller must confirm its exact size), then emails in
// small batches, from the admin page while it's open and from a daily cron,
// so it fits Vercel's time limit and the email provider's sending limits.
// If the provider says a limit was reached, sending pauses and resumes later.
//
// Admins use it from Admin -> Announcements; AI agents through API keys with
// the announcement_drafts (write, preview, test) or announcements (send)
// permission.
const crypto = require('crypto');
const { db } = require('./db');
const { authRequired, publicUser, getUserById } = require('./auth');

db.exec(`
CREATE TABLE IF NOT EXISTS announcements (
  id TEXT PRIMARY KEY,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  button_label TEXT,
  button_url TEXT,
  audience TEXT NOT NULL,
  verified_only INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL,
  note TEXT,
  created_by TEXT,
  created_by_label TEXT,
  created_date TEXT NOT NULL,
  updated_date TEXT NOT NULL,
  sent_by_label TEXT,
  sent_date TEXT,
  finished_date TEXT
);
CREATE TABLE IF NOT EXISTS announcement_recipients (
  announcement_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  email TEXT NOT NULL,
  name TEXT,
  status TEXT NOT NULL,
  claim TEXT,
  claimed_at TEXT,
  error TEXT,
  sent_date TEXT,
  PRIMARY KEY (announcement_id, user_id)
);
CREATE INDEX IF NOT EXISTS announcement_recipients_status ON announcement_recipients (announcement_id, status);
`);

const AUDIENCES = { all: 'Everyone', job_seeker: 'Job seekers', employer: 'Employers' };
const BATCH = 25;
const LIMIT_ERROR = /\b429\b|rate.?limit|too many|quota|daily limit|limit (reached|exceeded)|exceeded/i;
const FOOTER = 'You’re receiving this service announcement because you have a TalentBridge account. We don’t send marketing email.';

const fail = (status, message, extra) => Object.assign(new Error(message), { status, ...extra });
const now = () => new Date().toISOString();
const actorLabel = (user) => (user?.api_key ? user.email : user?.email) || 'admin';

// --- Content -----------------------------------------------------------------

function clean(body = {}, existing = {}) {
  const pick = (k, d) => (k in body ? body[k] : existing[k] ?? d);
  const subject = String(pick('subject', '') || '').trim().replace(/\s+/g, ' ');
  const text = String(pick('body', '') || '').replace(/\r\n/g, '\n').trim();
  const audience = String(pick('audience', 'all'));
  const verified = pick('verified_only', 1);
  const label = String(pick('button_label', '') || '').trim();
  let url = String(pick('button_url', '') || '').trim();
  if (subject.length < 3 || subject.length > 150) throw fail(400, 'The subject must be 3 to 150 characters.');
  if (!text || text.length > 10000) throw fail(400, 'Write a message (up to 10,000 characters).');
  if (!AUDIENCES[audience]) throw fail(400, `audience must be one of: ${Object.keys(AUDIENCES).join(', ')}`);
  if (label || url) {
    if (!label || label.length > 40) throw fail(400, 'A button needs a short label (up to 40 characters) and a link.');
    if (url.startsWith('/')) url = require('./mailer').appUrl(url);
    if (!/^https:\/\/[^\s"<>]+$/i.test(url)) throw fail(400, 'The button link must start with https:// or / (a page on TalentBridge).');
  }
  return { subject, body: text, audience, verified_only: verified === false || verified === 0 || verified === '0' ? 0 : 1, button_label: label || null, button_url: label ? url : null };
}

function render(a, recipient) {
  const { layout } = require('./mailer');
  const first = String(recipient?.name || '').trim().split(/\s+/)[0];
  const paragraphs = [first ? `Hi ${first},` : 'Hi there,', ...a.body.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)];
  const { html, text } = layout({
    heading: a.subject,
    paragraphs,
    button: a.button_label ? { label: a.button_label, url: a.button_url } : null,
    linkify: true,
    footer: FOOTER,
  });
  return { subject: a.subject, html, text: `${text}\n\n${FOOTER}` };
}

// --- Audience -----------------------------------------------------------------

function audienceUsers(audience, verifiedOnly) {
  return db.prepare('SELECT * FROM users').all().map(publicUser)
    .filter((u) => u.email && (!verifiedOnly || u.email_verified) && (audience === 'all' || u.role === audience))
    .map((u) => ({ id: u.id, email: u.email, name: u.full_name || '' }));
}

function audienceCounts() {
  const out = {};
  for (const a of Object.keys(AUDIENCES)) {
    out[a] = { label: AUDIENCES[a], verified: audienceUsers(a, true).length, all: audienceUsers(a, false).length };
  }
  return out;
}

// --- Records ------------------------------------------------------------------

const get = (id) => db.prepare('SELECT * FROM announcements WHERE id = ?').get(id);

function stats(id) {
  const rows = db.prepare('SELECT status, COUNT(*) AS n FROM announcement_recipients WHERE announcement_id = ? GROUP BY status').all(id);
  const by = Object.fromEntries(rows.map((r) => [r.status, r.n]));
  const total = rows.reduce((s, r) => s + r.n, 0);
  return { total, sent: by.sent || 0, failed: by.failed || 0, pending: (by.pending || 0) + (by.sending || 0), cancelled: by.cancelled || 0 };
}

function present(a, { withFailures = false } = {}) {
  if (!a) return null;
  const out = {
    id: a.id, subject: a.subject, body: a.body, button_label: a.button_label, button_url: a.button_url,
    audience: a.audience, audience_label: AUDIENCES[a.audience], verified_only: !!a.verified_only,
    status: a.status, note: a.note, created_by: a.created_by_label, created_date: a.created_date, updated_date: a.updated_date,
    sent_by: a.sent_by_label, sent_date: a.sent_date, finished_date: a.finished_date,
    ...(a.status === 'draft' ? { recipients_now: audienceUsers(a.audience, !!a.verified_only).length } : { progress: stats(a.id) }),
  };
  if (withFailures && a.status !== 'draft') {
    out.failures = db.prepare("SELECT email, error FROM announcement_recipients WHERE announcement_id = ? AND status = 'failed' LIMIT 100").all(a.id);
  }
  return out;
}

function list() {
  return db.prepare('SELECT * FROM announcements ORDER BY created_date DESC LIMIT 50').all().map((a) => present(a));
}

function createDraft(user, body) {
  const c = clean(body);
  const a = { id: crypto.randomUUID(), ...c, status: 'draft', created_by: user.id, created_by_label: actorLabel(user), created_date: now(), updated_date: now() };
  db.prepare(`INSERT INTO announcements (id, subject, body, button_label, button_url, audience, verified_only, status, created_by, created_by_label, created_date, updated_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(a.id, a.subject, a.body, a.button_label, a.button_url, a.audience, a.verified_only, a.status, a.created_by, a.created_by_label, a.created_date, a.updated_date);
  require('./audit').audit(user, 'announcement.drafted', { type: 'announcement', id: a.id }, { subject: a.subject, audience: a.audience });
  return present(get(a.id));
}

function draftOrFail(id) {
  const a = get(id);
  if (!a) throw fail(404, 'Announcement not found');
  if (a.status !== 'draft') throw fail(409, 'This announcement was already sent. Make a new draft instead.');
  return a;
}

function updateDraft(user, id, body) {
  const a = draftOrFail(id);
  const c = clean(body, a);
  db.prepare('UPDATE announcements SET subject = ?, body = ?, button_label = ?, button_url = ?, audience = ?, verified_only = ?, updated_date = ? WHERE id = ?')
    .run(c.subject, c.body, c.button_label, c.button_url, c.audience, c.verified_only, now(), id);
  return present(get(id));
}

function deleteDraft(user, id) {
  const a = draftOrFail(id);
  db.prepare('DELETE FROM announcements WHERE id = ?').run(id);
  require('./audit').audit(user, 'announcement.deleted', { type: 'announcement', id }, { subject: a.subject });
  return { deleted: true };
}

function mailReady() {
  if (!require('./mailer').mailConfigured()) throw fail(400, 'Email isn’t set up on this server yet, so nothing can be sent. Add an email provider (see Admin → System).');
}

// A test copy to the person asking (for an API key: the admin who created it).
async function sendTest(user, id) {
  mailReady();
  const a = get(id);
  if (!a) throw fail(404, 'Announcement not found');
  const ownerId = user.api_key ? db.prepare('SELECT created_by FROM api_keys WHERE id = ?').get(user.id.replace(/^apikey:/, ''))?.created_by : user.id;
  const owner = ownerId ? publicUser(getUserById(ownerId)) : null;
  if (!owner?.email) throw fail(400, 'No email address to send the test to.');
  const mail = render({ ...a, subject: `[Test] ${a.subject}` }, { name: owner.full_name });
  const status = await require('./notifications').notify('announcement_test', { to: owner.email, ...mail }, { announcement_id: id });
  if (status !== 'sent') throw fail(502, 'The test email couldn’t be sent. Check Admin → System → email.');
  return { sent_to: owner.email };
}

function startSend(user, id, body) {
  mailReady();
  const a = draftOrFail(id);
  const people = audienceUsers(a.audience, !!a.verified_only);
  if (!people.length) throw fail(400, 'Nobody matches this audience.');
  const confirm = parseInt(body?.confirm_count, 10);
  if (confirm !== people.length) {
    throw fail(409, `This will email ${people.length} people. Send again with confirm_count: ${people.length} to confirm.`, { recipients: people.length });
  }
  const ins = db.prepare("INSERT OR IGNORE INTO announcement_recipients (announcement_id, user_id, email, name, status) VALUES (?, ?, ?, ?, 'pending')");
  for (const p of people) ins.run(id, p.id, p.email, p.name);
  db.prepare("UPDATE announcements SET status = 'sending', note = NULL, sent_by_label = ?, sent_date = ?, updated_date = ? WHERE id = ?").run(actorLabel(user), now(), now(), id);
  require('./audit').audit(user, 'announcement.sent', { type: 'announcement', id }, { subject: a.subject, audience: a.audience, recipients: people.length });
  return present(get(id));
}

// Sends the next batch of one announcement (or all that are sending).
// Recipients are claimed before sending, so two runs never email the same
// person; claims left by a crashed run are released after 10 minutes.
async function processBatch({ id = null, budgetMs = 40000, max = BATCH } = {}) {
  const started = Date.now();
  db.prepare("UPDATE announcement_recipients SET status = 'pending', claim = NULL WHERE status = 'sending' AND claimed_at < ?").run(new Date(Date.now() - 10 * 60000).toISOString());
  const targets = id ? [get(id)].filter((a) => a && a.status === 'sending') : db.prepare("SELECT * FROM announcements WHERE status = 'sending' ORDER BY sent_date").all();
  const { notify } = require('./notifications');
  let sent = 0;
  for (const a of targets) {
    while (sent < max && Date.now() - started < budgetMs) {
      const claim = crypto.randomUUID();
      const take = Math.min(5, max - sent);
      db.prepare(`UPDATE announcement_recipients SET status = 'sending', claim = ?, claimed_at = ? WHERE announcement_id = ? AND status = 'pending'
        AND user_id IN (SELECT user_id FROM announcement_recipients WHERE announcement_id = ? AND status = 'pending' LIMIT ?)`).run(claim, now(), a.id, a.id, take);
      const batch = db.prepare('SELECT * FROM announcement_recipients WHERE claim = ?').all(claim);
      if (!batch.length) break;
      let paused = false;
      for (const r of batch) {
        if (paused) {
          db.prepare("UPDATE announcement_recipients SET status = 'pending', claim = NULL WHERE announcement_id = ? AND user_id = ?").run(a.id, r.user_id);
          continue;
        }
        const status = await notify('announcement', { to: r.email, ...render(a, r) }, { announcement_id: a.id });
        if (status === 'sent') {
          db.prepare("UPDATE announcement_recipients SET status = 'sent', sent_date = ?, claim = NULL, error = NULL WHERE announcement_id = ? AND user_id = ?").run(now(), a.id, r.user_id);
          sent += 1;
        } else {
          const error = db.prepare("SELECT error FROM notifications WHERE kind = 'announcement' AND recipient = ? ORDER BY created_date DESC LIMIT 1").get(r.email)?.error || status;
          if (LIMIT_ERROR.test(error)) {
            // The provider's sending limit: put it back and pause until later.
            db.prepare("UPDATE announcement_recipients SET status = 'pending', claim = NULL WHERE announcement_id = ? AND user_id = ?").run(a.id, r.user_id);
            db.prepare("UPDATE announcements SET status = 'paused', note = ?, updated_date = ? WHERE id = ?")
              .run('Paused: the email provider’s sending limit was reached. It resumes automatically later (or click Continue).', now(), a.id);
            paused = true;
          } else {
            db.prepare("UPDATE announcement_recipients SET status = 'failed', error = ?, claim = NULL WHERE announcement_id = ? AND user_id = ?").run(String(error).slice(0, 300), a.id, r.user_id);
          }
        }
      }
      if (paused) break;
    }
    const s = stats(a.id);
    if (!s.pending && get(a.id).status === 'sending') {
      db.prepare("UPDATE announcements SET status = 'done', finished_date = ?, updated_date = ? WHERE id = ?").run(now(), now(), a.id);
    }
    // The provider's limit applies to every announcement: stop for now.
    if (get(a.id).status === 'paused') break;
  }
  return id ? present(get(id)) : { sent };
}

function resume(id) {
  const a = get(id);
  if (!a) throw fail(404, 'Announcement not found');
  if (a.status === 'paused') db.prepare("UPDATE announcements SET status = 'sending', note = NULL WHERE id = ?").run(id);
}

function retryFailed(user, id) {
  const a = get(id);
  if (!a || a.status === 'draft') throw fail(404, 'Announcement not found');
  mailReady();
  const n = db.prepare("UPDATE announcement_recipients SET status = 'pending', error = NULL WHERE announcement_id = ? AND status = 'failed'").run(id).changes;
  if (n) db.prepare("UPDATE announcements SET status = 'sending', note = NULL, finished_date = NULL WHERE id = ?").run(id);
  require('./audit').audit(user, 'announcement.retried', { type: 'announcement', id }, { retried: n });
  return present(get(id));
}

function cancel(user, id) {
  const a = get(id);
  if (!a || a.status === 'draft') throw fail(404, 'Announcement not found');
  const n = db.prepare("UPDATE announcement_recipients SET status = 'cancelled', claim = NULL WHERE announcement_id = ? AND status IN ('pending', 'sending')").run(id).changes;
  db.prepare("UPDATE announcements SET status = 'cancelled', note = ?, finished_date = ?, updated_date = ? WHERE id = ?").run(`Cancelled; ${n} not sent.`, now(), now(), id);
  require('./audit').audit(user, 'announcement.cancelled', { type: 'announcement', id }, { not_sent: n });
  return present(get(id));
}

// --- Routes ---------------------------------------------------------------------

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admins only' });
  next();
}

function wrap(fn) {
  return async (req, res) => {
    try {
      res.json({ data: await fn(req) });
    } catch (e) {
      if (!e.status || e.status >= 500) require('./monitor').captureServerError(e, req);
      res.status(e.status || 500).json({ error: e.message, ...(e.recipients != null ? { recipients: e.recipients } : {}) });
    }
  };
}

function registerAnnouncementRoutes(app) {
  const A = [authRequired, requireAdmin];
  app.get('/api/admin/announcements', ...A, wrap(() => ({
    announcements: list(),
    audiences: audienceCounts(),
    mail_configured: require('./mailer').mailConfigured(),
  })));
  app.post('/api/admin/announcements/preview', ...A, wrap((req) => {
    const c = clean(req.body || {});
    return { ...render(c, { name: req.user.api_key ? '' : req.user.full_name }), recipients: audienceUsers(c.audience, !!c.verified_only).length };
  }));
  app.post('/api/admin/announcements', ...A, wrap((req) => createDraft(req.user, req.body || {})));
  app.get('/api/admin/announcements/:id', ...A, wrap((req) => {
    const a = present(get(req.params.id), { withFailures: true });
    if (!a) throw fail(404, 'Announcement not found');
    return { ...a, preview: render(get(req.params.id), { name: '' }) };
  }));
  app.put('/api/admin/announcements/:id', ...A, wrap((req) => updateDraft(req.user, req.params.id, req.body || {})));
  app.delete('/api/admin/announcements/:id', ...A, wrap((req) => deleteDraft(req.user, req.params.id)));
  app.post('/api/admin/announcements/:id/test', ...A, wrap((req) => sendTest(req.user, req.params.id)));
  app.post('/api/admin/announcements/:id/send', ...A, wrap(async (req) => {
    startSend(req.user, req.params.id, req.body || {});
    return processBatch({ id: req.params.id, budgetMs: 25000, max: Infinity });
  }));
  app.post('/api/admin/announcements/:id/process', ...A, wrap(async (req) => {
    resume(req.params.id);
    return processBatch({ id: req.params.id, budgetMs: 40000, max: Infinity });
  }));
  app.post('/api/admin/announcements/:id/retry', ...A, wrap(async (req) => {
    retryFailed(req.user, req.params.id);
    return processBatch({ id: req.params.id, budgetMs: 25000, max: Infinity });
  }));
  app.post('/api/admin/announcements/:id/cancel', ...A, wrap((req) => cancel(req.user, req.params.id)));

  // Finishes or resumes sending without anyone on the admin page.
  app.get('/api/cron/announcements', wrap(async (req) => {
    const secret = process.env.CRON_SECRET;
    if (!secret) throw fail(503, 'Set CRON_SECRET to enable scheduled sending');
    const given = Buffer.from(String(req.headers.authorization || ''));
    const expected = Buffer.from(`Bearer ${secret}`);
    if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) throw fail(401, 'Unauthorized');
    db.prepare("UPDATE announcements SET status = 'sending', note = NULL WHERE status = 'paused'").run();
    return processBatch({ budgetMs: 45000, max: Infinity });
  }));
}

module.exports = { registerAnnouncementRoutes, processBatch, render, audienceUsers, AUDIENCES };
