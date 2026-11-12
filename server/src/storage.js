'use strict';
// Where uploaded file bytes live. The files table always holds each file's
// metadata (owner, type, name) — access checks never change. The bytes go to:
//   database (default)  the files.data column
//   s3                  any S3-compatible bucket (Cloudflare R2, Backblaze B2,
//                       AWS S3...) when TB_S3_BUCKET, TB_S3_ENDPOINT,
//                       TB_S3_ACCESS_KEY_ID and TB_S3_SECRET_ACCESS_KEY are set
//                       (TB_S3_REGION defaults to "auto", which R2 expects).
// The bucket stays private: the server fetches objects with signed requests
// and serves them through /api/files after its own access checks, so
// resume links still expire and are never public bucket URLs.
const crypto = require('crypto');

const env = (n) => (process.env[n] || '').trim();

function s3Config() {
  const cfg = {
    bucket: env('TB_S3_BUCKET'),
    endpoint: env('TB_S3_ENDPOINT').replace(/\/$/, ''),
    accessKeyId: env('TB_S3_ACCESS_KEY_ID'),
    secretAccessKey: env('TB_S3_SECRET_ACCESS_KEY'),
    region: env('TB_S3_REGION') || 'auto',
  };
  return cfg.bucket && cfg.endpoint && cfg.accessKeyId && cfg.secretAccessKey ? cfg : null;
}

function backend() {
  return s3Config() ? 's3' : 'database';
}

function storageStatus() {
  const cfg = s3Config();
  return cfg ? { backend: 's3', bucket: cfg.bucket, endpoint: new URL(cfg.endpoint).host } : { backend: 'database' };
}

// --- AWS Signature Version 4 (enough for single-object PUT/GET/DELETE) -------
const sha256 = (data) => crypto.createHash('sha256').update(data).digest('hex');
const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();
const encodeKey = (key) => key.split('/').map((p) => encodeURIComponent(p).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)).join('/');

// Returns the headers for a signed request. Exported for the test vector.
function signRequest({ method, url, headers = {}, payloadHash, accessKeyId, secretAccessKey, region, service = 's3', now = new Date() }) {
  const u = new URL(url);
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const date = amzDate.slice(0, 8);
  const all = { ...headers, host: u.host, 'x-amz-date': amzDate, 'x-amz-content-sha256': payloadHash };
  const names = Object.keys(all).map((k) => k.toLowerCase()).sort();
  const lower = Object.fromEntries(Object.entries(all).map(([k, v]) => [k.toLowerCase(), String(v).trim()]));
  const canonicalQuery = [...u.searchParams.entries()]
    .map(([k, v]) => [encodeURIComponent(k), encodeURIComponent(v)])
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`).join('&');
  const canonical = [
    method,
    u.pathname,
    canonicalQuery,
    names.map((n) => `${n}:${lower[n]}\n`).join(''),
    names.join(';'),
    payloadHash,
  ].join('\n');
  const scope = `${date}/${region}/${service}/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonical)].join('\n');
  const kSigning = hmac(hmac(hmac(hmac(`AWS4${secretAccessKey}`, date), region), service), 'aws4_request');
  const signature = crypto.createHmac('sha256', kSigning).update(toSign).digest('hex');
  return {
    ...all,
    authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${names.join(';')}, Signature=${signature}`,
  };
}

async function s3(method, key, body) {
  const cfg = s3Config();
  const url = `${cfg.endpoint}/${encodeURIComponent(cfg.bucket)}/${encodeKey(key)}`;
  const payloadHash = sha256(body || '');
  const headers = signRequest({ method, url, payloadHash, ...cfg, headers: body ? { 'content-length': String(body.length) } : {} });
  delete headers.host; // fetch sets it
  const res = await fetch(url, { method, headers, body, signal: AbortSignal.timeout(20000) });
  if (method === 'GET' && res.status === 404) return null;
  if (!res.ok) throw new Error(`Storage ${method} failed (HTTP ${res.status}): ${(await res.text()).slice(0, 200)}`);
  return method === 'GET' ? Buffer.from(await res.arrayBuffer()) : true;
}

// --- Public API used by files.js ---------------------------------------------
// Save bytes; returns { storage, data } for the files row ('database' rows
// keep the bytes, 's3' rows keep an empty blob).
async function putBytes(name, buffer) {
  if (backend() === 's3') {
    await s3('PUT', `uploads/${name}`, buffer);
    return { storage: 's3', data: Buffer.alloc(0) };
  }
  return { storage: 'database', data: buffer };
}

async function getBytes(row) {
  if (row.storage === 's3') {
    if (!s3Config()) throw new Error('This file is in external storage, but TB_S3_* settings are missing');
    return s3('GET', `uploads/${row.name}`);
  }
  return Buffer.from(row.data);
}

async function deleteBytes(row) {
  if (row.storage === 's3' && s3Config()) await s3('DELETE', `uploads/${row.name}`).catch(() => {});
}

// --- Content checks ------------------------------------------------------------
// The extension must match what the file actually is, so a renamed
// executable or HTML page can't pass as a resume.
const SIGNATURES = {
  '.pdf': (b) => b.subarray(0, 1024).includes(Buffer.from('%PDF-')),
  '.docx': (b) => b.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])),
  '.doc': (b) => b.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])),
  '.txt': (b) => !b.includes(0) && !/<\s*(script|html|svg|iframe)\b/i.test(b.subarray(0, 4096).toString('utf8')),
};

const ALLOWED_EXTENSIONS = Object.keys(SIGNATURES);

function checkContent(originalName, buffer) {
  const ext = require('path').extname(String(originalName || '')).toLowerCase();
  if (!SIGNATURES[ext]) return `Only ${ALLOWED_EXTENSIONS.join(', ')} files can be uploaded.`;
  if (!buffer?.length) return 'The file is empty.';
  if (!SIGNATURES[ext](buffer)) return `This file isn’t a valid ${ext.slice(1).toUpperCase()} file. Save it again from Word or your PDF app and re-upload.`;
  return null;
}

module.exports = { backend, storageStatus, putBytes, getBytes, deleteBytes, checkContent, signRequest, ALLOWED_EXTENSIONS };
