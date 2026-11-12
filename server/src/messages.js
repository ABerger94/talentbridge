'use strict';
// Application-scoped messaging. A conversation exists per job application and
// has exactly two participants: the applicant and the employer who owns the
// role. Admins can read (to review reports) but not send. There are no cold
// messages: you can only message someone you share an application with.
const crypto = require('crypto');
const { db } = require('./db');
const { authRequired, getUserById } = require('./auth');
const { store } = require('./entities');
const { hit } = require('./ratelimit');

const MAX_LENGTH = 2000;
const EMAIL_BATCH_MS = 20 * 60 * 1000; // at most one email per conversation per 20 min
const READ_ONLY_STATUSES = { withdrawn: 'The candidate withdrew this application.', rejected: 'This application was closed.' };

db.exec(`
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  body TEXT NOT NULL,
  created_date TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS messages_by_app ON messages (application_id, created_date);
CREATE TABLE IF NOT EXISTS conversation_state (
  application_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  last_read_at TEXT,
  last_emailed_at TEXT,
  blocked INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (application_id, user_id)
);
CREATE TABLE IF NOT EXISTS message_reports (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL,
  reporter_id TEXT NOT NULL,
  reason TEXT,
  created_date TEXT NOT NULL
);
`);

function fail(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

function state(appId, userId) {
  return db.prepare('SELECT * FROM conversation_state WHERE application_id = ? AND user_id = ?').get(appId, userId)
    || { application_id: appId, user_id: userId, last_read_at: null, last_emailed_at: null, blocked: 0 };
}

function saveState(s) {
  db.prepare(
    'INSERT OR REPLACE INTO conversation_state (application_id, user_id, last_read_at, last_emailed_at, blocked) VALUES (?, ?, ?, ?, ?)'
  ).run(s.application_id, s.user_id, s.last_read_at, s.last_emailed_at, s.blocked ? 1 : 0);
}

// Loads an application and works out the caller's place in it.
function conversation(user, appId) {
  const app = appId ? store.get('JobApplication', appId) : null;
  if (!app) throw fail(404, 'Conversation not found');
  const isApplicant = app.created_by_id === user.id;
  const isEmployer = app.employer_user_id === user.id;
  const isAdmin = user.role === 'admin';
  if (!isApplicant && !isEmployer && !isAdmin) throw fail(404, 'Conversation not found');
  const job = store.get('Job', app.job_id);
  const otherId = isApplicant ? app.employer_user_id : app.created_by_id;
  return { app, job, isApplicant, isEmployer, isAdmin, participant: isApplicant || isEmployer, otherId };
}

function displayName(userId, fallback) {
  const row = getUserById(userId);
  if (!row) return fallback;
  try {
    const name = String(JSON.parse(row.data || '{}').full_name || '').trim();
    return name || fallback;
  } catch {
    return fallback;
  }
}

// Labels for the two sides, as seen by the viewer.
function otherParty(c) {
  if (c.isApplicant) {
    return { name: c.job?.company || displayName(c.app.employer_user_id, 'The employer'), role: 'employer' };
  }
  return { name: String(c.app.applicant_name || '').trim() || displayName(c.app.created_by_id, 'Candidate'), role: 'candidate' };
}

function readOnlyReason(c) {
  if (!c.participant) return 'Admins can read conversations but not send messages.';
  if (READ_ONLY_STATUSES[c.app.status]) return READ_ONLY_STATUSES[c.app.status];
  const mine = state(c.app.id, c.isApplicant ? c.app.created_by_id : c.app.employer_user_id);
  const theirs = state(c.app.id, c.otherId);
  if (mine.blocked) return 'You blocked this conversation. Unblock it to send messages.';
  if (theirs.blocked) return 'This conversation is closed.';
  return null;
}

function unreadCount(appId, userId) {
  const s = state(appId, userId);
  return db.prepare(
    'SELECT COUNT(*) AS n FROM messages WHERE application_id = ? AND sender_id != ? AND created_date > ?'
  ).get(appId, userId, s.last_read_at || '').n;
}

// Applications the user takes part in (as applicant or employer).
function myApplications(user) {
  return store.all('JobApplication').filter((a) => a.created_by_id === user.id || a.employer_user_id === user.id);
}

async function emailRecipient(c, sender, message) {
  const { notify } = require('./notifications');
  const { layout, appUrl } = require('./mailer');
  const recipientId = c.otherId;
  const recipient = getUserById(recipientId);
  if (!recipient?.email) return;
  const s = state(c.app.id, recipientId);
  const now = Date.now();
  // Batch: skip if we emailed about this conversation recently and they
  // haven't read it since (they already know there's something waiting).
  if (s.last_emailed_at && now - Date.parse(s.last_emailed_at) < EMAIL_BATCH_MS
      && (!s.last_read_at || s.last_read_at < s.last_emailed_at)) {
    return;
  }
  const senderName = c.isApplicant
    ? (String(c.app.applicant_name || '').trim() || 'A candidate')
    : (c.job?.company || 'The employer');
  const jobTitle = c.job?.title || 'your application';
  const snippet = message.body.length > 300 ? `${message.body.slice(0, 300)}…` : message.body;
  await notify('new_message', {
    to: recipient.email,
    subject: `New message from ${senderName} about ${jobTitle}`,
    ...layout({
      heading: `New message from ${senderName}`,
      paragraphs: [
        `About: ${jobTitle}`,
        `“${snippet}”`,
        'Reply on TalentBridge. Replying to this email won’t reach them.',
      ],
      button: { label: 'Open conversation', url: appUrl(`/messages?c=${encodeURIComponent(c.app.id)}`) },
    }),
  }, { application_id: c.app.id, from_user_id: sender.id });
  s.last_emailed_at = new Date(now).toISOString();
  saveState(s);
}

function registerMessageRoutes(app) {
  const wrap = (fn) => async (req, res) => {
    try {
      res.json({ data: await fn(req) });
    } catch (e) {
      if (!e.status) console.error('[messages]', e);
      res.status(e.status || 500).json({ error: e.status ? e.message : 'Something went wrong' });
    }
  };

  // Inbox: conversations that have at least one message, newest first.
  app.get('/api/messages', authRequired, wrap((req) => {
    const out = [];
    for (const a of myApplications(req.user)) {
      const last = db.prepare('SELECT * FROM messages WHERE application_id = ? ORDER BY created_date DESC LIMIT 1').get(a.id);
      if (!last) continue;
      const c = conversation(req.user, a.id);
      out.push({
        application_id: a.id,
        job: c.job ? { id: c.job.id, title: c.job.title, company: c.job.company } : null,
        other: otherParty(c),
        last_message: { body: last.body.slice(0, 140), created_date: last.created_date, mine: last.sender_id === req.user.id },
        unread: unreadCount(a.id, req.user.id),
        read_only: !!readOnlyReason(c),
      });
    }
    out.sort((x, y) => (y.last_message.created_date > x.last_message.created_date ? 1 : -1));
    return out;
  }));

  app.get('/api/messages/unread-count', authRequired, wrap((req) => {
    let n = 0;
    for (const a of myApplications(req.user)) n += unreadCount(a.id, req.user.id);
    return { unread: n };
  }));

  // One conversation; opening it marks it read for the viewer.
  app.get('/api/messages/:appId', authRequired, wrap((req) => {
    const c = conversation(req.user, req.params.appId);
    const rows = db.prepare(
      'SELECT * FROM (SELECT * FROM messages WHERE application_id = ? ORDER BY created_date DESC LIMIT 300) ORDER BY created_date ASC'
    ).all(c.app.id);
    if (c.participant) {
      const s = state(c.app.id, req.user.id);
      s.last_read_at = new Date().toISOString();
      saveState(s);
    }
    const theirs = c.participant ? state(c.app.id, c.otherId) : null;
    return {
      application_id: c.app.id,
      job: c.job ? { id: c.job.id, title: c.job.title, company: c.job.company, status: c.job.status } : null,
      application_status: c.app.status,
      viewer_role: c.isApplicant ? 'candidate' : c.isEmployer ? 'employer' : 'admin',
      other: otherParty(c),
      read_only_reason: readOnlyReason(c),
      blocked_by_me: c.participant ? !!state(c.app.id, req.user.id).blocked : false,
      other_last_read_at: theirs?.last_read_at || null,
      messages: rows.map((m) => ({
        id: m.id,
        body: m.body,
        created_date: m.created_date,
        mine: m.sender_id === req.user.id,
        from: m.sender_id === c.app.created_by_id ? 'candidate' : 'employer',
      })),
    };
  }));

  app.post('/api/messages/:appId', authRequired, wrap(async (req) => {
    const c = conversation(req.user, req.params.appId);
    const reason = readOnlyReason(c);
    if (reason) throw fail(409, reason);
    const body = String(req.body?.body || '').replace(/\r\n/g, '\n').trim();
    if (!body) throw fail(400, 'Message can’t be empty');
    if (body.length > MAX_LENGTH) throw fail(400, `Messages can be up to ${MAX_LENGTH} characters`);
    for (const [key, max, windowMs, label] of [
      [`msg-burst:${req.user.id}`, 20, 10 * 60 * 1000, 'a few minutes'],
      [`msg-day:${req.user.id}`, 300, 24 * 60 * 60 * 1000, 'tomorrow'],
    ]) {
      if (!hit(key, max, windowMs).ok) throw fail(429, `You’re sending messages too quickly. Please try again in ${label}.`);
    }
    const message = { id: crypto.randomUUID(), application_id: c.app.id, sender_id: req.user.id, body, created_date: new Date().toISOString() };
    db.prepare('INSERT INTO messages (id, application_id, sender_id, body, created_date) VALUES (?, ?, ?, ?, ?)')
      .run(message.id, message.application_id, message.sender_id, message.body, message.created_date);
    // Sending counts as having read everything so far.
    const s = state(c.app.id, req.user.id);
    s.last_read_at = message.created_date;
    saveState(s);
    await emailRecipient(c, req.user, message);
    return { id: message.id, body: message.body, created_date: message.created_date, mine: true, from: c.isApplicant ? 'candidate' : 'employer' };
  }));

  app.post('/api/messages/:appId/block', authRequired, wrap((req) => {
    const c = conversation(req.user, req.params.appId);
    if (!c.participant) throw fail(403, 'Only participants can block a conversation');
    const s = state(c.app.id, req.user.id);
    s.blocked = req.body?.blocked === false ? 0 : 1;
    saveState(s);
    return { blocked: !!s.blocked };
  }));

  app.post('/api/messages/:appId/report', authRequired, wrap(async (req) => {
    const c = conversation(req.user, req.params.appId);
    if (!c.participant) throw fail(403, 'Only participants can report a conversation');
    if (!hit(`msg-report:${req.user.id}`, 10, 24 * 60 * 60 * 1000).ok) throw fail(429, 'Too many reports today');
    const reason = String(req.body?.reason || '').trim().slice(0, 1000);
    db.prepare('INSERT INTO message_reports (id, application_id, reporter_id, reason, created_date) VALUES (?, ?, ?, ?, ?)')
      .run(crypto.randomUUID(), c.app.id, req.user.id, reason || null, new Date().toISOString());
    // Let the site owner know (admins listed in TB_ADMIN_EMAILS).
    const admins = (process.env.TB_ADMIN_EMAILS || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (admins.length) {
      const { notify } = require('./notifications');
      const { layout, appUrl } = require('./mailer');
      for (const to of admins) {
        await notify('message_report', {
          to,
          subject: `Conversation reported: ${c.job?.title || 'application'}`,
          ...layout({
            heading: 'A conversation was reported',
            paragraphs: [`Reported by the ${c.isApplicant ? 'candidate' : 'employer'}.`, reason ? `Reason: ${reason}` : 'No reason given.'],
            button: { label: 'Review conversation', url: appUrl(`/messages?c=${encodeURIComponent(c.app.id)}`) },
          }),
        }, { application_id: c.app.id, reporter_id: req.user.id });
      }
    }
    return { reported: true };
  }));
}

module.exports = { registerMessageRoutes };
