'use strict';
// Gemini transport for the app's LLM calls — replaces Base44 InvokeLLM.
// Same contract: { prompt, response_json_schema } in, parsed JSON object out.
const { authRequired } = require('./auth');

const MODEL = process.env.TB_GEMINI_MODEL || 'gemini-3.8-flash';

// Gemini's responseSchema accepts a JSON-Schema subset; drop keys it rejects.
function sanitizeSchema(schema) {
  if (!schema || typeof schema !== 'object') return undefined;
  const out = {};
  for (const [key, value] of Object.entries(schema)) {
    if (key === '$schema' || key === 'additionalProperties') continue;
    if (key === 'properties' && value && typeof value === 'object') {
      out.properties = {};
      for (const [pk, pv] of Object.entries(value)) out.properties[pk] = sanitizeSchema(pv);
    } else if (key === 'items') {
      out.items = sanitizeSchema(value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

async function invokeLLM({ prompt, response_json_schema }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    const err = new Error('AI is not configured on this server (GEMINI_API_KEY missing)');
    err.status = 503;
    throw err;
  }
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {},
  };
  if (response_json_schema) {
    body.generationConfig.responseMimeType = 'application/json';
    body.generationConfig.responseSchema = sanitizeSchema(response_json_schema);
  }
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(body),
    }
  );
  if (!res.ok) {
    const text = await res.text();
    const err = new Error(`Gemini request failed (${res.status}): ${text.slice(0, 300)}`);
    err.status = 502;
    throw err;
  }
  const json = await res.json();
  const text = json?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
  if (!response_json_schema) return { response: text };
  try {
    return JSON.parse(text);
  } catch {
    const err = new Error('AI returned a response that was not valid JSON');
    err.status = 502;
    throw err;
  }
}

function registerLlmRoutes(app) {
  app.post('/api/integrations/llm', authRequired, async (req, res) => {
    try {
      const { prompt, response_json_schema, file_urls } = req.body || {};
      let fullPrompt = prompt || '';
      // Base44's InvokeLLM accepted file_urls; inline the files' text so the
      // model actually sees them. Required lazily: files.js requires this module.
      if (Array.isArray(file_urls) && file_urls.length) {
        const { readUploadText } = require('./files');
        const parts = [];
        for (const url of file_urls.slice(0, 5)) {
          const text = await readUploadText(url);
          if (text == null) {
            // Uploads can be missing on another serverless instance; tell the
            // model instead of failing the whole call.
            parts.push(`--- FILE: ${require('path').basename(String(url))} ---\n[file unavailable]`);
            continue;
          }
          parts.push(`--- FILE: ${require('path').basename(String(url))} ---\n${text.slice(0, 24000)}`);
        }
        fullPrompt += `\n\nATTACHED FILES:\n${parts.join('\n\n')}`;
      }
      const result = await invokeLLM({ prompt: fullPrompt, response_json_schema });
      res.json({ data: result });
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message });
    }
  });
}

module.exports = { registerLlmRoutes, invokeLLM };
