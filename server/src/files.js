'use strict';
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const { DATA_DIR } = require('./db');
const { authRequired } = require('./auth');
const { invokeLLM } = require('./llm');

const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const SERVERLESS = !!process.env.TURSO_DATABASE_URL;

// Uploads are held in memory so the same code works on serverless hosts
// (Vercel), where the disk is not writable/persistent. On standalone hosts
// (ASUS) they are ALSO written to disk and served statically as before.
// Caveat: on serverless, the in-memory copy lives as long as the function
// instance — the upload → extract flow happens back-to-back, so this holds.
const stash = new Map(); // name -> { buffer, originalname }
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

async function extractTextFromBuffer(buffer, name) {
  if (name.toLowerCase().endsWith('.pdf')) {
    const pdfParse = require('pdf-parse');
    const parsed = await pdfParse(buffer);
    return parsed.text || '';
  }
  return buffer.toString('utf8');
}

async function extractText(filePath) {
  return extractTextFromBuffer(fs.readFileSync(filePath), path.basename(filePath));
}

// Resolve an uploaded file's text by its /uploads/<name> URL (memory copy
// first, then disk). Returns null when the file is not available here.
async function readUploadText(fileUrl) {
  const name = path.basename(String(fileUrl || ''));
  if (!name) return null;
  const hit = stash.get(name);
  if (hit) return extractTextFromBuffer(hit.buffer, name);
  const filePath = path.join(UPLOAD_DIR, name);
  if (!fs.existsSync(filePath)) return null;
  return extractText(filePath);
}

function registerFileRoutes(app) {
  app.post('/api/files/upload', authRequired, upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file received' });
    const ext = path.extname(req.file.originalname || '').slice(0, 10);
    const name = `${Date.now()}-${crypto.randomUUID()}${ext}`;
    stash.set(name, { buffer: req.file.buffer, originalname: req.file.originalname });
    if (!SERVERLESS) {
      try { fs.writeFileSync(path.join(UPLOAD_DIR, name), req.file.buffer); } catch { /* memory copy still serves */ }
    }
    res.json({ data: { file_url: `/uploads/${name}` } });
  });

  // Serves the in-memory copy when static disk serving can't (serverless).
  app.get('/uploads/:name', (req, res) => {
    const hit = stash.get(path.basename(req.params.name));
    if (!hit) return res.status(404).json({ error: 'File not found' });
    res.type(path.extname(hit.originalname || '') || 'application/octet-stream').send(hit.buffer);
  });

  // Replaces Base44 ExtractDataFromUploadedFile: read the file's text and
  // have the LLM pull the requested fields out of it.
  app.post('/api/integrations/extract', authRequired, async (req, res) => {
    try {
      const { file_url, json_schema } = req.body || {};
      if (!file_url) return res.status(400).json({ error: 'file_url required' });
      let text = await readUploadText(file_url);
      if (text == null) return res.status(404).json({ error: 'File not found' });
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

module.exports = { registerFileRoutes, extractText, readUploadText };
