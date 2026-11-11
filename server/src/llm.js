'use strict';
// LLM transport for the app's AI calls — replaces Base44 InvokeLLM.
// Same contract: { prompt, response_json_schema } in, parsed JSON object out.
const { authRequired } = require('./auth');

// --- Provider pool ------------------------------------------------------
// Every AI call walks an ordered list of attempts and returns the first
// success:
//   1. Gemini: every key x every model. Keys come from GEMINI_API_KEYS
//      (comma-separated) plus GEMINI_API_KEY; models from TB_GEMINI_MODELS
//      (comma-separated) or TB_GEMINI_MODEL. The starting key rotates per
//      call to spread load across keys.
//   2. Claude (Anthropic) when ANTHROPIC_API_KEY is set — a different
//      provider, so it still works when every Gemini key is rate limited.
// A key that returns 429 / quota / auth errors is benched for a while on
// this instance so later calls skip straight to a healthy one.

const Anthropic = require('@anthropic-ai/sdk');

const GEMINI_MODELS = splitList(process.env.TB_GEMINI_MODELS || process.env.TB_GEMINI_MODEL || 'gemini-3.8-flash');
const ANTHROPIC_MODEL = process.env.TB_ANTHROPIC_MODEL || 'claude-opus-5-5';
// Effort for Claude: structured extraction/scoring doesn't need deep
// reasoning, and Vercel caps a request at 60s. Override with TB_ANTHROPIC_EFFORT.
const ANTHROPIC_EFFORT = process.env.TB_ANTHROPIC_EFFORT || 'low';
const ATTEMPT_TIMEOUT_MS = parseInt(process.env.TB_LLM_ATTEMPT_TIMEOUT_MS || '25000', 10);
const TOTAL_BUDGET_MS = parseInt(process.env.TB_LLM_TOTAL_BUDGET_MS || '50000', 10);

function splitList(v) {
  return String(v || '').split(',').map((x) => x.trim()).filter(Boolean);
}

function geminiKeys() {
  return [...new Set([...splitList(process.env.GEMINI_API_KEYS), ...splitList(process.env.GEMINI_API_KEY)])];
}

let anthropicClient = null;
function anthropic() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!anthropicClient) {
    // maxRetries: 1 — this module does its own failover across providers.
    anthropicClient = new Anthropic({ maxRetries: 1, timeout: ATTEMPT_TIMEOUT_MS });
  }
  return anthropicClient;
}

function providerStatus() {
  return {
    gemini_keys: geminiKeys().length,
    gemini_models: GEMINI_MODELS,
    anthropic_configured: !!process.env.ANTHROPIC_API_KEY,
    anthropic_model: process.env.ANTHROPIC_API_KEY ? ANTHROPIC_MODEL : null,
  };
}

// key id -> timestamp until which it is skipped
const benchedUntil = new Map();
let rotation = 0;

function bench(id, ms) {
  benchedUntil.set(id, Date.now() + ms);
}
function isBenched(id) {
  return (benchedUntil.get(id) || 0) > Date.now();
}

class AttemptError extends Error {
  // benchScope 'attempt' benches this key+model; 'key' benches the key for
  // every model (Gemini rate limits are per model, bad keys are not).
  constructor(message, { status, benchMs = 0, benchScope = 'attempt' } = {}) {
    super(message);
    this.status = status;
    this.benchMs = benchMs;
    this.benchScope = benchScope;
  }
}

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

// Claude structured outputs need additionalProperties:false on every object
// and don't take numeric/string-length constraints.
const CLAUDE_UNSUPPORTED = new Set(['$schema', 'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf', 'minLength', 'maxLength', 'pattern', 'minItems', 'maxItems']);
function claudeSchema(schema) {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return schema;
  const out = {};
  for (const [key, value] of Object.entries(schema)) {
    if (CLAUDE_UNSUPPORTED.has(key)) continue;
    if (key === 'properties' && value && typeof value === 'object') {
      out.properties = {};
      for (const [pk, pv] of Object.entries(value)) out.properties[pk] = claudeSchema(pv);
    } else if (key === 'items' || key === 'additionalProperties') {
      out[key] = key === 'items' ? claudeSchema(value) : value;
    } else if ((key === 'anyOf' || key === 'allOf') && Array.isArray(value)) {
      out[key] = value.map(claudeSchema);
    } else {
      out[key] = value;
    }
  }
  if (out.type === 'object') out.additionalProperties = false;
  return out;
}

function parseJson(text, label) {
  try {
    return JSON.parse(text);
  } catch {
    // Some models wrap JSON in a code fence; strip it once before giving up.
    const m = String(text).match(/```(?:json)?\s*([\s\S]*?)```/);
    if (m) {
      try { return JSON.parse(m[1]); } catch { /* fall through */ }
    }
    throw new AttemptError(`${label} returned a response that was not valid JSON`);
  }
}

async function callGemini(key, model, { prompt, response_json_schema }, timeoutMs) {
  const body = { contents: [{ parts: [{ text: prompt }] }], generationConfig: {} };
  if (response_json_schema) {
    body.generationConfig.responseMimeType = 'application/json';
    body.generationConfig.responseSchema = sanitizeSchema(response_json_schema);
  }
  let res;
  try {
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    throw new AttemptError(`network/timeout: ${e.name === 'TimeoutError' ? 'timed out' : e.message}`);
  }
  if (!res.ok) {
    const text = (await res.text()).slice(0, 200).replace(/\s+/g, ' ');
    if (res.status === 429) throw new AttemptError(`rate limited/quota (429): ${text}`, { status: 429, benchMs: 60_000 });
    if (res.status === 401 || res.status === 403) throw new AttemptError(`key rejected (${res.status}): ${text}`, { status: res.status, benchMs: 10 * 60_000, benchScope: 'key' });
    if (res.status === 404) throw new AttemptError(`model "${model}" not found (404)`, { status: 404 });
    // 400 is usually the request/schema itself; still try the next model/provider.
    throw new AttemptError(`HTTP ${res.status}: ${text}`, { status: res.status });
  }
  const json = await res.json();
  const cand = json?.candidates?.[0];
  const text = cand?.content?.parts?.map((p) => p.text || '').join('') || '';
  if (!text) throw new AttemptError(`empty response${cand?.finishReason ? ` (${cand.finishReason})` : ''}`);
  if (!response_json_schema) return { response: text };
  return parseJson(text, `Gemini ${model}`);
}

async function callClaude(client, { prompt, response_json_schema }, timeoutMs) {
  const params = {
    model: ANTHROPIC_MODEL,
    max_tokens: 16000,
    messages: [{ role: 'user', content: prompt }],
    output_config: { effort: ANTHROPIC_EFFORT },
    // Server-side refusal fallback; on models without it the request simply
    // runs on the requested model alone.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
  };
  if (response_json_schema) {
    params.output_config.format = { type: 'json_schema', schema: claudeSchema(response_json_schema) };
  }
  let msg;
  try {
    msg = await client.beta.messages.create(params, { timeout: timeoutMs });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) throw new AttemptError(`rate limited (429): ${e.message}`, { status: 429, benchMs: 60_000 });
    if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) {
      throw new AttemptError(`key rejected (${e.status}): ${e.message}`, { status: e.status, benchMs: 10 * 60_000 });
    }
    if (e instanceof Anthropic.BadRequestError) throw new AttemptError(`bad request (400): ${e.message}`, { status: 400 });
    if (e instanceof Anthropic.APIConnectionError) throw new AttemptError(`network/timeout: ${e.message}`);
    if (e instanceof Anthropic.APIError) throw new AttemptError(`HTTP ${e.status}: ${e.message}`, { status: e.status });
    throw e;
  }
  if (msg.stop_reason === 'refusal') throw new AttemptError('declined the request (refusal)');
  if (msg.stop_reason === 'max_tokens') throw new AttemptError('response was cut off (max_tokens)');
  const text = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  if (!text) throw new AttemptError('empty response');
  if (!response_json_schema) return { response: text };
  return parseJson(text, 'Claude');
}

function buildAttempts() {
  const attempts = [];
  const keys = geminiKeys();
  if (keys.length) {
    const start = rotation++ % keys.length;
    const ordered = keys.slice(start).concat(keys.slice(0, start));
    for (const model of GEMINI_MODELS) {
      ordered.forEach((key) => {
        const n = keys.indexOf(key) + 1;
        attempts.push({
          keyId: `gemini:${key}`,
          id: `gemini:${key}:${model}`,
          label: `Gemini key #${n} / ${model}`,
          run: (args, t) => callGemini(key, model, args, t),
        });
      });
    }
  }
  const client = anthropic();
  if (client) {
    attempts.push({
      keyId: 'anthropic',
      id: 'anthropic',
      label: `Claude ${ANTHROPIC_MODEL}`,
      run: (args, t) => callClaude(client, args, t),
    });
  }
  return attempts;
}

async function invokeLLM({ prompt, response_json_schema }) {
  const attempts = buildAttempts();
  if (!attempts.length) {
    const err = new Error('AI is not configured on this server (set GEMINI_API_KEYS or ANTHROPIC_API_KEY)');
    err.status = 503;
    throw err;
  }
  const benched = (a) => isBenched(a.id) || isBenched(a.keyId);
  // Healthy keys first; benched ones only as a last resort (a bench may be
  // stale, and trying beats failing outright).
  const ordered = [...attempts.filter((a) => !benched(a)), ...attempts.filter(benched)];
  const deadline = Date.now() + TOTAL_BUDGET_MS;
  const failures = [];
  const failedKeys = new Set();
  for (const attempt of ordered) {
    const remaining = deadline - Date.now();
    if (remaining < 3000) {
      failures.push('out of time');
      break;
    }
    // A key rejected earlier in this same call won't work for another model.
    if (failedKeys.has(attempt.keyId)) continue;
    try {
      return await attempt.run({ prompt, response_json_schema }, Math.min(ATTEMPT_TIMEOUT_MS, remaining - 1000));
    } catch (e) {
      const detail = e instanceof AttemptError ? e.message : `unexpected: ${e.message}`;
      if (e instanceof AttemptError && e.benchMs) {
        bench(e.benchScope === 'key' ? attempt.keyId : attempt.id, e.benchMs);
        if (e.benchScope === 'key') failedKeys.add(attempt.keyId);
      }
      failures.push(`${attempt.label}: ${detail}`);
      console.warn(`[llm] ${attempt.label} failed — ${detail}`);
    }
  }
  const allRateLimited = failures.length && failures.every((f) => /429|quota/i.test(f));
  const err = new Error(
    allRateLimited
      ? 'All AI keys are rate limited right now — try again in a minute.'
      : `AI request failed on every configured provider. ${failures.join(' | ').slice(0, 900)}`
  );
  err.status = allRateLimited ? 429 : 502;
  throw err;
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

module.exports = { registerLlmRoutes, invokeLLM, providerStatus, claudeSchema };
