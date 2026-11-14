# TalentBridge Admin API

Use this API to manage TalentBridge from an AI agent or a script, with the same powers as an admin. Each key only gets the permissions you give it.

**The full, machine-readable description** (every action, its inputs, and the permission it needs) is at:

```
GET https://<your-site>/api/admin/openapi.json
```

Point your agent at that URL first. It's the source of truth, and it always matches what the server enforces.

## 1. Create a key

1. Sign in as an admin and open **Admin → API keys**.
2. Name the key after the agent (e.g. "Ops agent"), pick its permissions, and choose an expiry.
3. Copy the key (`tb_admin_…`). **It's shown once.** Keep it in your agent's secret settings, never in code or chat logs.

Give each agent its own key, with only the permissions it needs. You can revoke a key at any time; it stops working immediately.

## 2. Call the API

Send the key as a bearer token:

```bash
curl -H "Authorization: Bearer $TB_ADMIN_KEY" https://<your-site>/api/admin/overview
```

Success looks like `{ "data": ... }`. Errors look like `{ "error": "message", "code": "..." }`.

## Permissions

| Permission | Lets the key |
|---|---|
| `read` | See the site overview, system health, errors, audit log, employers, jobs, users, job sources, reports and incomplete signups |
| `personal_data` | See names, emails and phone numbers. **Without it they come back as `"[hidden]"`.** |
| `employers` | Approve or reject employer accounts (this emails them) |
| `jobs` | Close or reopen job postings |
| `job_sources` | Add, change and remove job sources, and run imports |
| `operations` | Run job alerts, resolve errors, move stored files, send signup reminders, and run the AI fairness check (uses AI calls) |

A key can only reach the admin API (`/api/admin/...`), and only the actions listed in `openapi.json`. It can't create or revoke keys.

## Common tasks

```bash
# How is the site doing?
curl -H "Authorization: Bearer $TB_ADMIN_KEY" https://<your-site>/api/admin/overview

# Employers waiting for review
curl -H "Authorization: Bearer $TB_ADMIN_KEY" "https://<your-site>/api/admin/employers?status=pending"

# Approve one (needs "employers")
curl -X POST -H "Authorization: Bearer $TB_ADMIN_KEY" -H "Content-Type: application/json" \
  -d '{"decision":"approve","note":"Verified company website"}' \
  https://<your-site>/api/admin/employers/<id>/decision

# Take down a posting (needs "jobs"; a reason is required)
curl -X POST -H "Authorization: Bearer $TB_ADMIN_KEY" -H "Content-Type: application/json" \
  -d '{"status":"closed","reason":"Duplicate posting"}' \
  https://<your-site>/api/admin/jobs/<id>/status

# Job sources that failed on their last run
curl -H "Authorization: Bearer $TB_ADMIN_KEY" https://<your-site>/api/admin/job-sources

# Run imports now (needs "job_sources")
curl -X POST -H "Authorization: Bearer $TB_ADMIN_KEY" https://<your-site>/api/admin/job-sources/run

# What has this agent changed? (audit log)
curl -H "Authorization: Bearer $TB_ADMIN_KEY" "https://<your-site>/api/admin/audit?action=api_key.request"
```

## Errors

| Status | `code` | Meaning |
|---|---|---|
| 401 | `invalid_key`, `key_revoked`, `key_expired` | The key doesn't work. Create a new one. |
| 403 | `missing_scope` | The key lacks the permission this action needs. |
| 403 | `not_available` | Keys can't use this endpoint. Check `openapi.json`. |
| 403 | `admin_api_only` | Keys only work on `/api/admin/...`. |
| 429 | `rate_limited` | 1200 requests an hour per key. Wait for the `Retry-After` header. |

## Safety

- **Everything a key changes is in the audit log** under the key's name (Admin → System, or `GET /api/admin/audit`).
- **Personal details are hidden by default.** Only grant `personal_data` to agents that truly need it. If an agent reads seekers' personal data, your privacy policy should say so.
- **Keys are stored only as a hash.** If a key is lost, revoke it and create a new one.
- **Expiry.** Prefer keys that expire, and rotate them.
