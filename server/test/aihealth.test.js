'use strict';
// AI key check (POST /api/admin/ai/health): every provider x key x model gets
// one tiny request, and each failure is labeled. A local fake AI server
// stands in for the providers.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

process.env.TB_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-test-'));
process.env.TB_JWT_SECRET = 'k'.repeat(48);
delete process.env.TURSO_DATABASE_URL;
for (const k of Object.keys(process.env)) if (/_API_KEYS?$/.test(k)) delete process.env[k];

const fake = http.createServer((req, res) => {
  let b = '';
  req.on('data', (c) => (b += c));
  req.on('end', () => {
    const key = (req.headers.authorization || '').split(' ')[1];
    const { model } = JSON.parse(b);
    const send = (code, obj) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
    if (model === 'gone-model') return send(404, { error: 'model not found' });
    if (key === 'bad-key-1234') return send(401, { error: 'invalid api key' });
    if (key === 'busy-key-5678') return send(429, { error: 'rate limit' });
    if (key === 'zero-key-9999') { res.setHeader('x-ratelimit-limit-req-minute', '0'); return send(429, { error: 'rate limit' }); }
    if (key === 'hot-key-0000') return send(503, { error: 'high demand' });
    send(200, { choices: [{ message: { content: '{"ok": true}' }, finish_reason: 'stop' }] });
  });
});

let app; let db; let signToken; let base; let server;
test.before(async () => {
  await new Promise((r) => fake.listen(0, r));
  process.env.TB_CUSTOM_LLM_URL = `http://127.0.0.1:${fake.address().port}/v1/chat/completions`;
  process.env.TB_CUSTOM_LLM_API_KEYS = 'good-key-abcd,bad-key-1234,busy-key-5678';
  process.env.TB_CUSTOM_LLM_MODELS = 'live-model,gone-model';
  app = require('../src/index.js');
  ({ db } = require('../src/db.js'));
  ({ signToken } = require('../src/auth.js'));
  db.prepare("INSERT INTO users (id, email, role, email_verified, created_date, data) VALUES ('boss', 'boss@example.test', 'admin', 1, datetime('now'), '{}')").run();
  db.prepare("INSERT INTO users (id, email, role, email_verified, created_date, data) VALUES ('seek', 'seek@example.test', 'job_seeker', 1, datetime('now'), '{}')").run();
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => { server.close(); fake.close(); });

const post = (id, p) => fetch(base + p, {
  method: 'POST',
  headers: { authorization: `Bearer ${signToken(db.prepare('SELECT * FROM users WHERE id = ?').get(id))}` },
});

test('tests every key and model and labels each failure, without exposing keys', async () => {
  const r = await post('boss', '/api/admin/ai/health');
  assert.equal(r.status, 200);
  const { data } = await r.json();
  assert.equal(data.total, 6);
  assert.equal(data.working, 1);
  assert.equal(data.rate_limited, 1);
  assert.equal(data.broken, 4);
  const by = Object.fromEntries(data.results.map((x) => [`${x.key}/${x.model}`, x.status]));
  assert.deepEqual(by, {
    '1/live-model': 'ok', '2/live-model': 'key_rejected', '3/live-model': 'rate_limited',
    '1/gone-model': 'model_missing', '2/gone-model': 'model_missing', '3/gone-model': 'model_missing',
  });
  assert.equal(data.results[0].key_hint, '…abcd');
  assert.ok(!JSON.stringify(data).includes('good-key'), 'full keys never leave the server');
});

test('a limit of 0 is reported as no quota, and a 503 as overloaded', async () => {
  const before = process.env.TB_CUSTOM_LLM_API_KEYS;
  process.env.TB_CUSTOM_LLM_API_KEYS = 'zero-key-9999,hot-key-0000';
  process.env.TB_CUSTOM_LLM_MODELS = 'live-model';
  try {
    const out = await require('../src/llm.js').checkProviders();
    assert.deepEqual(out.results.map((r) => r.status), ['no_quota', 'overloaded']);
    assert.equal(out.broken, 1);
  } finally {
    process.env.TB_CUSTOM_LLM_API_KEYS = before;
    process.env.TB_CUSTOM_LLM_MODELS = 'live-model,gone-model';
  }
});

test('only admins can run it, and the last result shows on the System tab', async () => {
  assert.equal((await post('seek', '/api/admin/ai/health')).status, 403);
  const r = await fetch(base + '/api/admin/system', {
    headers: { authorization: `Bearer ${signToken(db.prepare('SELECT * FROM users WHERE id = ?').get('boss'))}` },
  });
  const { data } = await r.json();
  assert.equal(data.ai_health.working, 1);
  assert.equal(data.ai_health.total, 6);
});
