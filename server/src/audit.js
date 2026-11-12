'use strict';
// Audit trail of sensitive actions (admin decisions, reminders, account
// changes and deletions): who did what to which record, and when. Shown to
// admins on the System tab. Never throws — an audit failure must not undo
// the action it records.
const crypto = require('crypto');
const { db } = require('./db');

db.exec(`
CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  actor_id TEXT,
  actor_email TEXT,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  detail TEXT,
  created_date TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS audit_log_created ON audit_log (created_date);
`);

// Details stay valid JSON: oversized ones are replaced, never cut mid-way.
function capped(detail) {
  const json = JSON.stringify(detail);
  return json.length <= 8000 ? json : JSON.stringify({ truncated: true, size: json.length });
}

function audit(actor, action, target = {}, detail = null) {
  try {
    db.prepare(
      'INSERT INTO audit_log (id, actor_id, actor_email, action, target_type, target_id, detail, created_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(
      crypto.randomUUID(),
      actor?.id || null,
      actor?.email || null,
      action,
      target.type || null,
      target.id || null,
      detail == null ? null : capped(detail),
      new Date().toISOString()
    );
  } catch (e) {
    console.error('[audit] could not record', action, e.message);
  }
}

function recentAudit(limit = 200) {
  return db.prepare('SELECT * FROM audit_log ORDER BY created_date DESC LIMIT ?').all(limit).map((r) => ({
    ...r,
    detail: r.detail ? JSON.parse(r.detail) : null,
  }));
}

module.exports = { audit, recentAudit };
