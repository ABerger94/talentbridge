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
| `announcement_drafts` | Write, edit, preview and delete announcement emails, and send a test copy to the key's owner. **Can't send to users.** |
| `announcements` | Everything above, plus send announcements to users, continue a paused send, retry failures, and stop a send |

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

## Announcements (emailing users)

Service announcements go to everyone, or only job seekers or only employers. Use them for policy changes, new features and outages, **not marketing**: the Privacy Policy says TalentBridge doesn't send marketing email. Each email starts with "Hi [first name]," and ends with a service-announcement footer. Write the message as plain text. Leave a blank line between paragraphs, and links become clickable.

There are two safe ways to give an agent this job:

- **Agent drafts, you send.** Give the key `announcement_drafts`. The agent writes the draft and sends a test to you. You review it under Admin → Announcements and press Send there.
- **Agent sends.** Give the key `announcements`. A send must include `confirm_count`, the exact number of recipients, so the agent always knows how many people it's emailing.

```bash
# Who would get it? (counts per audience, verified emails or all)
curl -H "Authorization: Bearer $TB_ADMIN_KEY" https://<your-site>/api/admin/announcements

# Write a draft (audience: all | job_seeker | employer; verified_only defaults to true)
curl -X POST -H "Authorization: Bearer $TB_ADMIN_KEY" -H "Content-Type: application/json" \
  -d '{"subject":"We updated our Terms","body":"What changed...\n\nRead them at https://<your-site>/terms","audience":"all","button_label":"Read the terms","button_url":"/terms"}' \
  https://<your-site>/api/admin/announcements
# -> { "data": { "id": "...", "status": "draft", "recipients_now": 412, ... } }

# See the email exactly as sent (html and text), without saving
curl -X POST ... -d '{ same body as above }' https://<your-site>/api/admin/announcements/preview

# Change the draft, or send a test copy to the key's owner
curl -X PUT  ... -d '{"subject":"..."}' https://<your-site>/api/admin/announcements/<id>
curl -X POST -H "Authorization: Bearer $TB_ADMIN_KEY" https://<your-site>/api/admin/announcements/<id>/test

# Send it (needs "announcements"). The wrong count returns 409 with the right "recipients".
curl -X POST -H "Authorization: Bearer $TB_ADMIN_KEY" -H "Content-Type: application/json" \
  -d '{"confirm_count":412}' https://<your-site>/api/admin/announcements/<id>/send
# -> status "done", or "sending" for large lists: call /process until it's done
curl -X POST -H "Authorization: Bearer $TB_ADMIN_KEY" https://<your-site>/api/admin/announcements/<id>/process
```

Statuses are `draft`, then `sending`, then `done`. `paused` means the email provider's daily limit was reached; a daily job resumes it automatically, or you can call `/process` the next day. `cancelled` comes from `/cancel`. `progress` shows `sent`, `failed`, `pending` and `cancelled`. `GET /announcements/<id>` lists failed addresses with the reason, and `/retry` tries them again. Nobody gets the same announcement twice. Once an announcement is sending, it can't be edited or deleted. Every send is in the audit log as `announcement.sent`.

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
