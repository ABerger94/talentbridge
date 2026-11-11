'use strict';
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const { DATA_DIR } = require('./db');
const { authRequired } = require('./auth');
const { invokeLLM } = require('./llm');

const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname || '').slice(0, 10);
      cb(null, `${Date.now()}-${crypto.randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: 15 * 1024 * 1024 },
});

async function extractText(filePath) {
  if (filePath.toLowerCase().endsWith('.pdf')) {
    const pdfParse = require('pdf-parse');
    const parsed = await pdfParse(fs.readFileSync(filePath));
    return parsed.text || '';
  }
  return fs.readFileSync(filePath, 'utf8');
}

function registerFileRoutes(app) {
  app.post('/api/files/upload', authRequired, upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file received' });
    res.json({ data: { file_url: `/uploads/${req.file.filename}` } });
  });

  // Replaces Base44 ExtractDataFromUploadedFile: read the file's text and
  // have the LLM pull the requested fields out of it.
  app.post('/api/integrations/extract', authRequired, async (req, res) => {
    try {
      const { file_url, json_schema } = req.body || {};
      if (!file_url) return res.status(400).json({ error: 'file_url required' });
      const name = path.basename(file_url);
      const filePath = path.join(UPLOAD_DIR, name);
      if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });
      const text = (await extractText(filePath)).slice(0, 24000);
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

module.exports = { registerFileRoutes, extractText };
