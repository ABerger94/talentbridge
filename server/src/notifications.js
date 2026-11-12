'use strict';
// Notifications: every one is recorded in the notifications table and, when
// a mail provider is configured, emailed. Shared by the hiring functions
// (candidate emails) and the record routes (employer emails).
const crypto = require('crypto');
const { db } = require('./db');
const { getUserById } = require('./auth');
const { sendMail, mailConfigured, layout, appUrl } = require('./mailer');

// Records every notification and emails it when a mail provider is set up.
// Email failures are recorded, never thrown: the hiring action has already
// happened and the candidate still sees it on their dashboard.
async function notify(kind, { to, subject, text, html, headers, attachments }, payload) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  let status = 'queued_no_mailer';
  let error = null;
  if (mailConfigured() && to) {
    const result = await sendMail({ to, subject, text, html, headers, attachments });
    status = result.ok ? 'sent' : 'failed';
    error = result.ok ? null : result.error;
  } else if (!to) {
    status = 'failed';
    error = 'no recipient email';
  }
  db.prepare(
    'INSERT INTO notifications (id, kind, payload, status, created_date, recipient, error, sent_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(id, kind, JSON.stringify(payload || {}), status, now, to || null, error, status === 'sent' ? now : null);
  console.log(`[notify] ${kind} -> ${status}${error ? ` (${error})` : ''}`);
  return status;
}

// Where to reach the candidate behind an application.
function applicantEmail(application) {
  if (application?.applicant_email) return application.applicant_email;
  return getUserById(application?.created_by_id)?.email || null;
}

function firstName(application) {
  const name = String(application?.applicant_name || '').trim();
  return name && name !== 'Anonymous' ? name.split(/\s+/)[0] : 'there';
}

function roleLine(job) {
  return job.company ? `${job.title} at ${job.company}` : job.title;
}

const DASHBOARD = () => appUrl('/dashboard');
const EMPLOYER_DASHBOARD = () => appUrl('/employer');

function applicantLabel(application) {
  const name = String(application?.applicant_name || '').trim();
  return name && name !== 'Anonymous' ? name : 'A candidate';
}

// Email the employer who owns `job`. `paragraphs` follow a greeting.
async function notifyEmployer(kind, job, { subject, heading, paragraphs, attachments }, payload) {
  const owner = getUserById(job?.created_by_id);
  return notify(kind, {
    to: owner?.email,
    subject,
    attachments,
    ...layout({
      heading,
      paragraphs,
      button: { label: 'Open employer dashboard', url: EMPLOYER_DASHBOARD() },
    }),
  }, { job_id: job?.id, ...payload });
}


module.exports = {
  notify, notifyEmployer, applicantEmail, applicantLabel, firstName, roleLine, DASHBOARD, EMPLOYER_DASHBOARD, layout, appUrl,
};
