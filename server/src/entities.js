'use strict';
const crypto = require('crypto');
const { db } = require('./db');
const { can } = require('./rls');
const { authRequired, optionalAuth, getUserById } = require('./auth');

// Entities whose list/read endpoints anonymous visitors may call. RLS still
// decides which rows they see (Job: only status='active').
const PUBLIC_READ = ['Job'];

const ENTITIES = ['SeekerProfile', 'Job', 'JobApplication', 'Invitation'];

function rowToRecord(row) {
  if (!row) return null;
  return {
    ...JSON.parse(row.data || '{}'),
    id: row.id,
    created_by_id: row.created_by_id,
    created_date: row.created_date,
    updated_date: row.updated_date,
  };
}

function getRecord(entity, id) {
  const row = db
    .prepare('SELECT * FROM records WHERE entity = ? AND id = ?')
    .get(entity, id);
  return rowToRecord(row);
}

function allRecords(entity) {
  return db
    .prepare('SELECT * FROM records WHERE entity = ? ORDER BY created_date DESC')
    .all(entity)
    .map(rowToRecord);
}

// Indexes for the lookups the app makes most (owner, job, employer, seeker,
// status). Record fields live in the JSON `data` column, so these are
// expression indexes on json_extract — the same expressions sqlFilter emits.
const INDEXED_FIELDS = ['job_id', 'employer_user_id', 'seeker_profile_id', 'status', 'source_id'];
db.exec(`
CREATE INDEX IF NOT EXISTS records_entity_owner ON records (entity, created_by_id);
${INDEXED_FIELDS.map((f) => `CREATE INDEX IF NOT EXISTS records_${f} ON records (entity, json_extract(data, '$.${f}'));`).join('\n')}
`);

// Equality criteria are pushed into SQL so the database (and its indexes)
// does the narrowing instead of loading every row of the entity. Values
// SQL can't compare exactly (booleans, objects, null) are left to
// matches(), which still runs on every row returned.
function filterRecords(entity, criteria = {}) {
  const where = ['entity = ?'];
  const args = [entity];
  for (const [key, value] of Object.entries(criteria || {})) {
    if (!/^[A-Za-z0-9_]+$/.test(key)) continue;
    if (typeof value !== 'string' && !(typeof value === 'number' && Number.isFinite(value))) continue;
    if (key === 'id' || key === 'created_by_id') where.push(`${key} = ?`);
    else where.push(`json_extract(data, '$.${key}') = ?`);
    args.push(value);
  }
  return db
    .prepare(`SELECT * FROM records WHERE ${where.join(' AND ')} ORDER BY created_date DESC`)
    .all(...args)
    .map(rowToRecord)
    .filter((r) => matches(r, criteria));
}

// Internal (service-role) access for backend functions — bypasses RLS the
// same way Base44's asServiceRole did. Only server code may call these.
const store = {
  get: getRecord,
  all: allRecords,
  filter: filterRecords,
  create(entity, data, createdById) {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    db.prepare(
      'INSERT INTO records (entity, id, created_by_id, created_date, updated_date, data) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(entity, id, createdById || null, now, now, JSON.stringify(data || {}));
    const created = getRecord(entity, id);
    if (entity === 'Job') require('./jobindex').upsertJob(created);
    return created;
  },
  update(entity, id, data) {
    const existing = getRecord(entity, id);
    if (!existing) return null;
    const { id: _id, created_by_id, created_date, updated_date, ...fields } = existing;
    const merged = { ...fields, ...(data || {}) };
    db.prepare('UPDATE records SET data = ?, updated_date = ? WHERE entity = ? AND id = ?').run(
      JSON.stringify(merged),
      new Date().toISOString(),
      entity,
      id
    );
    const updated = getRecord(entity, id);
    if (entity === 'Job') require('./jobindex').upsertJob(updated);
    return updated;
  },
  remove(entity, id) {
    db.prepare('DELETE FROM records WHERE entity = ? AND id = ?').run(entity, id);
    if (entity === 'Job') require('./jobindex').removeJob(id);
  },
};

function matches(record, criteria) {
  for (const [key, value] of Object.entries(criteria || {})) {
    if (record[key] !== value) return false;
  }
  return true;
}

// --- Applicant identity -------------------------------------------------
// Applications show the applicant's name to the employer. The name comes
// from the seeker's profile (falling back to the account name), stamped
// server-side so every way of applying gets it, and refreshed on read so a
// name added later also shows on older applications.

function userFullName(userId) {
  const row = userId ? getUserById(userId) : null;
  if (!row) return '';
  try {
    return String(JSON.parse(row.data || '{}').full_name || '').trim();
  } catch {
    return '';
  }
}

function ownSeekerProfile(userId, requestedId) {
  if (requestedId) {
    const p = getRecord('SeekerProfile', requestedId);
    if (p && p.created_by_id === userId) return p;
  }
  return filterRecords('SeekerProfile', { created_by_id: userId })[0] || null;
}

function applicantName(profile, userId) {
  return String(profile?.full_name || '').trim() || userFullName(userId);
}

function withApplicantName(record, cache) {
  if (!record) return record;
  const key = record.seeker_profile_id || `user:${record.created_by_id}`;
  if (!cache.has(key)) {
    const profile = record.seeker_profile_id ? getRecord('SeekerProfile', record.seeker_profile_id) : null;
    cache.set(key, applicantName(profile, record.created_by_id));
  }
  const name = cache.get(key);
  const out = name ? { ...record, applicant_name: name } : { ...record };
  // Older offers were saved as 'offer_extended', which no screen knows.
  if (out.status === 'offer_extended') out.status = 'offered';
  return out;
}

// Keep the account's display name in step with the seeker profile name.
function syncUserFullName(userId, fullName) {
  const name = String(fullName || '').trim();
  if (!name) return;
  const row = getUserById(userId);
  if (!row) return;
  const data = JSON.parse(row.data || '{}');
  if (data.full_name === name) return;
  data.full_name = name;
  db.prepare('UPDATE users SET data = ? WHERE id = ?').run(JSON.stringify(data), userId);
}

// --- File fields -----------------------------------------------------------
// resume_url points at a private upload. Stored canonical (/api/files/<name>);
// handed out signed, and only to readers allowed to open the file.
function filesApi() {
  return require('./files'); // lazy: files.js loads after this module
}

// Normalizes resume_url on a write. Returns an error message or null.
function checkResumeWrite(entity, data, user, existing) {
  if (!('resume_url' in data)) return null;
  if (!data.resume_url) {
    data.resume_url = null;
    return null;
  }
  const { canonicalFileUrl, canAttachFile } = filesApi();
  const canonical = canonicalFileUrl(data.resume_url);
  if (!canonical) return 'resume_url must be an uploaded file';
  const unchanged = existing && canonicalFileUrl(existing.resume_url || '') === canonical;
  if (!unchanged && !canAttachFile(user, canonical)) return 'resume_url must be a file you uploaded';
  data.resume_url = canonical;
  return null;
}

// --- Write rules beyond RLS ---------------------------------------------------
const JOB_STATUSES = ['active', 'paused', 'closed'];
const EMPLOYER_APP_STATUSES = ['applied', 'reviewed', 'shortlisted', 'interview', 'offered', 'rejected'];
// Fields each party may change directly on an application. Candidate
// responses, withdrawal, offers and interviews go through /api/functions so
// they're validated and the other side is notified.
const APPLICANT_FIELDS = ['cover_letter'];
// AI scores and summaries are written only by the server (assessApplication).
const EMPLOYER_FIELDS = ['status', 'employer_notes'];
// Base44-era metadata the client may echo back unchanged.
const IGNORED_FIELDS = ['id', 'created_by_id', 'created_date', 'updated_date', 'created_by', 'job'];

// Returns an error message, or null when the change is allowed. Mutates
// `changes` to drop echoed fields that didn't actually change.
function checkUpdate(entity, record, changes, user) {
  for (const k of IGNORED_FIELDS) delete changes[k];
  for (const k of Object.keys(changes)) {
    if (JSON.stringify(changes[k]) === JSON.stringify(record[k])) delete changes[k];
  }
  if (user.role === 'admin') return null;
  const keys = Object.keys(changes);
  if (entity === 'Job') {
    if ('status' in changes) {
      if (!JOB_STATUSES.includes(changes.status)) return 'Invalid job status';
      const { isApprovedEmployer } = require('./employers');
      if (!isApprovedEmployer(user) && changes.status !== 'closed') {
        return 'Your roles go live once your employer account is approved.';
      }
      if (record.status === 'pending_review' && changes.status !== 'closed') {
        return 'This role goes live once your employer account is approved.';
      }
    }
    return null;
  }
  if (entity === 'JobApplication') {
    const isEmployer = record.employer_user_id === user.id;
    const isApplicant = record.created_by_id === user.id;
    const allowed = isEmployer ? EMPLOYER_FIELDS : isApplicant ? APPLICANT_FIELDS : [];
    const extra = keys.filter((k) => !allowed.includes(k));
    if (extra.length) {
      return isApplicant
        ? 'Use the buttons on your dashboard to respond, accept, or withdraw.'
        : `These fields can't be changed here: ${extra.join(', ')}`;
    }
    if (isEmployer && 'status' in changes) {
      if (record.status === 'withdrawn') return 'This candidate withdrew their application.';
      if (!EMPLOYER_APP_STATUSES.includes(changes.status)) return 'Invalid status';
    }
    return null;
  }
  if (entity === 'Invitation') {
    const isInvitee = record.seeker_profile_id && record.seeker_profile_id === user.data?.seeker_profile_id;
    if (isInvitee) {
      if (keys.some((k) => k !== 'status') || !['accepted', 'declined'].includes(changes.status)) {
        return 'You can only accept or decline an invitation.';
      }
      return null;
    }
    if (keys.length) return 'Invitations can only be answered by the invited seeker.';
    return null;
  }
  return null;
}

// Employers see seeker profiles only once approved.
function hidesSeekers(user) {
  if (!user || user.role !== 'employer') return false;
  return !require('./employers').isApprovedEmployer(user);
}

// Whether `user` may see someone else's seeker profile: admins always;
// approved employers only when it's complete and visible (listable), or the
// seeker applied to one of their jobs. Owners always see their own.
function canSeeSeeker(user, profile) {
  if (!user || !profile) return false;
  if (profile.created_by_id === user.id || user.role === 'admin') return true;
  if (user.role !== 'employer' || hidesSeekers(user)) return false;
  if (require('./completeness').isListable(profile)) return true;
  return filterRecords('JobApplication', { seeker_profile_id: profile.id, employer_user_id: user.id }).length > 0;
}

// Short job summary attached to applications and invitations, so a seeker
// still sees what they applied to after the role is closed (closed jobs are
// otherwise hidden from them).
function jobSummary(jobId, cache) {
  const key = `job:${jobId}`;
  if (!cache.has(key)) {
    const j = jobId ? getRecord('Job', jobId) : null;
    cache.set(key, j ? { id: j.id, title: j.title, company: j.company, location: j.location, status: j.status } : null);
  }
  return cache.get(key);
}

// What `user` gets to see of a record (after RLS already allowed the read).
function present(entity, record, user, cache = new Map()) {
  if (!record) return record;
  let out = entity === 'JobApplication' ? withApplicantName(record, cache) : { ...record };
  if ((entity === 'JobApplication' || entity === 'Invitation') && out.job_id) {
    out.job = jobSummary(out.job_id, cache);
  }
  if (entity === 'JobApplication' && out.seeker_profile_id) {
    const key = `links:${out.seeker_profile_id}`;
    if (!cache.has(key)) cache.set(key, require('./links').profileLinks(getRecord('SeekerProfile', out.seeker_profile_id)));
    out.seeker_links = cache.get(key);
  }
  // The employer's private notes never reach the candidate.
  if (entity === 'JobApplication' && !(user && (user.id === out.employer_user_id || user.role === 'admin'))) {
    delete out.employer_notes;
  }
  if (entity === 'Job') {
    const key = `company:${out.created_by_id}`;
    if (!cache.has(key)) cache.set(key, require('./employers').publicCompany(out.created_by_id));
    out.company_profile = cache.get(key);
  }
  if (out.resume_url) {
    const { signFileUrl } = filesApi();
    const isOwner = user && out.created_by_id === user.id;
    const isAdmin = user && user.role === 'admin';
    if (entity === 'JobApplication') {
      // Readers of an application are its applicant, the job's employer, or admin.
      out.resume_url = signFileUrl(out.resume_url);
    } else if (entity === 'SeekerProfile' && (isOwner || isAdmin)) {
      out.resume_url = signFileUrl(out.resume_url);
    } else {
      // Employers browsing seekers see the resume only on applications.
      delete out.resume_url;
    }
  }
  return out;
}

function registerEntityRoutes(app) {
  // Anonymous GETs are allowed for PUBLIC_READ entities only; everything else
  // (and every write) requires a valid session.
  app.use('/api/entities/:entity', (req, res, next) => {
    if (req.method === 'GET' && PUBLIC_READ.includes(req.params.entity)) {
      return optionalAuth(req, res, next);
    }
    return authRequired(req, res, next);
  });

  app.post('/api/entities/:entity', async (req, res) => {
    const { entity } = req.params;
    if (!ENTITIES.includes(entity)) return res.status(404).json({ error: 'Unknown entity' });
    const probe = { ...(req.body || {}), created_by_id: req.user.id };
    if (!can(entity, 'create', req.user, probe)) {
      return res.status(403).json({ error: `Permission denied for create operation on ${entity} entity` });
    }
    const body = { ...(req.body || {}) };
    if (entity === 'Job') {
      const { isApprovedEmployer } = require('./employers');
      if (!isApprovedEmployer(req.user)) body.status = 'pending_review'; // goes live on approval
      else if (!JOB_STATUSES.includes(body.status)) body.status = 'active';
    }
    if (entity === 'JobApplication') {
      // employer_user_id drives the employer's RLS read/update branch; derive
      // it from the job's owner server-side rather than trusting the client.
      const job = body.job_id ? getRecord('Job', body.job_id) : null;
      if (!job) return res.status(400).json({ error: 'job_id must reference an existing job' });
      if (job.imported) {
        return res.status(409).json({ error: `This role is listed from ${job.company || 'the employer'}'s own site. Use “Apply on company site” to apply there.`, code: 'external_job' });
      }
      if (job.status !== 'active' && req.user.role !== 'admin') {
        return res.status(409).json({ error: 'This role is no longer accepting applications.' });
      }
      const already = filterRecords('JobApplication', { job_id: job.id, created_by_id: req.user.id })
        .find((a) => a.status !== 'withdrawn');
      if (already) return res.status(409).json({ error: 'You’ve already applied to this role.' });
      body.employer_user_id = job.created_by_id || null;
      body.status = 'applied';
      // Identity comes from the applicant's own account and profile, never
      // from another seeker's profile id.
      const profile = ownSeekerProfile(req.user.id, body.seeker_profile_id);
      if (req.user.role !== 'admin') {
        const { profileCompleteness } = require('./completeness');
        const c = profileCompleteness(profile || {});
        if (!profile || !c.complete) {
          const missing = profile ? c.missing : ['your profile'];
          return res.status(409).json({
            error: `Finish your profile to apply: add ${missing.join(', ')}.`,
            code: 'profile_incomplete',
            missing,
          });
        }
      }
      body.seeker_profile_id = profile ? profile.id : null;
      body.applicant_name = applicantName(profile, req.user.id) || String(body.applicant_name || '').trim() || 'Anonymous';
      body.applicant_email = req.user.email;
      // The resume comes from the applicant's own profile, never the request.
      body.resume_url = profile?.resume_url || null;
    } else {
      const bad = checkResumeWrite(entity, body, req.user, null);
      if (bad) return res.status(400).json({ error: bad });
    }
    if (entity === 'SeekerProfile') {
      // New profiles take the account's name (e.g. from Google) unless given one.
      body.full_name = String(body.full_name || '').trim().slice(0, 120) || userFullName(req.user.id);
    }
    if (entity === 'SeekerProfile' && 'professional_links' in body) {
      try {
        body.professional_links = require('./links').normalizeLinks(body.professional_links || []);
      } catch (e) {
        return res.status(e.status || 400).json({ error: e.message });
      }
    }
    const record = store.create(entity, body, req.user.id);
    // Keep user.data.seeker_profile_id current so Invitation read rules can
    // resolve {{user.data.seeker_profile_id}} like Base44 did.
    if (entity === 'SeekerProfile') {
      const userRow = getUserById(req.user.id);
      const data = JSON.parse(userRow.data || '{}');
      data.seeker_profile_id = record.id;
      db.prepare('UPDATE users SET data = ? WHERE id = ?').run(JSON.stringify(data), req.user.id);
      syncUserFullName(req.user.id, record.full_name);
    }
    if (entity === 'JobApplication') {
      const job = getRecord('Job', record.job_id);
      const { notifyEmployer, applicantLabel } = require('./notifications');
      const who = applicantLabel(record);
      await notifyEmployer('new_application', job, {
        subject: `New applicant for ${job.title}: ${who}`,
        heading: 'You have a new applicant',
        paragraphs: [
          `${who} applied for ${job.title}.`,
          'Open your dashboard to review their profile, resume, and AI capability assessment.',
        ],
      }, { application_id: record.id });
    }
    res.json({ data: present(entity, record, req.user) });
  });

  app.get('/api/entities/:entity', (req, res) => {
    const { entity } = req.params;
    if (!ENTITIES.includes(entity)) return res.status(404).json({ error: 'Unknown entity' });
    let criteria = {};
    try {
      criteria = req.query.filter ? JSON.parse(req.query.filter) : {};
    } catch {
      return res.status(400).json({ error: 'Invalid filter' });
    }
    const limit = Math.min(parseInt(req.query.limit || '1000', 10) || 1000, 5000);
    const skip = Math.max(parseInt(req.query.skip || '0', 10) || 0, 0);
    let visible = store
      .filter(entity, criteria)
      .filter((r) => can(entity, 'read', req.user, r))
      .slice(skip, skip + limit);
    if (entity === 'SeekerProfile') {
      visible = visible.filter((r) => canSeeSeeker(req.user, r));
    }
    // Imported listings are served by /api/jobs/search; the generic list
    // only returns them when asked for by id.
    if (entity === 'Job' && !('id' in criteria)) visible = visible.filter((r) => !r.imported);
    const cache = new Map();
    visible = visible.map((r) => present(entity, r, req.user, cache));
    res.json({ data: visible });
  });

  app.get('/api/entities/:entity/:id', (req, res) => {
    const { entity, id } = req.params;
    if (!ENTITIES.includes(entity)) return res.status(404).json({ error: 'Unknown entity' });
    const record = getRecord(entity, id);
    if (!record || !can(entity, 'read', req.user, record)
        || (entity === 'SeekerProfile' && !canSeeSeeker(req.user, record))) {
      return res.status(404).json({ error: 'Not found' });
    }
    if (entity === 'Job') require('./jobstats').recordView(req, record);
    res.json({ data: present(entity, record, req.user) });
  });

  app.put('/api/entities/:entity/:id', async (req, res) => {
    const { entity, id } = req.params;
    if (!ENTITIES.includes(entity)) return res.status(404).json({ error: 'Unknown entity' });
    const record = getRecord(entity, id);
    if (!record) return res.status(404).json({ error: 'Not found' });
    if (!can(entity, 'update', req.user, record)) {
      return res.status(403).json({ error: `Permission denied for update operation on ${entity} entity` });
    }
    const changes = { ...(req.body || {}) };
    const denied = checkUpdate(entity, record, changes, req.user);
    if (denied) return res.status(403).json({ error: denied });
    const bad = checkResumeWrite(entity, changes, req.user, record);
    if (bad) return res.status(400).json({ error: bad });
    if (entity === 'SeekerProfile' && 'full_name' in changes) {
      changes.full_name = String(changes.full_name || '').trim().slice(0, 120);
      if (!changes.full_name) return res.status(400).json({ error: 'Your full name is required' });
    }
    if (entity === 'SeekerProfile' && 'professional_links' in changes) {
      try {
        changes.professional_links = require('./links').normalizeLinks(changes.professional_links || []);
      } catch (e) {
        return res.status(e.status || 400).json({ error: e.message });
      }
    }
    const updated = store.update(entity, id, changes);
    if (entity === 'SeekerProfile' && updated.created_by_id === req.user.id) {
      syncUserFullName(req.user.id, updated.full_name);
    }
    if (entity === 'Invitation' && changes.status === 'declined' && record.status !== 'declined') {
      const job = getRecord('Job', record.job_id);
      const profile = getRecord('SeekerProfile', record.seeker_profile_id);
      const { notifyEmployer } = require('./notifications');
      const who = String(profile?.full_name || '').trim() || 'A candidate';
      if (job) {
        await notifyEmployer('invitation_declined', job, {
          subject: `${who} declined your invitation: ${job.title}`,
          heading: 'Invitation declined',
          paragraphs: [`${who} declined your invitation to apply for ${job.title}.`],
        }, { invitation_id: record.id });
      }
    }
    res.json({ data: present(entity, updated, req.user) });
  });

  app.delete('/api/entities/:entity/:id', (req, res) => {
    const { entity, id } = req.params;
    if (!ENTITIES.includes(entity)) return res.status(404).json({ error: 'Unknown entity' });
    const record = getRecord(entity, id);
    if (!record) return res.status(404).json({ error: 'Not found' });
    if (!can(entity, 'delete', req.user, record)) {
      return res.status(403).json({ error: `Permission denied for delete operation on ${entity} entity` });
    }
    if (entity === 'Job' && req.user.role !== 'admin') {
      const hasApplicants = filterRecords('JobApplication', { job_id: id }).length > 0;
      if (hasApplicants) {
        return res.status(409).json({ error: 'This role has applicants, so it can’t be deleted. Close it instead.' });
      }
    }
    store.remove(entity, id);
    res.json({ success: true });
  });
}

module.exports = { registerEntityRoutes, store, present };
