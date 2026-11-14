'use strict';
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const { db, DATA_DIR } = require('./db');
const jwt = require('jsonwebtoken');
const { authRequired, jwtSecret, getUserById, publicUser } = require('./auth');
const { limits } = require('./ratelimit');
const { invokeLLM } = require('./llm');

const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');

// Uploads are stored in the database (files table), so every serverless
// instance can serve them — the old per-instance memory copy vanished between
// requests on Vercel. Files written to disk by older standalone builds are
// still served from UPLOAD_DIR as a fallback.
// Vercel rejects request bodies over ~4.5 MB before they reach us, so the
// default cap stays under it (raise TB_MAX_UPLOAD_MB when self-hosting).
const MAX_UPLOAD_MB = Math.max(1, parseFloat(process.env.TB_MAX_UPLOAD_MB || '') || 4);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: Math.round(MAX_UPLOAD_MB * 1024 * 1024) },
});
const storage = require('./storage');
try { db.exec("ALTER TABLE files ADD COLUMN storage TEXT NOT NULL DEFAULT 'database'"); } catch { /* exists */ }

const SAFE_NAME = /^[A-Za-z0-9._-]+$/;

// --- Access control ----------------------------------------------------------
// Uploaded files (resumes, job documents) are private. A file can be read by:
//   - the user who uploaded it
//   - an employer whose job has an application carrying it as resume_url
//   - an admin
// Browsers can't attach the login token to a plain link, so readers get a
// signed link (HMAC of name + expiry) that works for SIGNED_LINK_TTL.
const SIGNED_LINK_TTL_S = 2 * 60 * 60;

function linkKey() {
  return crypto.createHash('sha256').update(`file-links:${jwtSecret()}`).digest();
}

function signature(name, exp) {
  return crypto.createHmac('sha256', linkKey()).update(`${name}:${exp}`).digest('base64url').slice(0, 32);
}

// Canonical stored form of a file URL: /api/files/<name> (no signature).
function canonicalFileUrl(url) {
  const name = nameFromUrl(url);
  return name ? `/api/files/${name}` : null;
}

function signFileUrl(url) {
  const name = nameFromUrl(url);
  if (!name) return url;
  const exp = Math.floor(Date.now() / 1000) + SIGNED_LINK_TTL_S;
  return `/api/files/${name}?exp=${exp}&sig=${signature(name, exp)}`;
}

function validSignature(name, exp, sig) {
  const e = parseInt(exp, 10);
  if (!Number.isFinite(e) || e < Date.now() / 1000 || typeof sig !== 'string') return false;
  const expected = Buffer.from(signature(name, e));
  const given = Buffer.from(sig);
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}

function uploadedBy(name) {
  return db.prepare('SELECT created_by_id FROM files WHERE name = ?').get(name)?.created_by_id || null;
}

function canAccessFile(user, fileUrlOrName) {
  const name = nameFromUrl(fileUrlOrName);
  if (!user || !name) return false;
  if (user.role === 'admin') return true;
  const owner = uploadedBy(name);
  if (owner && owner === user.id) return true;
  const like = `%/${name}`;
  // Older uploads have no owner row: the seeker whose profile holds the file.
  if (!owner) {
    const own = db.prepare(
      "SELECT 1 FROM records WHERE entity = 'SeekerProfile' AND created_by_id = ? AND json_extract(data, '$.resume_url') LIKE ? LIMIT 1"
    ).get(user.id, like);
    if (own) return true;
  }
  // An employer reviewing an application that carries this file.
  const viaApplication = db.prepare(
    "SELECT 1 FROM records WHERE entity = 'JobApplication' AND json_extract(data, '$.employer_user_id') = ? AND json_extract(data, '$.resume_url') LIKE ? LIMIT 1"
  ).get(user.id, like);
  return !!viaApplication;
}

// May `user` attach this file to their own records (e.g. as resume_url)?
// Only files they uploaded themselves (or, for older uploads, already hold).
function canAttachFile(user, fileUrl) {
  const name = nameFromUrl(fileUrl);
  if (!user || !name) return false;
  if (user.role === 'admin') return true;
  const owner = uploadedBy(name);
  if (owner) return owner === user.id;
  return canAccessFile(user, name);
}

function userFromRequest(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return null;
  try {
    const payload = jwt.verify(header.slice(7), jwtSecret());
    const row = getUserById(payload.sub);
    if (!row || (Number(payload.tv) || 0) !== (Number(publicUser(row).data.token_version) || 0)) return null;
    return publicUser(row);
  } catch {
    return null;
  }
}

// Only resume formats are served with their own type (inline). Anything
// else goes out as a download, so an upload can never render as HTML/SVG on
// the app's origin.
const INLINE_TYPES = {
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  // Profile photos (profiles.js checks they really are images).
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

function nameFromUrl(fileUrl) {
  const name = path.basename(String(fileUrl || '').split(/[?#]/)[0]);
  return SAFE_NAME.test(name) ? name : null;
}

async function loadFile(name) {
  const row = db
    .prepare('SELECT name, content_type, original_name, data, storage FROM files WHERE name = ?')
    .get(name);
  if (row) {
    const buffer = await storage.getBytes(row);
    if (!buffer) return null;
    return {
      buffer,
      contentType: row.content_type,
      originalName: row.original_name || name,
    };
  }
  const filePath = path.join(UPLOAD_DIR, name);
  if (fs.existsSync(filePath)) {
    return { buffer: fs.readFileSync(filePath), contentType: null, originalName: name };
  }
  return null;
}

async function extractTextFromBuffer(buffer, name) {
  const lower = name.toLowerCase();
  if (lower.endsWith('.pdf')) {
    const pdfParse = require('pdf-parse');
    const parsed = await pdfParse(buffer);
    return parsed.text || '';
  }
  if (lower.endsWith('.docx')) {
    const mammoth = require('mammoth');
    const { value } = await mammoth.extractRawText({ buffer });
    return value || '';
  }
  if (lower.endsWith('.doc')) {
    const err = new Error('Old Word (.doc) files can\'t be read — please save it as .docx or PDF and upload again.');
    err.status = 415;
    throw err;
  }
  return buffer.toString('utf8');
}

// Resolve an uploaded file's text by its URL. Returns null when the file
// does not exist.
async function readUploadText(fileUrl) {
  const name = nameFromUrl(fileUrl);
  if (!name) return null;
  const file = await loadFile(name);
  if (!file) return null;
  return extractTextFromBuffer(file.buffer, file.originalName || name);
}

async function serveFile(req, res) {
  const name = nameFromUrl(req.params.name);
  if (!name) return res.status(404).json({ error: 'File not found' });
  const signed = req.query.sig && validSignature(name, req.query.exp, req.query.sig);
  if (!signed) {
    const user = userFromRequest(req);
    if (!user) {
      return res.status(401).json({ error: req.query.sig ? 'This link has expired. Reload the page to get a fresh one.' : 'Sign in to view this file.' });
    }
    if (!canAccessFile(user, name)) return res.status(404).json({ error: 'File not found' });
  }
  let file;
  try {
    file = await loadFile(name);
  } catch (e) {
    require('./monitor').captureServerError(e, req);
    return res.status(502).json({ error: 'The file couldn’t be loaded from storage. Please try again.' });
  }
  if (!file) return res.status(404).json({ error: 'File not found' });
  const type = INLINE_TYPES[path.extname(name).toLowerCase()];
  const safeOriginal = String(file.originalName || name).replace(/[^\w.\- ]/g, '_');
  res.setHeader('Content-Type', type || 'application/octet-stream');
  res.setHeader('Content-Disposition', `${type ? 'inline' : 'attachment'}; filename="${safeOriginal}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.send(file.buffer);
}

function registerFileRoutes(app) {
  const receive = (req, res, next) => upload.single('file')(req, res, (err) => {
    if (err?.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: `That file is too large. Files can be up to ${MAX_UPLOAD_MB} MB.` });
    }
    if (err) return next(err);
    next();
  });

  app.post('/api/files/upload', authRequired, limits.uploads, receive, async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file received' });
    const bad = storage.checkContent(req.file.originalname, req.file.buffer);
    if (bad) return res.status(415).json({ error: bad });
    const ext = path.extname(req.file.originalname || '').toLowerCase().replace(/[^a-z0-9.]/g, '').slice(0, 10);
    const name = `${Date.now()}-${crypto.randomUUID()}${ext}`;
    let stored;
    try {
      stored = await storage.putBytes(name, req.file.buffer);
    } catch (e) {
      require('./monitor').captureServerError(e, req);
      return res.status(502).json({ error: 'The file couldn’t be stored. Please try again.' });
    }
    db.prepare(
      'INSERT INTO files (name, content_type, original_name, size, data, created_by_id, created_date, storage) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(
      name,
      req.file.mimetype || 'application/octet-stream',
      String(req.file.originalname || name).slice(0, 200),
      req.file.size,
      stored.data,
      req.user.id,
      new Date().toISOString(),
      stored.storage
    );
    // /api/files/... is always routed to the server (vercel.json rewrites /api/*).
    // Signed so the uploader can open it right away; stored copies are
    // normalized back to /api/files/<name> when saved on a record.
    res.json({ data: { file_url: signFileUrl(`/api/files/${name}`) } });
  });

  app.get('/api/files/:name', serveFile);
  // Legacy URLs saved by earlier builds.
  app.get('/uploads/:name', serveFile);

  // Replaces Base44 ExtractDataFromUploadedFile: read the file's text and
  // have the LLM pull the requested fields out of it.
  app.post('/api/integrations/extract', authRequired, limits.ai, async (req, res) => {
    try {
      const { file_url, json_schema } = req.body || {};
      if (!file_url) return res.status(400).json({ error: 'file_url required' });
      if (!canAccessFile(req.user, file_url)) return res.status(404).json({ error: 'File not found' });
      let text = await readUploadText(file_url);
      if (text == null) return res.status(404).json({ error: 'File not found' });
      if (!text.trim()) {
        return res.status(422).json({ error: 'No text could be read from this file (a scanned/image-only PDF?). Upload a text-based PDF, DOCX or TXT.' });
      }
      text = text.slice(0, 24000);
      const result = await invokeLLM({
        prompt: `Extract the requested fields from this document. Use only information present in the document; leave fields empty when the information is absent.\n\nDOCUMENT:\n${text}`,
        response_json_schema: json_schema,
      });
      res.json({ data: result });
    } catch (e) {
      if (!e.status || e.status >= 500) require('./monitor').captureServerError(e, req);
      res.status(e.status || 500).json({ error: e.message });
    }
  });
}

// Removes a file's metadata and bytes (account deletion).
async function deleteFile(name) {
  const row = db.prepare('SELECT name, storage FROM files WHERE name = ?').get(name);
  if (!row) return;
  await storage.deleteBytes(row);
  db.prepare('DELETE FROM files WHERE name = ?').run(name);
}

// Moves up to `batch` database-stored files into the S3 bucket. Called from
// the admin System tab until nothing is left.
async function migrateToBucket(batch = 20) {
  if (storage.backend() !== 's3') throw Object.assign(new Error('Set the TB_S3_* settings first'), { status: 400 });
  const rows = db.prepare("SELECT name, data FROM files WHERE storage = 'database' LIMIT ?").all(batch);
  let moved = 0;
  for (const row of rows) {
    const { storage: where, data } = await storage.putBytes(row.name, Buffer.from(row.data));
    db.prepare('UPDATE files SET storage = ?, data = ? WHERE name = ?').run(where, data, row.name);
    moved += 1;
  }
  const remaining = db.prepare("SELECT COUNT(*) AS n FROM files WHERE storage = 'database'").get().n;
  return { moved, remaining };
}

module.exports = { loadFile, deleteFile, migrateToBucket, MAX_UPLOAD_MB, registerFileRoutes, readUploadText, canAccessFile, canAttachFile, signFileUrl, canonicalFileUrl };
