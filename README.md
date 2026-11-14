# TalentBridge — Hiring that sees your whole capability, not just your keywords

**Live:** https://talentbridge-jobboard.vercel.app/

TalentBridge inverts applicant tracking system (ATS) logic. Instead of filtering
candidates out with keyword matching, rigid cutoffs, and silent auto-rejections, it
builds a **Capability Graph** around each candidate — real work (GitHub, portfolio,
projects), adjacent skills, adaptability — and matches both directions.

No auto-rejections. Ever. And instead of a black box, candidates get a
**Hidden Vectors** panel showing exactly how they map to a role and where the gaps are.

## How it works

**For job seekers**
- Build a profile from your actual work: GitHub repos, portfolio pieces, projects —
  not just resume keywords
- Browse roles and see a Hidden Vectors breakdown of how you match each one,
  in plain language, gaps included
- Track applications from a personal dashboard
- Never auto-rejected: every application is visible, every outcome explainable

**For employers**
- Post roles with capability requirements, not keyword checklists
- See candidates as capability graphs: demonstrated skills, adjacent adaptability,
  growth trajectory
- Bi-directional matching surfaces candidates a keyword filter would delete

## Tech stack

- **Frontend:** React 18, Vite, Tailwind CSS, Radix UI, TanStack Query, React Router
- **Backend:** Base44 (entities, auth, serverless functions via `@base44/sdk`)
- **Hosting:** Vercel (SPA with route fallbacks)

## Run it locally

**Prerequisites:** Node.js 18+

```bash
git clone https://github.com/ABerger94/talentbridge.git
cd talentbridge
npm install
```

Create a `.env.local` file with your Base44 app credentials:

```
VITE_BASE44_APP_ID=your_app_id
VITE_BASE44_APP_BASE_URL=https://your-app.base44.app
```

Then:

```bash
npm run dev
```

## Deploying to Vercel

- **Build command:** `npm run vercel-build`
- **Install command:** `npm ci`
- **Output directory:** `dist`
- Set in Vercel project settings: `VITE_BASE44_APP_ID`, `VITE_BASE44_APP_BASE_URL`
  (use the Base44 app domain, e.g. `https://your-app.base44.app`),
  and `VITE_BASE44_FUNCTIONS_VERSION` if your Base44 deployment needs one.

The repo includes Vercel SPA rewrites plus static route fallbacks for direct links
like `/jobs`, `/post-job`, `/dashboard`, `/employer`, and `/onboarding`.

## Admin API (for AI agents)

Admins can create API keys (Admin → API keys) so an AI agent or script can manage the site, with only the permissions each key is given. See [docs/ADMIN_API.md](docs/ADMIN_API.md). The full description of what a key can do is served at `/api/admin/openapi.json`.

## Project structure

```
src/
  pages/          # Routes: Landing, JobBoard, JobDetail, PostJob,
                  #   SeekerDashboard, EmployerDashboard, Onboarding, auth pages
  components/
    jobs/         # JobCard, JobFilters
    seeker/       # Profile, portfolio, application components
    employer/     # Candidate capability cards
    layout/       # App shell
    ui/           # Radix-based primitives
  api/            # Base44 client setup
  lib/            # Auth context, query client, app params
base44/
  entities/       # Data model: Job, JobApplication, SeekerProfile, User, Invitation
```

## Base44 ↔ GitHub sync

This repo is connected to the Base44 builder. Changes pushed here are reflected in
the Base44 Builder, and publishing from [Base44](https://base44.app) updates the
live app. Docs: https://docs.base44.com/Integrations/Using-GitHub

## Status

Live product, early stage. Built by Alek Berger.
