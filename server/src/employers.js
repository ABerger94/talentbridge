'use strict';
// Employer verification and company profiles.
//
// New employers start "pending": they can fill in their company profile and
// draft roles (held as status 'pending_review'), but can't see seekers,
// invite, message, or publish until an admin approves them. Employers who
// existed before verification have no status and count as approved.
const { db } = require('./db');
const { authRequired, getUserById, publicUser } = require('./auth');
const { store } = require('./entities');

const FREE_EMAIL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'ymail.com', 'hotmail.com', 'outlook.com', 'live.com', 'msn.com',
  'icloud.com', 'me.com', 'mac.com', 'aol.com', 'proton.me', 'protonmail.com', 'gmx.com', 'gmx.net', 'mail.com',
  'yandex.com', 'zoho.com', 'hey.com', 'fastmail.com', 'tutanota.com', 'comcast.net', 'verizon.net', 'att.net',
]);
const COMPANY_SIZES = ['1-10', '11-50', '51-200', '201-1000', '1000+'];

function fail(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

function dataOf(row) {
  try {
    return JSON.parse(row?.data || '{}') || {};
  } catch {
    return {};
  }
}

function saveData(userId, data) {
  db.prepare('UPDATE users SET data = ? WHERE id = ?').run(JSON.stringify(data), userId);
}

// 'approved' | 'pending' | 'rejected' for employers (admins count as approved); null otherwise.
function employerStatus(user) {
  if (!user) return null;
  if (user.role === 'admin') return 'approved';
  if (user.role !== 'employer') return null;
  const data = user.data && typeof user.data === 'object' ? user.data : dataOf(user);
  return data.employer_status || 'approved'; // pre-verification employers stay approved
}

function isApprovedEmployer(user) {
  return employerStatus(user) === 'approved';
}

// Throws unless the user is an approved employer (or admin).
function requireApprovedEmployer(user) {
  const status = employerStatus(user);
  if (status === 'approved') return;
  if (status === 'rejected') throw fail(403, 'Your employer account wasn’t approved. Update your company profile and resubmit it for review.');
  throw fail(403, 'Your employer account is awaiting approval. You’ll get an email as soon as it’s reviewed.');
}

function hostOf(url) {
  try {
    return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

function cleanUrl(value, label) {
  const v = String(value || '').trim();
  if (!v) return '';
  const host = hostOf(v);
  if (!host || !host.includes('.')) throw fail(400, `${label} doesn’t look like a web address`);
  const url = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`);
  if (!['http:', 'https:'].includes(url.protocol)) throw fail(400, `${label} must be a web address`);
  return url.href.slice(0, 200);
}

function cleanCompany(input = {}) {
  const text = (v, n) => String(v || '').trim().slice(0, n);
  const company = {
    name: text(input.name, 120),
    website: cleanUrl(input.website, 'Website'),
    linkedin: cleanUrl(input.linkedin, 'LinkedIn'),
    size: COMPANY_SIZES.includes(input.size) ? input.size : '',
    location: text(input.location, 120),
    about: text(input.about, 1500),
    contact_title: text(input.contact_title, 100),
  };
  if (!company.name) throw fail(400, 'Company name is required');
  return company;
}

// Automatic hints for the admin reviewing an employer.
function trustSignals(row) {
  const data = dataOf(row);
  const company = data.company || {};
  const emailDomain = String(row.email || '').split('@')[1]?.toLowerCase() || '';
  const websiteDomain = company.website ? hostOf(company.website) : null;
  const freeEmail = FREE_EMAIL_DOMAINS.has(emailDomain);
  const domainMatch = !!websiteDomain && !freeEmail
    && (emailDomain === websiteDomain || emailDomain.endsWith(`.${websiteDomain}`) || websiteDomain.endsWith(`.${emailDomain}`));
  const ageDays = Math.floor((Date.now() - Date.parse(row.created_date || 0)) / 86400000);
  const signals = [];
  if (domainMatch) signals.push({ level: 'good', text: `Work email matches company website (${websiteDomain})` });
  else if (freeEmail) signals.push({ level: 'warn', text: `Free email address (${emailDomain})` });
  else if (websiteDomain) signals.push({ level: 'warn', text: `Email domain (${emailDomain}) doesn’t match website (${websiteDomain})` });
  if (!company.website) signals.push({ level: 'warn', text: 'No company website' });
  if (row.email_verified) signals.push({ level: 'good', text: row.google_id ? 'Signed in with Google' : 'Email verified' });
  else signals.push({ level: 'warn', text: 'Email not verified' });
  if (!company.about) signals.push({ level: 'info', text: 'No company description' });
  if (Number.isFinite(ageDays)) signals.push({ level: 'info', text: ageDays < 1 ? 'Account created today' : `Account ${ageDays} day${ageDays === 1 ? '' : 's'} old` });
  return { email_domain: emailDomain, website_domain: websiteDomain, free_email: freeEmail, domain_match: domainMatch, signals };
}

// Company details shown publicly with an employer's jobs.
function publicCompany(userId) {
  const row = userId ? getUserById(userId) : null;
  if (!row) return null;
  const company = dataOf(row).company;
  if (!company?.name) return null;
  return {
    name: company.name,
    website: company.website || '',
    linkedin: company.linkedin || '',
    size: company.size || '',
    location: company.location || '',
    about: company.about || '',
    // Verified = approved by review, or the site's own admin account.
    verified: publicUser(row).role === 'admin'
      || (employerStatus(publicUser(row)) === 'approved' && !!dataOf(row).employer_reviewed_at),
  };
}

function adminEmails() {
  const fromEnv = (process.env.TB_ADMIN_EMAILS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  const fromDb = db.prepare("SELECT email FROM users WHERE role = 'admin'").all().map((r) => r.email.toLowerCase());
  return [...new Set([...fromEnv, ...fromDb])];
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admins only' });
  next();
}

function wrap(fn) {
  return async (req, res) => {
    try {
      res.json({ data: await fn(req) });
    } catch (e) {
      if (!e.status) { console.error('[employers]', e); require('./monitor').captureServerError(e, req); }
      res.status(e.status || 500).json({ error: e.status ? e.message : 'Something went wrong' });
    }
  };
}

function registerEmployerRoutes(app) {
  // --- The employer's own company profile ---------------------------------
  app.get('/api/employer/profile', authRequired, wrap((req) => {
    if (!['employer', 'admin'].includes(req.user.role)) throw fail(403, 'Employers only');
    const data = req.user.data || {};
    return {
      status: employerStatus(req.user),
      company: data.company || null,
      review_note: data.employer_review_note || null,
      submitted_at: data.employer_submitted_at || null,
      sizes: COMPANY_SIZES,
    };
  }));

  app.put('/api/employer/profile', authRequired, wrap(async (req) => {
    if (!['employer', 'admin'].includes(req.user.role)) throw fail(403, 'Employers only');
    const company = cleanCompany(req.body || {});
    const row = getUserById(req.user.id);
    const data = dataOf(row);
    const before = employerStatus(req.user);
    data.company = company;
    let submitted = false;
    if (req.user.role === 'employer' && before !== 'approved') {
      // Saving (or editing after a rejection) submits the profile for review.
      submitted = !data.employer_submitted_at || before === 'rejected';
      data.employer_status = 'pending';
      data.employer_submitted_at = new Date().toISOString();
      data.employer_review_note = null;
    }
    saveData(req.user.id, data);
    if (submitted) {
      const { notify } = require('./notifications');
      const { layout, appUrl } = require('./mailer');
      const signals = trustSignals(getUserById(req.user.id)).signals.map((s) => `${s.level === 'good' ? '✓' : s.level === 'warn' ? '!' : '·'} ${s.text}`);
      for (const to of adminEmails()) {
        await notify('employer_review_needed', {
          to,
          subject: `New employer to review: ${company.name}`,
          ...layout({
            heading: 'An employer is waiting for approval',
            paragraphs: [`${company.name}${company.website ? ` (${company.website})` : ''}: ${row.email}`, signals.join('\n')],
            button: { label: 'Review employers', url: appUrl('/admin') },
          }),
        }, { employer_id: req.user.id });
      }
    }
    return { status: employerStatus(publicUser(getUserById(req.user.id))), company };
  }));

  // --- Admin review ---------------------------------------------------------
  app.get('/api/admin/employers', authRequired, requireAdmin, wrap((req) => {
    const filter = String(req.query.status || 'pending');
    // Employers, plus admins who have a company profile (shown as approved;
    // admins never need review). Uses the effective role, so admins named
    // in TB_ADMIN_EMAILS are included too.
    const rows = db.prepare('SELECT * FROM users ORDER BY created_date DESC').all()
      .filter((row) => {
        const role = publicUser(row).role;
        return role === 'employer' || (role === 'admin' && dataOf(row).company?.name);
      });
    const jobs = store.all('Job');
    return rows
      .map((row) => {
        const data = dataOf(row);
        const isAdmin = publicUser(row).role === 'admin';
        const status = employerStatus(publicUser(row));
        return {
          id: row.id,
          is_admin: isAdmin,
          email: row.email,
          name: data.full_name || '',
          created_date: row.created_date,
          status,
          company: data.company || null,
          submitted_at: data.employer_submitted_at || null,
          reviewed_at: data.employer_reviewed_at || null,
          review_note: data.employer_review_note || null,
          jobs: jobs.filter((j) => j.created_by_id === row.id).map((j) => ({ id: j.id, title: j.title, status: j.status })),
          ...trustSignals(row),
        };
      })
      .filter((e) => filter === 'all' || e.status === filter)
      .sort((a, b) => String(b.submitted_at || b.created_date).localeCompare(String(a.submitted_at || a.created_date)));
  }));

  app.post('/api/admin/employers/:id/decision', authRequired, requireAdmin, wrap(async (req) => {
    const row = getUserById(req.params.id);
    if (!row) throw fail(404, 'Employer not found');
    if (publicUser(row).role === 'admin') throw fail(400, 'Admin accounts don’t need review');
    if (row.role !== 'employer') throw fail(404, 'Employer not found');
    const decision = req.body?.decision;
    if (!['approve', 'reject'].includes(decision)) throw fail(400, 'decision must be approve or reject');
    const note = String(req.body?.note || '').trim().slice(0, 1000);
    const data = dataOf(row);
    data.employer_status = decision === 'approve' ? 'approved' : 'rejected';
    data.employer_reviewed_at = new Date().toISOString();
    data.employer_reviewed_by = req.user.id;
    data.employer_review_note = note || null;
    saveData(row.id, data);
    require('./audit').audit(req.user, `employer.${decision}`, { type: 'user', id: row.id }, {
      email: row.email, company: data.company?.name || null, note: note || null,
    });

    let published = 0;
    if (decision === 'approve') {
      for (const job of store.all('Job')) {
        if (job.created_by_id === row.id && job.status === 'pending_review') {
          store.update('Job', job.id, { status: 'active' });
          published += 1;
        }
      }
    }
    const { notify } = require('./notifications');
    const { layout, appUrl } = require('./mailer');
    const companyName = data.company?.name || 'your company';
    await notify(decision === 'approve' ? 'employer_approved' : 'employer_rejected', {
      to: row.email,
      subject: decision === 'approve' ? `You’re approved on TalentBridge: ${companyName}` : `About your TalentBridge employer account`,
      ...layout(decision === 'approve'
        ? {
          heading: 'Your employer account is approved 🎉',
          paragraphs: [
            `${companyName} is verified on TalentBridge. You can now browse candidates, invite them to apply, and message applicants.`,
            published ? `${published} role${published === 1 ? '' : 's'} you drafted ${published === 1 ? 'is' : 'are'} now live on the job board.` : 'Post your first role to start receiving applications.',
            note ? `Note from the reviewer: ${note}` : '',
          ].filter(Boolean),
          button: { label: 'Open employer dashboard', url: appUrl('/employer') },
        }
        : {
          heading: 'We couldn’t approve your employer account yet',
          paragraphs: [
            `We weren’t able to verify ${companyName} from the details provided.`,
            note ? `Reviewer’s note: ${note}` : 'Adding a company website and a work email address that matches it usually helps.',
            'You can update your company profile and resubmit it for review at any time.',
          ],
          button: { label: 'Update company profile', url: appUrl('/company') },
        }),
    }, { employer_id: row.id, decision });
    return { status: data.employer_status, published };
  }));

  app.get('/api/admin/reports', authRequired, requireAdmin, wrap(() => {
    const rows = db.prepare('SELECT * FROM message_reports ORDER BY created_date DESC LIMIT 200').all();
    return rows.map((r) => {
      const app = store.get('JobApplication', r.application_id);
      const job = app ? store.get('Job', app.job_id) : null;
      const reporter = getUserById(r.reporter_id);
      return {
        id: r.id,
        application_id: r.application_id,
        created_date: r.created_date,
        reason: r.reason,
        reporter_email: reporter?.email || null,
        reporter_role: app && r.reporter_id === app.created_by_id ? 'candidate' : 'employer',
        job_title: job?.title || null,
        company: job?.company || null,
        candidate: app?.applicant_name || null,
      };
    });
  }));
}

module.exports = {
  registerEmployerRoutes, employerStatus, isApprovedEmployer, requireApprovedEmployer, publicCompany, adminEmails,
  COMPANY_SIZES,
};
