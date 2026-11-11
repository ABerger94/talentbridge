# TalentBridge Server (self-hosted)

Replaces Base44 for TalentBridge: authentication, the entity database with
row-level permissions, the backend functions, file uploads, and the AI (LLM)
endpoints. The React frontend talks to it through the drop-in client in
`src/api/base44Client.js` — no page or component changes were needed.

## Run

```bash
cd server
cp .env.example .env   # fill in TB_JWT_SECRET at minimum
npm install
npm start              # http://localhost:8787
```

The server also serves the built frontend from `../dist` when it exists
(`npm run build` at the repo root), so in production the whole product is
this one process.

## Configuration (.env)

| Variable | Purpose |
|---|---|
| `TB_PORT` | Listen port (default 8787) |
| `TB_JWT_SECRET` | Signs login tokens. Required for real deployment. |
| `TB_ADMIN_EMAILS` | Comma-separated emails that always get the `admin` role |
| `TB_GOOGLE_CLIENT_ID` / `TB_GOOGLE_CLIENT_SECRET` | Google sign-in (optional). Redirect URI: `https://YOUR-DOMAIN/api/auth/google/callback` |
| `TB_DATA_DIR` | SQLite database + uploads location (default `server/data`) |
| `TB_CORS_ORIGIN` | CORS origin when the frontend is hosted separately |

## AI providers

Every AI call tries providers in order and returns the first success. Set
keys for as many as you like; a provider with no key is skipped. Without
any key, AI features return 503. `*_API_KEYS` and `*_MODELS` take
comma-separated lists — several free-tier keys multiply your quota (for
Gemini, create each key in a separate Google Cloud project).

| Provider | Keys | Models (default) |
|---|---|---|
| Gemini | `GEMINI_API_KEYS` / `GEMINI_API_KEY` | `TB_GEMINI_MODELS` (`gemini-3.8-flash`) |
| Groq | `GROQ_API_KEYS` / `GROQ_API_KEY` | `TB_GROQ_MODELS` (`openai/gpt-oss-120b,openai/gpt-oss-20b`) |
| Cerebras | `CEREBRAS_API_KEYS` / `CEREBRAS_API_KEY` | `TB_CEREBRAS_MODELS` (`gpt-oss-120b`) |
| Mistral | `MISTRAL_API_KEYS` / `MISTRAL_API_KEY` | `TB_MISTRAL_MODELS` (`mistral-small-latest`) |
| OpenRouter | `OPENROUTER_API_KEYS` / `OPENROUTER_API_KEY` | `TB_OPENROUTER_MODELS` (`openrouter/free`) |
| Any OpenAI-compatible API | `TB_CUSTOM_LLM_API_KEYS` / `TB_CUSTOM_LLM_API_KEY` + `TB_CUSTOM_LLM_URL` (full `.../chat/completions` URL) | `TB_CUSTOM_LLM_MODELS` (required). Optional `TB_CUSTOM_LLM_NAME`, `TB_CUSTOM_LLM_JSON_MODE=json_schema` |
| Claude (paid) | `ANTHROPIC_API_KEY` | `TB_ANTHROPIC_MODEL` (`claude-opus-5-5`), effort `TB_ANTHROPIC_EFFORT` (`low`) |

- **Order:** `TB_LLM_ORDER` (default
  `gemini,groq,cerebras,mistral,openrouter,custom,anthropic`). Providers you
  leave out keep their default order after the ones you list.
- **Skipping bad options:** a 429 skips that key+model for 1 minute, a
  rejected key or out-of-credits for 10 minutes, a missing model for 30
  minutes (per server instance).
- **Time limits:** `TB_LLM_ATTEMPT_TIMEOUT_MS` (20000) per attempt,
  `TB_LLM_TOTAL_BUDGET_MS` (50000) per request — under Vercel's 60 s cap.
- **Check:** `GET /api/health` shows which providers are active, their key
  counts and models (never the keys).
- Free model catalogs change often; if a provider keeps reporting
  "model not found", set its `TB_*_MODELS` to a current model ID.

## Email

Used for sign-up verification codes, password-reset codes, and candidate
notifications (invited to apply, shortlisted, interview, offer, not
selected). Set **one** provider (more = automatic fallback, in
`TB_MAIL_ORDER` order, default `resend,brevo,smtp`):

| Provider | Variables | Free tier | Needs a domain? |
|---|---|---|---|
| Gmail (SMTP) | `TB_SMTP_HOST=smtp.gmail.com`, `TB_SMTP_USER=you@gmail.com`, `TB_SMTP_PASS=<16-char App Password>` (`TB_SMTP_PORT` defaults to 465) | ~500/day | No |
| Brevo | `BREVO_API_KEY`, `TB_MAIL_FROM` = a sender address verified in Brevo | 300/day | No |
| Resend | `RESEND_API_KEY`, `TB_MAIL_FROM` on your verified domain | 3,000/month | Yes |

- `TB_MAIL_FROM`: sender, e.g. `TalentBridge <hello@yourdomain.com>`
  (SMTP defaults to `TB_SMTP_USER`). `TB_MAIL_REPLY_TO` is optional.
- `TB_APP_URL`: site address used in email buttons (default
  `https://talentbridge-jobboard.vercel.app`).
- **Verification:** required only while a provider is configured (otherwise
  no one could sign up); force it with `TB_REQUIRE_EMAIL_VERIFICATION=true`
  or `false`. One code per address per minute; codes last 10 minutes.
- Every notification is recorded in the `notifications` table with
  `status` (`sent`, `failed` + `error`, or `queued_no_mailer`). A failed
  email never blocks the hiring action.
- `GET /api/health` → `mail.configured` / `mail.providers`.

## Notes

- **Verification codes (OTP):** without an email provider, codes are
  printed to the server log (`[otp] ...`) and verification isn't required.
- **Data:** one SQLite file (`talentbridge.sqlite`, WAL mode) via Node's
  built-in `node:sqlite` — no database server to run, trivial to back up
  (copy the file). Uploads live beside it in `data/uploads/`.
- **Permissions:** `src/rls.js` is the single source of truth, ported from
  the old Base44 entity rules with the admin-create lockouts fixed.

## Deploying on the ASUS (planned)

1. Install Node.js 24 (LTS) for Windows.
2. Copy the repo, `cd server`, `npm install`, create `.env`.
3. Run it as a scheduled task / service at logon (`npm start`).
4. Expose it with a Cloudflare Tunnel (`cloudflared tunnel`) pointing a
   hostname at `http://localhost:8787` — public HTTPS, no port forwarding.
