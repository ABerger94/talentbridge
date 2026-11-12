'use strict';
// Re-implementations of the Base44 backend functions the frontend calls.
// Invoked through POST /api/functions/:name, returns the function's result;
// the client shim wraps it as { data } like Base44's invoke did.
const crypto = require('crypto');
const { db } = require('./db');
const { store } = require('./entities');
const { invokeLLM } = require('./llm');
const { authRequired, getUserById } = require('./auth');
const { layout, appUrl } = require('./mailer');
const { hit } = require('./ratelimit');

// Counts one AI-backed call against the caller's hourly AI allowance (the
// same budget as /api/integrations/llm). Cached answers don't count.
function spendAiAllowance(user) {
  const max = parseInt(process.env.TB_AI_LIMIT_PER_HOUR || '', 10) || 60;
  const r = hit(`ai-user:${user.id}`, max, 60 * 60 * 1000);
  if (!r.ok) throw fail(429, `You’ve hit the hourly AI limit. Please try again in ${Math.ceil(r.retryAfter / 60)} minutes.`);
}

function fail(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

const {
  notify, applicantEmail, applicantLabel, firstName, roleLine, DASHBOARD, notifyEmployer,
} = require('./notifications');

// Interview times in emails: we don't know the reader's zone, so say UTC and
// point to the dashboard, which shows local time.
function utcText(date) {
  return new Date(date).toLocaleString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
    timeZone: 'UTC', timeZoneName: 'short',
  });
}

// The applicant's own application (or admin). Candidate actions go through
// these functions so they're validated and the employer is told.
function requireOwnApplication(user, applicationId) {
  if (!applicationId) throw fail(400, 'application_id is required');
  const application = store.get('JobApplication', applicationId);
  if (!application) throw fail(404, 'Application not found');
  if (application.created_by_id !== user.id && user.role !== 'admin') {
    throw fail(403, 'Forbidden: this is not your application');
  }
  const job = store.get('Job', application.job_id) || { id: application.job_id, title: 'the role' };
  return { application, job };
}

function parseTime(value, label) {
  const d = value ? new Date(value) : null;
  if (!d || Number.isNaN(d.getTime())) throw fail(400, `A valid ${label} is required`);
  return d;
}

// Same guard inviteSeekerToJob applies: only the employer who owns the job
// (or an admin) may act on it. The job is resolved from the application when
// one is given, so a caller cannot pair someone else's application with a job
// they own.
function requireOwnedApplication(user, payload, action) {
  if (user.role !== 'employer' && user.role !== 'admin') {
    throw fail(403, `Forbidden: Only employers can ${action}`);
  }
  require('./employers').requireApprovedEmployer(user);
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

// Seeker profile as an employer may see it in matching (no resume link: an
// employer gets that only on an application to their job).
function publicSeeker(seeker) {
  if (!seeker) return seeker;
  const { resume_url: _resume, ...rest } = seeker;
  return rest;
}
function withoutPrivateFields(matches) {
  return (matches || []).map((m) => ({ ...m, seeker: publicSeeker(m.seeker) }));
}

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
    if (user.role === 'admin' || user.role === role) return { success: true };
    // The account type is chosen once, during onboarding.
    if (user.role !== 'user') throw fail(403, 'Your account type is already set');
    const data = { ...(user.data || {}) };
    if (role === 'employer') data.employer_status = 'pending'; // reviewed before seeing candidates
    db.prepare('UPDATE users SET role = ?, data = ? WHERE id = ?').run(role, JSON.stringify(data), user.id);
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
    spendAiAllowance(user);
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
    require('./employers').requireApprovedEmployer(user);
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
        const cached = JSON.parse(hit.result);
        return { ...cached, matches: withoutPrivateFields(cached.matches), cached: true };
      }
    }

    spendAiAllowance(user);

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
          seeker: publicSeeker(seeker),
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
    require('./employers').requireApprovedEmployer(user);
    const job = store.get('Job', job_id);
    if (!job) throw fail(404, 'Job not found');
    if (job.created_by_id !== user.id && user.role !== 'admin') {
      throw fail(403, 'Forbidden: You can only invite seekers for your own jobs');
    }
    if (job.status !== 'active') throw fail(409, 'Reopen this role before inviting candidates');
    const seeker = store.get('SeekerProfile', seeker_profile_id);
    if (!seeker) throw fail(404, 'Seeker profile not found');
    store.create('Invitation', {
      job_id,
      seeker_profile_id,
      employer_id: user.id,
      status: 'pending',
    }, user.id);
    const seekerUser = getUserById(seeker.created_by_id);
    await notify('invitation', {
      to: seekerUser?.email,
      subject: `You're invited to apply: ${roleLine(job)}`,
      ...layout({
        heading: `An employer wants you to apply`,
        paragraphs: [
          `Hi ${seeker.full_name ? seeker.full_name.split(/\s+/)[0] : 'there'},`,
          `${job.company || 'An employer'} thinks your profile is a strong fit for ${job.title} and invited you to apply.`,
          'Open your dashboard to accept or decline the invitation.',
        ],
        button: { label: 'View invitation', url: DASHBOARD() },
      }),
    }, { job_id, seeker_profile_id, employer_id: user.id });
    return { success: true };
  },

  async sendInterviewInvitation(user, payload) {
    const { application, job } = requireOwnedApplication(user, payload, 'schedule interviews');
    const when = parseTime(payload?.proposed_time, 'proposed_time');
    if (application?.status === 'withdrawn') throw fail(409, 'This candidate withdrew their application');
    const isReschedule = !!application?.interview_proposed_time;
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
    const whenText = utcText(when);
    await notify('interview_invitation', {
      to: applicantEmail(application),
      subject: `${isReschedule ? 'New interview time' : 'Interview invitation'}: ${roleLine(job)}`,
      ...layout({
        heading: isReschedule ? 'Your interview has a new proposed time' : 'You’re invited to interview',
        paragraphs: [
          `Hi ${firstName(application)},`,
          isReschedule
            ? `${job.company || 'The employer'} proposed a new interview time for ${job.title}.`
            : `${job.company || 'The employer'} would like to interview you for ${job.title}.`,
          `Proposed time: ${whenText}. Your dashboard shows it in your own time zone.`,
          'Open your dashboard to accept, decline, or suggest another time.',
        ],
        button: { label: 'Respond to invitation', url: DASHBOARD() },
      }),
    }, { application_id: application?.id || payload?.application_id, job_id: job.id, proposed_time: when.toISOString(), from_user_id: user.id });
    return { success: true };
  },

  async sendOfferEmail(user, payload) {
    const { application_id, offer_details } = payload || {};
    const { application, job } = requireOwnedApplication(user, payload, 'send offers');
    if (application?.status === 'withdrawn') throw fail(409, 'This candidate withdrew their application');
    if (application) {
      store.update('JobApplication', application.id, { status: 'offered', offer_details, offer_response: null });
    }
    const o = offer_details || {};
    const salary = o.salary ? `${o.salary_currency ? `${o.salary_currency} ` : ''}${Number(o.salary).toLocaleString('en-US')}` : null;
    await notify('offer', {
      to: applicantEmail(application),
      subject: `Job offer: ${roleLine(job)}`,
      ...layout({
        heading: 'You have a job offer!',
        paragraphs: [
          `Hi ${firstName(application)},`,
          `${job.company || 'The employer'} has made you an offer for ${o.title || job.title}.`,
          [salary && `Salary: ${salary}`, o.start_date && `Start date: ${o.start_date}`, o.benefits && `Benefits: ${o.benefits}`]
            .filter(Boolean).join('\n'),
          o.notes ? `Note from the employer: ${o.notes}` : '',
          'Open your dashboard to accept, decline, or negotiate.',
        ].filter(Boolean),
        button: { label: 'Review offer', url: DASHBOARD() },
      }),
    }, { application_id, job_id: job.id, offer_details });
    return { success: true };
  },

  async sendRejectionEmail(user, payload) {
    const { application, job } = requireOwnedApplication(user, payload, 'reject applicants');
    if (application?.status === 'withdrawn') throw fail(409, 'This candidate withdrew their application');
    if (application) {
      store.update('JobApplication', application.id, { status: 'rejected' });
    }
    await notify('rejection', {
      to: applicantEmail(application),
      subject: `Update on your application: ${roleLine(job)}`,
      ...layout({
        heading: 'An update on your application',
        paragraphs: [
          `Hi ${firstName(application)},`,
          `Thank you for applying for ${job.title}${job.company ? ` at ${job.company}` : ''}. After careful consideration, they’ve decided to move forward with other candidates for this role.`,
          'This isn’t a judgment of your potential. Your profile stays visible to other employers, and new roles are posted regularly.',
        ],
        button: { label: 'Explore other roles', url: appUrl('/jobs') },
      }),
    }, { application_id: application?.id, job_id: job.id, from_user_id: user.id });
    return { success: true };
  },

  async sendShortlistNotification(user, payload) {
    const { application, job } = requireOwnedApplication(user, payload, 'shortlist applicants');
    if (application?.status === 'withdrawn') throw fail(409, 'This candidate withdrew their application');
    if (application) {
      store.update('JobApplication', application.id, { status: 'shortlisted' });
    }
    await notify('shortlist', {
      to: applicantEmail(application),
      subject: `You've been shortlisted: ${roleLine(job)}`,
      ...layout({
        heading: 'You’ve been shortlisted',
        paragraphs: [
          `Hi ${firstName(application)},`,
          `Good news: ${job.company || 'the employer'} has shortlisted you for ${job.title}. They may reach out about next steps soon.`,
        ],
        button: { label: 'View your applications', url: DASHBOARD() },
      }),
    }, { application_id: application?.id, job_id: job.id, from_user_id: user.id });
    return { success: true };
  },

  // --- Employer: accept the candidate's suggested interview time -------------
  async acceptInterviewCounter(user, payload) {
    const { application, job } = requireOwnedApplication(user, payload, 'schedule interviews');
    if (!application || application.interview_response !== 'counter_proposed' || !application.interview_counter_time) {
      throw fail(409, 'There is no suggested time to accept');
    }
    const when = parseTime(application.interview_counter_time, 'suggested time');
    store.update('JobApplication', application.id, {
      interview_proposed_time: when.toISOString(),
      interview_response: 'accepted',
      interview_counter_time: null,
    });
    await notify('interview_confirmed', {
      to: applicantEmail(application),
      subject: `Interview confirmed: ${roleLine(job)}`,
      ...layout({
        heading: 'Your interview is confirmed',
        paragraphs: [
          `Hi ${firstName(application)},`,
          `${job.company || 'The employer'} accepted the time you suggested for ${job.title}.`,
          `Interview time: ${utcText(when)}. Your dashboard shows it in your own time zone.`,
        ],
        button: { label: 'View your applications', url: DASHBOARD() },
      }),
    }, { application_id: application.id, job_id: job.id, time: when.toISOString() });
    return { success: true };
  },

  // --- Candidate actions (each emails the employer) ---------------------------
  async respondToInterview(user, { application_id, response, counter_time }) {
    const { application, job } = requireOwnApplication(user, application_id);
    if (application.status !== 'interview' || !application.interview_proposed_time) {
      throw fail(409, 'There is no interview to respond to');
    }
    if (!['accepted', 'declined', 'counter_proposed'].includes(response)) throw fail(400, 'Invalid response');
    const changes = { interview_response: response, interview_counter_time: null };
    let counter = null;
    if (response === 'counter_proposed') {
      counter = parseTime(counter_time, 'suggested time');
      changes.interview_counter_time = counter.toISOString();
    }
    store.update('JobApplication', application.id, changes);
    const who = applicantLabel(application);
    const lines = {
      accepted: `${who} accepted the interview for ${job.title} on ${utcText(application.interview_proposed_time)}.`,
      declined: `${who} declined the interview for ${job.title}.`,
      counter_proposed: `${who} can't make the proposed interview time for ${job.title} and suggested ${counter ? utcText(counter) : 'another time'} instead. You can accept it or propose a new time from the candidate's card.`,
    };
    await notifyEmployer(`interview_${response}`, job, {
      subject: `${who} ${response === 'counter_proposed' ? 'suggested a new interview time' : `${response} the interview`}: ${job.title}`,
      heading: response === 'counter_proposed' ? 'New interview time suggested' : `Interview ${response}`,
      paragraphs: [lines[response]],
    }, { application_id: application.id });
    return { success: true };
  },

  async respondToOffer(user, { application_id, response, notes }) {
    const { application, job } = requireOwnApplication(user, application_id);
    if (application.status !== 'offered') throw fail(409, 'There is no offer to respond to');
    if (!['accepted', 'declined', 'negotiating'].includes(response)) throw fail(400, 'Invalid response');
    const text = String(notes || '').trim().slice(0, 2000);
    if (response === 'negotiating' && !text) throw fail(400, 'Please add a note for the employer');
    store.update('JobApplication', application.id, {
      offer_response: response,
      offer_negotiation_notes: response === 'negotiating' ? text : null,
    });
    const who = applicantLabel(application);
    await notifyEmployer(`offer_${response}`, job, {
      subject: `${who} ${response === 'negotiating' ? 'wants to discuss the offer' : `${response} your offer`}: ${job.title}`,
      heading: response === 'accepted' ? 'Offer accepted 🎉' : response === 'declined' ? 'Offer declined' : 'Offer: candidate wants to talk',
      paragraphs: [
        response === 'accepted' ? `${who} accepted your offer for ${job.title}.`
          : response === 'declined' ? `${who} declined your offer for ${job.title}.`
            : `${who} replied to your offer for ${job.title}:`,
        response === 'negotiating' ? `“${text}”` : '',
      ].filter(Boolean),
    }, { application_id: application.id });
    return { success: true };
  },

  async withdrawApplication(user, { application_id }) {
    const { application, job } = requireOwnApplication(user, application_id);
    if (application.status === 'withdrawn') return { success: true };
    if (application.status === 'rejected') throw fail(409, 'This application is already closed');
    if (application.status === 'offered' && application.offer_response === 'accepted') {
      throw fail(409, 'You accepted this offer — contact the employer directly to change that');
    }
    store.update('JobApplication', application.id, { status: 'withdrawn', withdrawn_date: new Date().toISOString() });
    await notifyEmployer('application_withdrawn', job, {
      subject: `${applicantLabel(application)} withdrew their application: ${job.title}`,
      heading: 'Application withdrawn',
      paragraphs: [`${applicantLabel(application)} withdrew their application for ${job.title}. No action is needed.`],
    }, { application_id: application.id });
    return { success: true };
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
