'use strict';
// LLM transport for the app's AI calls — replaces Base44 InvokeLLM.
// Same contract: { prompt, response_json_schema } in, parsed JSON object out.
const { authRequired } = require('./auth');

// --- Provider pool ------------------------------------------------------
// Every AI call walks an ordered list of attempts (provider x key x model)
// and returns the first success. Providers, in TB_LLM_ORDER order (default
// below), each enabled only when its key env var is set:
//   gemini      GEMINI_API_KEYS / GEMINI_API_KEY, models TB_GEMINI_MODELS
//   groq        GROQ_API_KEYS / GROQ_API_KEY, models TB_GROQ_MODELS
//   cerebras    CEREBRAS_API_KEYS / CEREBRAS_API_KEY, models TB_CEREBRAS_MODELS
//   mistral     MISTRAL_API_KEYS / MISTRAL_API_KEY, models TB_MISTRAL_MODELS
//   openrouter  OPENROUTER_API_KEYS / OPENROUTER_API_KEY, models TB_OPENROUTER_MODELS
//   custom      any OpenAI-compatible endpoint: TB_CUSTOM_LLM_URL (full
//               .../chat/completions URL), TB_CUSTOM_LLM_API_KEYS / _API_KEY,
//               TB_CUSTOM_LLM_MODELS, optional TB_CUSTOM_LLM_NAME
//   anthropic   ANTHROPIC_API_KEY, model TB_ANTHROPIC_MODEL (paid; last)
// *_API_KEYS and *_MODELS are comma-separated. Within a provider the starting
// key rotates per call. A key that returns 429 is benched for that model for
// a minute, a rejected key for 10 minutes, a missing model for 30 minutes —
// on this instance — so later calls go straight to a healthy option.

const Anthropic = require('@anthropic-ai/sdk');

const GEMINI_MODELS = splitList(process.env.TB_GEMINI_MODELS || process.env.TB_GEMINI_MODEL || 'gemini-3.8-flash');
const ANTHROPIC_MODEL = process.env.TB_ANTHROPIC_MODEL || 'claude-opus-5-5';
// Effort for Claude: structured extraction/scoring doesn't need deep
// reasoning, and Vercel caps a request at 60s. Override with TB_ANTHROPIC_EFFORT.
const ANTHROPIC_EFFORT = process.env.TB_ANTHROPIC_EFFORT || 'low';
const ATTEMPT_TIMEOUT_MS = parseInt(process.env.TB_LLM_ATTEMPT_TIMEOUT_MS || '20000', 10);
const TOTAL_BUDGET_MS = parseInt(process.env.TB_LLM_TOTAL_BUDGET_MS || '50000', 10);

function splitList(v) {
  return String(v || '').split(',').map((x) => x.trim()).filter(Boolean);
}

function keysFrom(base) {
  return [...new Set([...splitList(process.env[`${base}S`]), ...splitList(process.env[base])])];
}
function geminiKeys() {
  return keysFrom('GEMINI_API_KEY');
}

// OpenAI-compatible chat-completions providers. `json` is how structured
// output is requested: json_schema (schema-constrained) or json_object (valid
// JSON only; the schema is also spelled out in the prompt).
const OPENAI_COMPAT = [
  {
    id: 'groq', name: 'Groq', url: 'https://api.groq.com/openai/v1/chat/completions',
    keyEnv: 'GROQ_API_KEY', modelsEnv: 'TB_GROQ_MODELS',
    defaultModels: ['openai/gpt-oss-120b', 'openai/gpt-oss-20b'], json: 'json_schema',
  },
  {
    id: 'cerebras', name: 'Cerebras', url: 'https://api.cerebras.ai/v1/chat/completions',
    keyEnv: 'CEREBRAS_API_KEY', modelsEnv: 'TB_CEREBRAS_MODELS',
    defaultModels: ['gpt-oss-120b'], json: 'json_schema',
  },
  {
    id: 'mistral', name: 'Mistral', url: 'https://api.mistral.ai/v1/chat/completions',
    keyEnv: 'MISTRAL_API_KEY', modelsEnv: 'TB_MISTRAL_MODELS',
    defaultModels: ['mistral-small-latest'], json: 'json_schema',
  },
  {
    // openrouter/free routes to a currently free model that supports the
    // request's features; individual :free IDs come and go without notice.
    id: 'openrouter', name: 'OpenRouter', url: 'https://openrouter.ai/api/v1/chat/completions',
    keyEnv: 'OPENROUTER_API_KEY', modelsEnv: 'TB_OPENROUTER_MODELS',
    defaultModels: ['openrouter/free'], json: 'json_schema',
  },
  {
    id: 'custom', name: process.env.TB_CUSTOM_LLM_NAME || 'Custom', url: process.env.TB_CUSTOM_LLM_URL,
    keyEnv: 'TB_CUSTOM_LLM_API_KEY', modelsEnv: 'TB_CUSTOM_LLM_MODELS',
    defaultModels: [], json: process.env.TB_CUSTOM_LLM_JSON_MODE === 'json_schema' ? 'json_schema' : 'json_object',
  },
];

function compatModels(p) {
  const list = splitList(process.env[p.modelsEnv]);
  return list.length ? list : p.defaultModels;
}
function compatEnabled(p) {
  return !!p.url && keysFrom(p.keyEnv).length > 0 && compatModels(p).length > 0;
}

const DEFAULT_ORDER = ['gemini', 'groq', 'cerebras', 'mistral', 'openrouter', 'custom', 'anthropic'];
function providerOrder() {
  const custom = splitList(process.env.TB_LLM_ORDER).map((x) => x.toLowerCase()).filter((x) => DEFAULT_ORDER.includes(x));
  // Anything left out of TB_LLM_ORDER keeps its default relative position at the end.
  return [...new Set([...custom, ...DEFAULT_ORDER])];
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
  const status = { order: [] };
  for (const id of providerOrder()) {
    if (id === 'gemini') {
      if (geminiKeys().length) status.order.push({ provider: 'gemini', keys: geminiKeys().length, models: GEMINI_MODELS });
    } else if (id === 'anthropic') {
      if (process.env.ANTHROPIC_API_KEY) status.order.push({ provider: 'anthropic', keys: 1, models: [ANTHROPIC_MODEL] });
    } else {
      const p = OPENAI_COMPAT.find((x) => x.id === id);
      if (compatEnabled(p)) status.order.push({ provider: p.id, name: p.name, keys: keysFrom(p.keyEnv).length, models: compatModels(p) });
    }
  }
  status.configured = status.order.length > 0;
  return status;
}

// key id -> timestamp until which it is skipped
const benchedUntil = new Map();
const rotation = new Map(); // provider -> next starting key index
function rotated(provider, keys) {
  const n = rotation.get(provider) || 0;
  rotation.set(provider, n + 1);
  const start = n % keys.length;
  return keys.slice(start).concat(keys.slice(0, start));
}

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

async function callGemini(key, model, { prompt, response_json_schema, temperature }, timeoutMs) {
  const body = { contents: [{ parts: [{ text: prompt }] }], generationConfig: {} };
  if (typeof temperature === 'number') body.generationConfig.temperature = temperature;
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
    if (res.status === 404) throw new AttemptError(`model "${model}" not found (404)`, { status: 404, benchMs: 30 * 60_000 });
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

function messageText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map((c) => (typeof c === 'string' ? c : c?.text || '')).join('');
  return '';
}

async function callCompat(p, key, model, { prompt, response_json_schema, temperature }, timeoutMs, jsonMode = p.json) {
  let content = prompt;
  const body = { model, messages: [] };
  if (typeof temperature === 'number') body.temperature = temperature;
  if (response_json_schema) {
    if (jsonMode === 'json_schema') {
      body.response_format = {
        type: 'json_schema',
        // strict:false — the app's schemas don't mark every field required.
        json_schema: { name: 'response', strict: false, schema: claudeSchema(response_json_schema) },
      };
    } else {
      body.response_format = { type: 'json_object' };
      content += `\n\nRespond with only a JSON object matching this JSON Schema:\n${JSON.stringify(response_json_schema)}`;
    }
  }
  body.messages.push({ role: 'user', content });
  let res;
  try {
    res = await fetch(p.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    throw new AttemptError(`network/timeout: ${e.name === 'TimeoutError' ? 'timed out' : e.message}`);
  }
  if (!res.ok) {
    const text = (await res.text()).slice(0, 200).replace(/\s+/g, ' ');
    // Some models reject json_schema; retry once in plain JSON mode.
    if (res.status === 400 && jsonMode === 'json_schema' && /response_format|json_schema|schema/i.test(text)) {
      return callCompat(p, key, model, { prompt, response_json_schema, temperature }, timeoutMs, 'json_object');
    }
    if (res.status === 429) throw new AttemptError(`rate limited/quota (429): ${text}`, { status: 429, benchMs: 60_000 });
    if (res.status === 401 || res.status === 403) throw new AttemptError(`key rejected (${res.status}): ${text}`, { status: res.status, benchMs: 10 * 60_000, benchScope: 'key' });
    if (res.status === 402) throw new AttemptError(`out of credits (402): ${text}`, { status: 402, benchMs: 10 * 60_000, benchScope: 'key' });
    if (res.status === 404) throw new AttemptError(`model "${model}" not found (404): ${text}`, { status: 404, benchMs: 30 * 60_000 });
    throw new AttemptError(`HTTP ${res.status}: ${text}`, { status: res.status });
  }
  let json;
  try {
    json = await res.json();
  } catch {
    throw new AttemptError('returned a non-JSON HTTP body');
  }
  // OpenRouter can report upstream failures inside a 200.
  if (json?.error) throw new AttemptError(`upstream error: ${String(json.error.message || json.error.code || 'unknown').slice(0, 200)}`);
  const choice = json?.choices?.[0];
  const text = messageText(choice?.message?.content);
  if (choice?.finish_reason === 'length') throw new AttemptError('response was cut off (length)');
  if (!text) throw new AttemptError(`empty response${choice?.finish_reason ? ` (${choice.finish_reason})` : ''}`);
  if (!response_json_schema) return { response: text };
  const parsed = parseJson(text, `${p.name} ${model}`);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new AttemptError('returned JSON that was not an object');
  return parsed;
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
  for (const id of providerOrder()) {
    if (id === 'gemini') {
      const keys = geminiKeys();
      if (!keys.length) continue;
      const ordered = rotated('gemini', keys);
      for (const model of GEMINI_MODELS) {
        for (const key of ordered) {
          attempts.push({
            keyId: `gemini:${key}`,
            id: `gemini:${key}:${model}`,
            label: `Gemini key #${keys.indexOf(key) + 1} / ${model}`,
            run: (args, t) => callGemini(key, model, args, t),
          });
        }
      }
    } else if (id === 'anthropic') {
      const client = anthropic();
      if (!client) continue;
      attempts.push({
        keyId: 'anthropic',
        id: 'anthropic',
        label: `Claude ${ANTHROPIC_MODEL}`,
        run: (args, t) => callClaude(client, args, t),
      });
    } else {
      const p = OPENAI_COMPAT.find((x) => x.id === id);
      if (!compatEnabled(p)) continue;
      const keys = keysFrom(p.keyEnv);
      const ordered = rotated(p.id, keys);
      for (const model of compatModels(p)) {
        for (const key of ordered) {
          attempts.push({
            keyId: `${p.id}:${key}`,
            id: `${p.id}:${key}:${model}`,
            label: `${p.name}${keys.length > 1 ? ` key #${keys.indexOf(key) + 1}` : ''} / ${model}`,
            run: (args, t) => callCompat(p, key, model, args, t),
          });
        }
      }
    }
  }
  return attempts;
}

// temperature: pass 0 where the same input should give the same answer
// (Capability Graphs, match scores). Sent to Gemini and OpenAI-compatible
// providers; Claude calls leave it unset, since newer Claude models can
// reject it alongside the effort setting used here.
async function invokeLLM({ prompt: rawPrompt, response_json_schema, temperature }) {
  // Every call starts with the untrusted-text / fairness rules (aisafety.js).
  const prompt = require('./aisafety').PREAMBLE + String(rawPrompt || '');
  const attempts = buildAttempts();
  if (!attempts.length) {
    const err = new Error('AI is not configured on this server (set at least one AI provider key, e.g. GEMINI_API_KEYS or GROQ_API_KEY)');
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
      return await attempt.run({ prompt, response_json_schema, temperature }, Math.min(ATTEMPT_TIMEOUT_MS, remaining - 1000));
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
  app.post('/api/integrations/llm', authRequired, require('./ratelimit').limits.ai, async (req, res) => {
    try {
      const { prompt, response_json_schema, file_urls } = req.body || {};
      let fullPrompt = prompt || '';
      // Base44's InvokeLLM accepted file_urls; inline the files' text so the
      // model actually sees them. Required lazily: files.js requires this module.
      if (Array.isArray(file_urls) && file_urls.length) {
        const { readUploadText } = require('./files');
        const parts = [];
        const { canAccessFile } = require('./files');
        for (const url of file_urls.slice(0, 5)) {
          const text = canAccessFile(req.user, url) ? await readUploadText(url) : null;
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
      if (!e.status || e.status >= 500) require('./monitor').captureServerError(e, req);
      res.status(e.status || 500).json({ error: e.message });
    }
  });
}

module.exports = { registerLlmRoutes, invokeLLM, providerStatus, claudeSchema };
