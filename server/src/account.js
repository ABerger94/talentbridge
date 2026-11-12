'use strict';
// Self-serve account controls promised by the Privacy Policy:
//   GET  /api/account/export   everything we hold about the caller, as JSON
//   POST /api/account/delete   deletes the account and personal data
// Deletion keeps the other party's side of shared records usable but
// anonymous: an employer still sees that a (deleted) candidate applied, a
// candidate still sees the role they applied to, and each person's own
// messages stay with them.
const bcrypt = require('bcryptjs');
const { db } = require('./db');
const { authRequired, getUserById, publicUser } = require('./auth');
const { store } = require('./entities');
const { hit } = require('./ratelimit');

function fail(status, message) {
  return Object.assign(new Error(message), { status });
}

const DAY = 24 * 60 * 60 * 1000;
const DELETED_NAME = 'Deleted user';

function applicationsFor(userId) {
  const mine = store.filter('JobApplication', { created_by_id: userId });
  const received = store.filter('JobApplication', { employer_user_id: userId });
  return { mine, received };
}

function exportData(user) {
  const row = getUserById(user.id);
  const pub = publicUser(row);
  const { signFileUrl } = require('./files');
  const profiles = store.filter('SeekerProfile', { created_by_id: user.id });
  const { mine, received } = applicationsFor(user.id);
  const appIds = [...mine, ...received].map((a) => a.id);
  const messages = appIds.length
    ? db.prepare(`SELECT application_id, sender_id, body, created_date FROM messages WHERE application_id IN (${appIds.map(() => '?').join(',')}) ORDER BY created_date`).all(...appIds)
      .map((m) => ({ application_id: m.application_id, from: m.sender_id === user.id ? 'you' : 'other party', body: m.body, sent: m.created_date }))
    : [];
  const profileIds = profiles.map((p) => p.id);
  const invitations = [
    ...store.filter('Invitation', { created_by_id: user.id }),
    ...profileIds.flatMap((id) => store.filter('Invitation', { seeker_profile_id: id })),
  ];
  const files = db.prepare('SELECT name, original_name, content_type, size, created_date FROM files WHERE created_by_id = ?').all(user.id)
    .map((f) => ({ ...f, download_link_valid_2h: signFileUrl(`/api/files/${f.name}`) }));
  return {
    exported_at: new Date().toISOString(),
    account: {
      id: pub.id, email: pub.email, role: pub.role, full_name: pub.full_name, email_verified: pub.email_verified,
      created_date: pub.created_date, employer_status: pub.employer_status,
      company: pub.data.company || null, job_alerts: pub.data.job_alerts || null,
    },
    seeker_profiles: profiles,
    applications_you_sent: mine,
    applications_to_your_roles: received,
    jobs_you_posted: store.filter('Job', { created_by_id: user.id }),
    invitations,
    messages,
    files,
    emails_sent_to_you: db.prepare('SELECT kind, status, created_date FROM notifications WHERE recipient = ? ORDER BY created_date DESC').all(pub.email),
  };
}

async function deleteAccount(user, { password, confirm }) {
  const row = getUserById(user.id);
  if (!row) throw fail(404, 'Account not found');
  if (user.role === 'admin') throw fail(403, 'Admin accounts can’t be deleted from here. Remove admin access first.');
  if (row.password_hash) {
    if (!(await bcrypt.compare(String(password || ''), row.password_hash))) throw fail(403, 'Your password is incorrect');
  } else if (String(confirm || '').trim().toLowerCase() !== row.email.toLowerCase()) {
    throw fail(400, 'Type your email address to confirm');
  }

  const uid = row.id;
  const counts = { profiles: 0, applications_anonymized: 0, jobs_deleted: 0, jobs_closed: 0, messages: 0, files: 0 };

  // Seeker side.
  for (const p of store.filter('SeekerProfile', { created_by_id: uid })) {
    for (const inv of store.filter('Invitation', { seeker_profile_id: p.id })) store.remove('Invitation', inv.id);
    db.prepare('DELETE FROM match_scores WHERE seeker_id = ?').run(p.id);
    store.remove('SeekerProfile', p.id);
    counts.profiles += 1;
  }
  for (const a of store.filter('JobApplication', { created_by_id: uid })) {
    store.update('JobApplication', a.id, {
      applicant_name: DELETED_NAME,
      applicant_email: null,
      resume_url: null,
      cover_letter: null,
      seeker_profile_id: null,
      status: 'withdrawn',
      account_deleted: true,
    });
    db.prepare("UPDATE records SET created_by_id = NULL WHERE entity = 'JobApplication' AND id = ?").run(a.id);
    counts.applications_anonymized += 1;
  }

  // Employer side: roles with applicants are closed (candidates keep their
  // history); roles without are removed.
  for (const job of store.filter('Job', { created_by_id: uid })) {
    db.prepare('DELETE FROM match_scores WHERE job_id = ?').run(job.id);
    if (store.filter('JobApplication', { job_id: job.id }).length) {
      store.update('Job', job.id, { status: 'closed', employer_deleted: true });
      db.prepare("UPDATE records SET created_by_id = NULL WHERE entity = 'Job' AND id = ?").run(job.id);
      counts.jobs_closed += 1;
    } else {
      store.remove('Job', job.id);
      counts.jobs_deleted += 1;
    }
  }
  for (const a of store.filter('JobApplication', { employer_user_id: uid })) {
    store.update('JobApplication', a.id, { employer_deleted: true });
  }
  for (const inv of store.filter('Invitation', { created_by_id: uid })) store.remove('Invitation', inv.id);

  // Messages, conversation state, reports, files, emails, codes.
  counts.messages = db.prepare('DELETE FROM messages WHERE sender_id = ?').run(uid).changes;
  db.prepare('DELETE FROM conversation_state WHERE user_id = ?').run(uid);
  db.prepare('DELETE FROM message_reports WHERE reporter_id = ?').run(uid);
  const { deleteFile } = require('./files');
  for (const f of db.prepare('SELECT name FROM files WHERE created_by_id = ?').all(uid)) {
    await deleteFile(f.name);
    counts.files += 1;
  }
  db.prepare('DELETE FROM notifications WHERE recipient = ?').run(row.email);
  db.prepare('DELETE FROM otps WHERE email = ?').run(row.email);
  db.prepare('DELETE FROM users WHERE id = ?').run(uid);

  // The audit entry keeps the account id only, not the email.
  require('./audit').audit({ id: uid }, 'account.deleted', { type: 'user', id: uid }, { role: row.role, ...counts });
  return { deleted: true, ...counts };
}

function registerAccountRoutes(app) {
  const wrap = (fn) => async (req, res) => {
    try {
      res.json({ data: await fn(req, res) });
    } catch (e) {
      if (!e.status) { console.error('[account]', e); require('./monitor').captureServerError(e, req); }
      res.status(e.status || 500).json({ error: e.status ? e.message : 'Something went wrong' });
    }
  };
  const limited = (name, max) => (req, res, next) => {
    const r = hit(`${name}:${req.user.id}`, max, DAY);
    if (!r.ok) return res.status(429).json({ error: 'Too many requests today. Please try again tomorrow.' });
    next();
  };

  app.get('/api/account/export', authRequired, limited('export', 10), (req, res) => {
    try {
      const data = exportData(req.user);
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="talentbridge-data-${new Date().toISOString().slice(0, 10)}.json"`);
      res.setHeader('Cache-Control', 'no-store');
      res.send(JSON.stringify(data, null, 2));
    } catch (e) {
      require('./monitor').captureServerError(e, req);
      res.status(500).json({ error: 'Your data couldn’t be exported. Please try again.' });
    }
  });

  app.post('/api/account/delete', authRequired, limited('delete', 10), wrap((req) => deleteAccount(req.user, req.body || {})));
}

module.exports = { registerAccountRoutes, exportData, deleteAccount };
