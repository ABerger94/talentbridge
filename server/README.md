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
| `GEMINI_API_KEY` | Google AI Studio key. Without it, AI features return 503. |
| `TB_GEMINI_MODEL` | Default `gemini-2.5-flash` |
| `TB_ADMIN_EMAILS` | Comma-separated emails that always get the `admin` role |
| `TB_GOOGLE_CLIENT_ID` / `TB_GOOGLE_CLIENT_SECRET` | Google sign-in (optional). Redirect URI: `https://YOUR-DOMAIN/api/auth/google/callback` |
| `TB_DATA_DIR` | SQLite database + uploads location (default `server/data`) |
| `TB_CORS_ORIGIN` | CORS origin when the frontend is hosted separately |

## Notes

- **Verification codes (OTP):** sign-up and password-reset codes are real
  and validated. Until email delivery is configured, codes are printed to
  the server console (`[otp] ...`) so the owner can complete testing.
- **Email functions** (offers, rejections, interview invites, shortlist):
  actions and status changes happen for real; the email itself is recorded
  in the `notifications` table as `queued_no_mailer` until SMTP is wired.
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
