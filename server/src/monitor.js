'use strict';
// Error monitoring without a third-party service: server errors and browser
// errors are grouped by signature in the error_events table, shown on the
// admin System tab, and a new (or returning) problem emails the admins —
// at most once per signature every ALERT_GAP_MS.
const crypto = require('crypto');
const { db } = require('./db');

const ALERT_GAP_MS = 6 * 60 * 60 * 1000;
const MAX_ROWS = 500;

db.exec(`
CREATE TABLE IF NOT EXISTS error_events (
  signature TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  message TEXT NOT NULL,
  stack TEXT,
  path TEXT,
  user_id TEXT,
  count INTEGER NOT NULL DEFAULT 1,
  first_seen TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  alerted_at TEXT,
  resolved INTEGER NOT NULL DEFAULT 0
);
`);

const clip = (v, n) => String(v ?? '').slice(0, n);

// Same problem = same source, message (numbers/ids blurred) and first stack frame.
function signatureOf(source, message, stack) {
  const frame = String(stack || '').split('\n').find((l) => /\bat\b|@/.test(l)) || '';
  const norm = String(message || '').replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, '<id>').replace(/\d+/g, 'N');
  return crypto.createHash('sha256').update(`${source}|${norm}|${frame.trim().replace(/:\d+:\d+/g, '')}`).digest('hex').slice(0, 24);
}

function record(source, { message, stack, path, userId }) {
  try {
    const now = new Date().toISOString();
    const sig = signatureOf(source, message, stack);
    const existing = db.prepare('SELECT * FROM error_events WHERE signature = ?').get(sig);
    if (existing) {
      db.prepare('UPDATE error_events SET count = count + 1, last_seen = ?, resolved = 0, path = ?, stack = ? WHERE signature = ?')
        .run(now, clip(path, 300), clip(stack, 4000), sig);
    } else {
      db.prepare(`INSERT INTO error_events (signature, source, message, stack, path, user_id, first_seen, last_seen)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(sig, source, clip(message, 500), clip(stack, 4000), clip(path, 300), userId || null, now, now);
      const n = db.prepare('SELECT COUNT(*) AS n FROM error_events').get().n;
      if (n > MAX_ROWS) {
        db.prepare('DELETE FROM error_events WHERE signature IN (SELECT signature FROM error_events ORDER BY last_seen ASC LIMIT ?)').run(n - MAX_ROWS);
      }
    }
    const row = db.prepare('SELECT * FROM error_events WHERE signature = ?').get(sig);
    if (!row.alerted_at || Date.now() - Date.parse(row.alerted_at) > ALERT_GAP_MS) {
      db.prepare('UPDATE error_events SET alerted_at = ? WHERE signature = ?').run(now, sig);
      alertAdmins(row).catch(() => {});
    }
    return sig;
  } catch (e) {
    console.error('[monitor] could not record error', e.message);
    return null;
  }
}

async function alertAdmins(row) {
  if (process.env.TB_ERROR_ALERTS === 'false') return;
  const { mailConfigured, sendMail, layout, appUrl } = require('./mailer');
  if (!mailConfigured()) return;
  const { adminEmails } = require('./employers');
  const to = adminEmails();
  if (!to.length) return;
  const mail = layout({
    heading: row.count > 1 ? 'An error is happening again' : 'New error on TalentBridge',
    paragraphs: [
      `${row.source === 'client' ? 'In a visitor’s browser' : 'On the server'}${row.path ? ` (${row.path})` : ''}:`,
      row.message,
      `Seen ${row.count} time${row.count === 1 ? '' : 's'} since ${new Date(row.first_seen).toUTCString()}.`,
    ],
    button: { label: 'Open the System tab', url: appUrl('/admin?tab=system') },
  });
  for (const addr of to) await sendMail({ to: addr, subject: `[TalentBridge] ${clip(row.message, 80)}`, ...mail });
}

function captureServerError(err, req) {
  return record('server', {
    message: err?.message || String(err),
    stack: err?.stack,
    path: req ? `${req.method} ${req.path}` : null,
    userId: req?.user?.id,
  });
}

function recentErrors({ includeResolved = false } = {}) {
  return db.prepare(`SELECT * FROM error_events ${includeResolved ? '' : 'WHERE resolved = 0'} ORDER BY last_seen DESC LIMIT 100`).all();
}

function resolveError(signature) {
  db.prepare('UPDATE error_events SET resolved = 1 WHERE signature = ?').run(signature);
}

module.exports = { record, captureServerError, recentErrors, resolveError, signatureOf };
