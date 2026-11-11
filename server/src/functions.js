'use strict';
// Re-implementations of the Base44 backend functions the frontend calls.
// Invoked through POST /api/functions/:name, returns the function's result;
// the client shim wraps it as { data } like Base44's invoke did.
const crypto = require('crypto');
const { db } = require('./db');
const { store } = require('./entities');
const { invokeLLM } = require('./llm');
const { authRequired, getUserById } = require('./auth');

function fail(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

function queueNotification(kind, payload) {
  // Email delivery is phase 2 (needs the owner's mail setup). Until then,
  // notifications are recorded here and logged — never silently dropped.
  const id = crypto.randomUUID();
  db.prepare(
    'INSERT INTO notifications (id, kind, payload, created_date) VALUES (?, ?, ?, ?)'
  ).run(id, kind, JSON.stringify(payload || {}), new Date().toISOString());
  console.log(`[notify] queued (${kind}):`, JSON.stringify(payload || {}).slice(0, 300));
  return id;
}

// Same guard inviteSeekerToJob applies: only the employer who owns the job
// (or an admin) may act on it. The job is resolved from the application when
// one is given, so a caller cannot pair someone else's application with a job
// they own.
function requireOwnedApplication(user, payload, action) {
  if (user.role !== 'employer' && user.role !== 'admin') {
    throw fail(403, `Forbidden: Only employers can ${action}`);
  }
  const { application_id, job_id } = payload || {};
  if (!application_id && !job_id) throw fail(400, 'application_id or job_id is required');
  const application = application_id ? store.get('JobApplication', application_id) : null;
  if (application_id && !application) throw fail(404, 'Application not found');
  if (application && job_id && application.job_id !== job_id) {
    throw fail(400, 'Application does not belong to this job');
  }
  const job = store.get('Job', application ? application.job_id : job_id);
  if (!job) throw fail(404, 'Job not found');
  if (job.created_by_id !== user.id && user.role !== 'admin') {
    throw fail(403, `Forbidden: You can only ${action} for your own jobs`);
  }
  return { application, job };
}

const MATCH_BATCH_SIZE = 25; // seekers scored per AI call
const MATCH_MAX_SEEKERS = 100; // per request: at most 4 parallel AI calls
const MATCH_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const clip = (v, n) => (v == null ? undefined : String(v).slice(0, n));

// One AI call scores a whole batch of seekers against the job. Returns a
// Map seeker_id -> { match_score, match_summary } (ids the model invented
// are ignored).
async function scoreSeekerBatch(job, seekers) {
  const roster = seekers.map((sp) => ({
    seeker_id: sp.id,
    headline: clip(sp.headline, 160),
    skills: (sp.skills || []).slice(0, 30),
    experience_level: sp.experience_level,
    experience_years: sp.experience_years,
    bio: clip(sp.bio, 400),
    industries_of_interest: (sp.industries_of_interest || []).slice(0, 10),
  }));
  const prompt = `You are an expert recruiter. Score how well EACH job seeker below matches this job, on a scale of 0-100.

Current date: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}

JOB
Title: ${job.title}
Description: ${clip(job.description, 1500) || 'N/A'}
Required Skills: ${job.skills?.join(', ') || 'N/A'}
Experience Level: ${job.experience_level || 'N/A'}

SEEKERS (JSON):
${JSON.stringify(roster)}

Score every seeker independently. Return exactly one entry per seeker in "matches", using the seeker_id given above, with match_score as an integer 0-100 and match_summary as one or two sentences explaining the score.`;
  const result = await invokeLLM({
    prompt,
    response_json_schema: {
      type: 'object',
      properties: {
        matches: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              seeker_id: { type: 'string' },
              match_score: { type: 'number', description: 'Integer from 0 to 100' },
              match_summary: { type: 'string' },
            },
            required: ['seeker_id', 'match_score', 'match_summary'],
          },
        },
      },
      required: ['matches'],
    },
  });
  const valid = new Set(seekers.map((sp) => sp.id));
  const byId = new Map();
  for (const m of Array.isArray(result?.matches) ? result.matches : []) {
    if (m && valid.has(m.seeker_id) && !byId.has(m.seeker_id)) byId.set(m.seeker_id, m);
  }
  return byId;
}

const FUNCTIONS = {
  async setUserRole(user, { role }) {
    if (!['employer', 'job_seeker'].includes(role)) throw fail(400, 'Invalid role');
    if (user.role !== 'admin') {
      db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, user.id);
    }
    return { success: true };
  },

  async analyzePortfolio(user, { seeker_profile_id, github_url, portfolio_url }) {
    if (!seeker_profile_id) throw fail(400, 'seeker_profile_id is required');
    if (!github_url && !portfolio_url) throw fail(400, 'At least one portfolio URL required');
    const seekerProfile = store.get('SeekerProfile', seeker_profile_id);
    if (!seekerProfile) throw fail(404, 'Seeker profile not found');
    if (seekerProfile.created_by_id !== user.id && user.role !== 'admin') {
      throw fail(403, 'Forbidden: You can only analyze your own profile');
    }
    let portfolioContent = '';
    if (portfolio_url) {
      try {
        const response = await fetch(portfolio_url);
        if (response.ok) portfolioContent = (await response.text()).substring(0, 5000);
      } catch (e) {
        portfolioContent = `[Could not fetch portfolio website: ${e.message}]`;
      }
    }
    let analysisPrompt = 'Analyze this candidate\'s portfolio and provide structured insights:\n\n';
    if (github_url) analysisPrompt += `GitHub Profile: ${github_url}\n`;
    if (portfolio_url) analysisPrompt += `Portfolio Website: ${portfolio_url}\n`;
    if (portfolioContent) analysisPrompt += `\nPortfolio Website Content (HTML):\n${portfolioContent}\n`;
    analysisPrompt += `\nCurrent date: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}\n\nBe specific and evidence-based. Analyze BOTH the GitHub profile AND the portfolio website content if both are provided.`;
    const analysisResult = await invokeLLM({
      prompt: analysisPrompt,
      response_json_schema: {
        type: 'object',
        properties: {
          github_analysis: { type: 'string' },
          project_highlights: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                tech_stack: { type: 'array', items: { type: 'string' } },
                impact: { type: 'string' },
              },
            },
          },
          technical_strengths: { type: 'array', items: { type: 'string' } },
          architectural_patterns: { type: 'string' },
          collaboration_signals: { type: 'string' },
        },
      },
    });
    const portfolioAnalysis = { ...analysisResult, last_analyzed: new Date().toISOString() };
    store.update('SeekerProfile', seeker_profile_id, { portfolio_analysis: portfolioAnalysis });
    return { success: true, analysis: portfolioAnalysis };
  },

  async findMatchingSeekers(user, { job_id, force }) {
    if (user.role !== 'employer' && user.role !== 'admin') throw fail(403, 'Unauthorized');
    if (!job_id) throw fail(400, 'job_id is required');
    const jobData = store.get('Job', job_id);
    if (!jobData) throw fail(404, 'Job not found');
    if (jobData.created_by_id !== user.id && user.role !== 'admin') {
      throw fail(403, 'Forbidden: You can only find matches for your own jobs');
    }
    const allSeekers = store.all('SeekerProfile');
    if (!allSeekers.length) return { matches: [], total_seekers: 0 };

    // Cache: same job content + same seeker profiles => same answer. Any job
    // edit or profile change (or 24h) recomputes.
    const fingerprint = crypto.createHash('sha256').update(JSON.stringify([
      jobData.updated_date, jobData.title, jobData.description, jobData.skills, jobData.experience_level,
      allSeekers.map((sp) => `${sp.id}:${sp.updated_date}`).sort(),
    ])).digest('hex');
    if (!force) {
      const hit = db.prepare('SELECT fingerprint, result, created_date FROM match_cache WHERE job_id = ?').get(job_id);
      if (hit && hit.fingerprint === fingerprint && Date.now() - Date.parse(hit.created_date) < MATCH_CACHE_TTL_MS) {
        return { ...JSON.parse(hit.result), cached: true };
      }
    }

    // Past MATCH_MAX_SEEKERS, shortlist by skill overlap so the AI calls stay
    // within the request time limit.
    let candidates = allSeekers;
    if (allSeekers.length > MATCH_MAX_SEEKERS) {
      const jobSkills = new Set((jobData.skills || []).map((x) => String(x).toLowerCase()));
      candidates = allSeekers
        .map((sp) => ({ sp, overlap: (sp.skills || []).filter((x) => jobSkills.has(String(x).toLowerCase())).length }))
        .sort((x, y) => y.overlap - x.overlap)
        .slice(0, MATCH_MAX_SEEKERS)
        .map((x) => x.sp);
    }

    const chunks = [];
    for (let i = 0; i < candidates.length; i += MATCH_BATCH_SIZE) chunks.push(candidates.slice(i, i + MATCH_BATCH_SIZE));
    const settled = await Promise.allSettled(chunks.map((chunk) => scoreSeekerBatch(jobData, chunk)));
    const failed = settled.filter((r) => r.status === 'rejected');
    if (failed.length === settled.length) {
      const e = failed[0].reason;
      throw fail(e?.status || 502, e?.message || 'AI matching failed');
    }

    const { normalizePercent } = require('./scales-server');
    const matches = [];
    let unscored = 0;
    settled.forEach((r, i) => {
      if (r.status !== 'fulfilled') {
        unscored += chunks[i].length;
        return;
      }
      for (const seeker of chunks[i]) {
        const scored = r.value.get(seeker.id);
        if (!scored) {
          unscored += 1;
          continue;
        }
        matches.push({
          seeker_id: seeker.id,
          seeker,
          seeker_headline: seeker.headline || 'Candidate',
          match_score: normalizePercent(scored.match_score, 0),
          match_summary: scored.match_summary || '',
        });
      }
    });
    matches.sort((a, b) => (b.match_score || 0) - (a.match_score || 0));
    const result = {
      matches,
      total_seekers: allSeekers.length,
      considered: candidates.length,
      unscored,
    };
    // Cache only complete results so a partial failure is retried next time.
    if (!unscored) {
      db.prepare('INSERT OR REPLACE INTO match_cache (job_id, fingerprint, result, created_date) VALUES (?, ?, ?, ?)')
        .run(job_id, fingerprint, JSON.stringify(result), new Date().toISOString());
    }
    return result;
  },

  async inviteSeekerToJob(user, { seeker_profile_id, job_id }) {
    if (user.role !== 'employer' && user.role !== 'admin') throw fail(403, 'Forbidden: Only employers can send invitations');
    const job = store.get('Job', job_id);
    if (!job) throw fail(404, 'Job not found');
    if (job.created_by_id !== user.id && user.role !== 'admin') {
      throw fail(403, 'Forbidden: You can only invite seekers for your own jobs');
    }
    const seeker = store.get('SeekerProfile', seeker_profile_id);
    if (!seeker) throw fail(404, 'Seeker profile not found');
    store.create('Invitation', {
      job_id,
      seeker_profile_id,
      employer_id: user.id,
      status: 'pending',
    }, user.id);
    queueNotification('invitation', { job_id, seeker_profile_id, employer_id: user.id });
    return { success: true };
  },

  async sendInterviewInvitation(user, payload) {
    const { application, job } = requireOwnedApplication(user, payload, 'schedule interviews');
    const when = payload?.proposed_time ? new Date(payload.proposed_time) : null;
    if (!when || Number.isNaN(when.getTime())) throw fail(400, 'A valid proposed_time is required');
    if (application) {
      // Save the proposal on the application so both dashboards show it;
      // a new proposal clears the candidate's previous answer.
      store.update('JobApplication', application.id, {
        status: 'interview',
        interview_proposed_time: when.toISOString(),
        interview_response: null,
        interview_counter_time: null,
      });
    }
    queueNotification('interview_invitation', {
      ...payload,
      application_id: application?.id || payload?.application_id,
      job_id: job.id,
      from_user_id: user.id,
    });
    return { success: true, queued: true };
  },

  async sendOfferEmail(user, payload) {
    const { application_id, offer_details } = payload || {};
    const { application, job } = requireOwnedApplication(user, payload, 'send offers');
    if (application) {
      store.update('JobApplication', application.id, { status: 'offered', offer_details, offer_response: null });
    }
    queueNotification('offer', { application_id, job_id: job.id, offer_details });
    return { success: true, queued: true };
  },

  async sendRejectionEmail(user, payload) {
    const { application, job } = requireOwnedApplication(user, payload, 'reject applicants');
    if (application) {
      store.update('JobApplication', application.id, { status: 'rejected' });
    }
    queueNotification('rejection', { ...payload, job_id: job.id, from_user_id: user.id });
    return { success: true, queued: true };
  },

  async sendShortlistNotification(user, payload) {
    const { application, job } = requireOwnedApplication(user, payload, 'shortlist applicants');
    if (application) {
      store.update('JobApplication', application.id, { status: 'shortlisted' });
    }
    queueNotification('shortlist', { ...payload, job_id: job.id, from_user_id: user.id });
    return { success: true, queued: true };
  },
};

function registerFunctionRoutes(app) {
  app.post('/api/functions/:name', authRequired, async (req, res) => {
    const fn = FUNCTIONS[req.params.name];
    if (!fn) return res.status(404).json({ error: `Unknown function: ${req.params.name}` });
    try {
      const result = await fn(req.user, req.body || {});
      res.json({ data: result });
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message });
    }
  });
}

module.exports = { registerFunctionRoutes };
