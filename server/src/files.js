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
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

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
    return row ? publicUser(row) : null;
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
};

function nameFromUrl(fileUrl) {
  const name = path.basename(String(fileUrl || '').split(/[?#]/)[0]);
  return SAFE_NAME.test(name) ? name : null;
}

function loadFile(name) {
  const row = db
    .prepare('SELECT name, content_type, original_name, data FROM files WHERE name = ?')
    .get(name);
  if (row) {
    return {
      buffer: Buffer.from(row.data),
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
  const file = loadFile(name);
  if (!file) return null;
  return extractTextFromBuffer(file.buffer, file.originalName || name);
}

function serveFile(req, res) {
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
  const file = loadFile(name);
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
  app.post('/api/files/upload', authRequired, limits.uploads, upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file received' });
    const ext = path.extname(req.file.originalname || '').replace(/[^A-Za-z0-9.]/g, '').slice(0, 10);
    const name = `${Date.now()}-${crypto.randomUUID()}${ext}`;
    db.prepare(
      'INSERT INTO files (name, content_type, original_name, size, data, created_by_id, created_date) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(
      name,
      req.file.mimetype || 'application/octet-stream',
      req.file.originalname || name,
      req.file.size,
      req.file.buffer,
      req.user.id,
      new Date().toISOString()
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
      res.status(e.status || 500).json({ error: e.message });
    }
  });
}

module.exports = { registerFileRoutes, readUploadText, canAccessFile, canAttachFile, signFileUrl, canonicalFileUrl };
