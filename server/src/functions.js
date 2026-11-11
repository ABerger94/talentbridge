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

  async findMatchingSeekers(user, { job_id }) {
    if (user.role !== 'employer' && user.role !== 'admin') throw fail(403, 'Unauthorized');
    const jobData = store.get('Job', job_id);
    if (!jobData) throw fail(404, 'Job not found');
    const seekers = store.all('SeekerProfile');
    if (!seekers.length) return { matches: [] };
    const matches = [];
    for (const seeker of seekers) {
      const prompt = `You are an expert recruiter. Score how well this job seeker matches the job role on a scale of 0-100.\n\nCurrent date: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}\n\nJob Title: ${jobData.title}\nJob Description: ${jobData.description}\nRequired Skills: ${jobData.skills?.join(', ') || 'N/A'}\nExperience Level: ${jobData.experience_level}\n\nSeeker Profile:\n- Headline: ${seeker.headline}\n- Skills: ${seeker.skills?.join(', ') || 'N/A'}\n- Experience Level: ${seeker.experience_level}\n- Experience Years: ${seeker.experience_years || 'N/A'}\n- Bio: ${seeker.bio || 'N/A'}\n- Industries of Interest: ${seeker.industries_of_interest?.join(', ') || 'N/A'}\n\nReturn only a JSON object with a match_score (number 0-100) and a match_summary (brief explanation).`;
      const aiResult = await invokeLLM({
        prompt,
        response_json_schema: {
          type: 'object',
          properties: {
            match_score: { type: 'number', description: 'Integer from 0 to 100' },
            match_summary: { type: 'string' },
          },
        },
      });
      const { normalizePercent } = require('./scales-server');
      matches.push({
        seeker_id: seeker.id,
        seeker,
        match_score: normalizePercent(aiResult.match_score),
        match_summary: aiResult.match_summary,
      });
    }
    matches.sort((a, b) => (b.match_score || 0) - (a.match_score || 0));
    return { matches };
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
      store.update('JobApplication', application.id, { status: 'offer_extended', offer_details });
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
