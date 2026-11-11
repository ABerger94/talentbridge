'use strict';
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const { db, DATA_DIR } = require('./db');
const { authRequired } = require('./auth');
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
  const file = name ? loadFile(name) : null;
  if (!file) return res.status(404).json({ error: 'File not found' });
  const type = INLINE_TYPES[path.extname(name).toLowerCase()];
  const safeOriginal = String(file.originalName || name).replace(/[^\w.\- ]/g, '_');
  res.setHeader('Content-Type', type || 'application/octet-stream');
  res.setHeader('Content-Disposition', `${type ? 'inline' : 'attachment'}; filename="${safeOriginal}"`);
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.send(file.buffer);
}

function registerFileRoutes(app) {
  app.post('/api/files/upload', authRequired, upload.single('file'), (req, res) => {
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
    res.json({ data: { file_url: `/api/files/${name}` } });
  });

  app.get('/api/files/:name', serveFile);
  // Legacy URLs saved by earlier builds.
  app.get('/uploads/:name', serveFile);

  // Replaces Base44 ExtractDataFromUploadedFile: read the file's text and
  // have the LLM pull the requested fields out of it.
  app.post('/api/integrations/extract', authRequired, async (req, res) => {
    try {
      const { file_url, json_schema } = req.body || {};
      if (!file_url) return res.status(400).json({ error: 'file_url required' });
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

module.exports = { registerFileRoutes, readUploadText };
