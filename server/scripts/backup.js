#!/usr/bin/env node
'use strict';
// Copies the whole TalentBridge database (every table, uploaded files
// included) into a standalone SQLite file you keep somewhere safe.
//
//   TURSO_DATABASE_URL=libsql://... TURSO_AUTH_TOKEN=... node server/scripts/backup.js [out.sqlite]
//
// Without TURSO_DATABASE_URL it backs up the local database (server/data).
// Restore: `turso db create talentbridge-restored --from-file out.sqlite`,
// then point TURSO_DATABASE_URL/TURSO_AUTH_TOKEN at the new database.
// Check a backup without restoring: `node server/scripts/backup.js --verify out.sqlite`.
const fs = require('fs');
const path = require('path');
const Database = require('libsql');

function openSource() {
  if (process.env.TURSO_DATABASE_URL) {
    return new Database(process.env.TURSO_DATABASE_URL, { authToken: process.env.TURSO_AUTH_TOKEN || '' });
  }
  const dir = process.env.TB_DATA_DIR || path.join(__dirname, '..', 'data');
  return new Database(path.join(dir, 'talentbridge.sqlite'), { readonly: true });
}

function tables(db) {
  return db.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_litestream%'").all();
}

function verify(file) {
  const db = new Database(file, { readonly: true });
  const ok = db.prepare('PRAGMA integrity_check').get();
  console.log(`Integrity: ${Object.values(ok)[0]}`);
  for (const t of tables(db)) {
    console.log(`  ${t.name}: ${db.prepare(`SELECT COUNT(*) AS n FROM "${t.name}"`).get().n} rows`);
  }
}

function backup(out) {
  if (fs.existsSync(out)) throw new Error(`${out} already exists; choose another file name`);
  const src = openSource();
  const dst = new Database(out);
  let total = 0;
  for (const t of tables(src)) {
    dst.exec(t.sql);
    const rows = src.prepare(`SELECT * FROM "${t.name}"`).all();
    if (!rows.length) continue;
    const cols = Object.keys(rows[0]);
    const insert = dst.prepare(`INSERT INTO "${t.name}" (${cols.map((c) => `"${c}"`).join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`);
    dst.exec('BEGIN');
    for (const r of rows) insert.run(...cols.map((c) => r[c]));
    dst.exec('COMMIT');
    total += rows.length;
    console.log(`  ${t.name}: ${rows.length} rows`);
  }
  for (const idx of src.prepare("SELECT sql FROM sqlite_master WHERE type = 'index' AND sql IS NOT NULL").all()) {
    try { dst.exec(idx.sql); } catch { /* index on a table we skipped */ }
  }
  dst.close();
  console.log(`Backed up ${total} rows to ${out}`);
}

const args = process.argv.slice(2);
if (args[0] === '--verify') {
  verify(args[1]);
} else {
  backup(args[0] || `talentbridge-backup-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.sqlite`);
}
