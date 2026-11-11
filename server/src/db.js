'use strict';
// SQLite via the libsql driver. Locally (ASUS, this VM) it opens a file;
// when TURSO_DATABASE_URL is set (Vercel) it connects to the hosted Turso
// database instead. The sync prepare/run/get/all call shapes are the same
// in both modes, so no other module changes.
const Database = require('libsql');
const fs = require('fs');
const path = require('path');

// On Vercel (no Turso env yet) the bundle filesystem is read-only — fall
// back to /tmp so the API still boots (ephemeral DB) instead of crashing.
const DATA_DIR = process.env.TB_DATA_DIR
  || (process.env.VERCEL ? '/tmp/talentbridge-data' : path.join(__dirname, '..', 'data'));

let db;
if (process.env.TURSO_DATABASE_URL) {
  db = new Database(process.env.TURSO_DATABASE_URL, {
    authToken: process.env.TURSO_AUTH_TOKEN || '',
  });
} else {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(path.join(DATA_DIR, 'uploads'), { recursive: true });
  db = new Database(path.join(DATA_DIR, 'talentbridge.sqlite'));
  db.exec('PRAGMA journal_mode = WAL;');
}

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  google_id TEXT,
  role TEXT NOT NULL DEFAULT 'user',
  email_verified INTEGER NOT NULL DEFAULT 0,
  data TEXT NOT NULL DEFAULT '{}',
  created_date TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS records (
  entity TEXT NOT NULL,
  id TEXT NOT NULL,
  created_by_id TEXT,
  created_date TEXT NOT NULL,
  updated_date TEXT NOT NULL,
  data TEXT NOT NULL DEFAULT '{}',
  PRIMARY KEY (entity, id)
);
CREATE TABLE IF NOT EXISTS otps (
  email TEXT NOT NULL,
  purpose TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  PRIMARY KEY (email, purpose)
);
CREATE TABLE IF NOT EXISTS files (
  name TEXT PRIMARY KEY,
  content_type TEXT,
  original_name TEXT,
  size INTEGER,
  data BLOB NOT NULL,
  created_by_id TEXT,
  created_date TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS match_cache (
  job_id TEXT PRIMARY KEY,
  fingerprint TEXT NOT NULL,
  result TEXT NOT NULL,
  created_date TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  payload TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued_no_mailer',
  created_date TEXT NOT NULL
);
`);

// Columns added after the first release; ALTER fails harmlessly once present.
for (const col of ['recipient TEXT', 'error TEXT', 'sent_date TEXT']) {
  try { db.exec(`ALTER TABLE notifications ADD COLUMN ${col}`); } catch { /* already exists */ }
}

module.exports = { db, DATA_DIR };
