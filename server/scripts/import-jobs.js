#!/usr/bin/env node
'use strict';
// Imports real job listings from every enabled source, with no time limit:
// good for the first fill of a database. The daily cron keeps it fresh after.
//
//   TURSO_DATABASE_URL=libsql://... TURSO_AUTH_TOKEN=... npm run import-jobs
//   npm run import-jobs -- --only greenhouse     (one source type)
//
// Keyed sources (USAJOBS, Adzuna, Jooble) run only when their keys are set
// in the environment, as on Vercel.
const path = require('path');
process.chdir(path.join(__dirname, '..'));
const { runImports, listSources } = require('../src/imports');

(async () => {
  const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null;
  const ids = listSources().filter((s) => s.enabled && (!only || s.kind === only)).map((s) => s.id);
  const report = await runImports({ force: true, sourceIds: ids, budgetMs: 60 * 60 * 1000, concurrency: 4 });
  console.log(`Sources run: ${report.ran}/${report.due} · jobs added: ${report.added} · closed: ${report.closed}`);
  for (const e of report.errors) console.log(`  ! ${e}`);
  const { counts } = require('../src/jobindex');
  console.log('Active jobs now:', counts());
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
