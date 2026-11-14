'use strict';
// Outbound email. Providers are tried in order and the first success wins;
// each is enabled only when its env vars are set:
//   resend  RESEND_API_KEY            (needs a verified domain to email anyone)
//   brevo   BREVO_API_KEY             (a single verified sender address is enough)
//   smtp    TB_SMTP_HOST, TB_SMTP_USER, TB_SMTP_PASS, optional TB_SMTP_PORT
//           (e.g. Gmail: smtp.gmail.com + an App Password)
// TB_MAIL_FROM sets the sender ("TalentBridge <hello@yourdomain.com>"); for
// SMTP it defaults to TB_SMTP_USER. TB_MAIL_REPLY_TO is optional.
// Order can be changed with TB_MAIL_ORDER (default resend,brevo,smtp).

const DEFAULT_ORDER = ['resend', 'brevo', 'smtp'];
const TIMEOUT_MS = 15000;

function env(name) {
  return (process.env[name] || '').trim();
}

function fromAddress(provider) {
  return env('TB_MAIL_FROM') || (provider === 'smtp' ? env('TB_SMTP_USER') : '');
}

// "Name <addr@x>" or "addr@x" -> { name, email }
function parseAddress(value) {
  const m = String(value).match(/^\s*(.*?)\s*<\s*([^>]+)\s*>\s*$/);
  if (m) return { name: m[1].replace(/^"|"$/g, '') || undefined, email: m[2] };
  return { name: undefined, email: String(value).trim() };
}

const PROVIDERS = {
  resend: {
    enabled: () => !!env('RESEND_API_KEY') && !!fromAddress('resend'),
    async send(msg) {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: fromAddress('resend'),
          to: [msg.to],
          subject: msg.subject,
          text: msg.text,
          html: msg.html,
          ...(env('TB_MAIL_REPLY_TO') ? { reply_to: env('TB_MAIL_REPLY_TO') } : {}),
          ...(msg.headers ? { headers: msg.headers } : {}),
          ...(msg.attachments?.length ? {
            attachments: msg.attachments.map((a) => ({ filename: a.filename, content: Buffer.from(a.content).toString('base64') })),
          } : {}),
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`Resend HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    },
  },
  brevo: {
    enabled: () => !!env('BREVO_API_KEY') && !!fromAddress('brevo'),
    async send(msg) {
      const sender = parseAddress(fromAddress('brevo'));
      const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': env('BREVO_API_KEY'), 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          sender,
          to: [{ email: msg.to }],
          subject: msg.subject,
          textContent: msg.text,
          htmlContent: msg.html,
          ...(env('TB_MAIL_REPLY_TO') ? { replyTo: parseAddress(env('TB_MAIL_REPLY_TO')) } : {}),
          ...(msg.headers ? { headers: msg.headers } : {}),
          ...(msg.attachments?.length ? {
            attachment: msg.attachments.map((a) => ({ name: a.filename, content: Buffer.from(a.content).toString('base64') })),
          } : {}),
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`Brevo HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    },
  },
  smtp: {
    enabled: () => !!env('TB_SMTP_HOST') && !!env('TB_SMTP_USER') && !!env('TB_SMTP_PASS'),
    async send(msg) {
      const nodemailer = require('nodemailer');
      const port = parseInt(env('TB_SMTP_PORT') || '465', 10);
      const transport = nodemailer.createTransport({
        host: env('TB_SMTP_HOST'),
        port,
        secure: port === 465,
        auth: { user: env('TB_SMTP_USER'), pass: env('TB_SMTP_PASS') },
        connectionTimeout: TIMEOUT_MS,
        greetingTimeout: TIMEOUT_MS,
        socketTimeout: TIMEOUT_MS,
      });
      await transport.sendMail({
        from: fromAddress('smtp'),
        to: msg.to,
        subject: msg.subject,
        text: msg.text,
        html: msg.html,
        ...(env('TB_MAIL_REPLY_TO') ? { replyTo: env('TB_MAIL_REPLY_TO') } : {}),
        ...(msg.headers ? { headers: msg.headers } : {}),
        ...(msg.attachments?.length ? {
          attachments: msg.attachments.map((a) => ({ filename: a.filename, content: a.content, contentType: a.contentType })),
        } : {}),
      });
    },
  },
};

function providerOrder() {
  const custom = (env('TB_MAIL_ORDER') || '').split(',').map((x) => x.trim().toLowerCase()).filter((x) => PROVIDERS[x]);
  return [...new Set([...custom, ...DEFAULT_ORDER])];
}

function activeProviders() {
  return providerOrder().filter((id) => PROVIDERS[id].enabled());
}

function mailConfigured() {
  return activeProviders().length > 0;
}

function mailStatus() {
  return { configured: mailConfigured(), providers: activeProviders() };
}

// Returns { ok: true, provider } or { ok: false, error }. Never throws, so a
// failed email never fails the action that triggered it.
// Optional: headers (e.g. List-Unsubscribe) and attachments
// ([{ filename, content (string|Buffer), contentType }], e.g. calendar invites).
async function sendMail({ to, subject, text, html, headers, attachments }) {
  if (!to) return { ok: false, error: 'no recipient' };
  const providers = activeProviders();
  if (!providers.length) return { ok: false, error: 'no mail provider configured' };
  const errors = [];
  for (const id of providers) {
    try {
      await PROVIDERS[id].send({ to, subject, text, html: html || undefined, headers, attachments });
      return { ok: true, provider: id };
    } catch (e) {
      errors.push(`${id}: ${e.message}`);
      console.warn(`[mail] ${id} failed — ${e.message}`);
    }
  }
  return { ok: false, error: errors.join(' | ').slice(0, 500) };
}

// --- Templates -------------------------------------------------------------

function appUrl(path = '/') {
  const base = (env('TB_APP_URL') || 'https://talentbridge-jobboard.vercel.app').replace(/\/$/, '');
  return `${base}${path}`;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Paragraphs are plain strings (escaped here); an optional button links into the app.
// linkify turns web addresses in paragraphs into links; footer replaces the
// default "why you got this" line.
const LINK = /\bhttps?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]]/g;
function layout({ heading, paragraphs, button, linkify = false, footer }) {
  const text = [heading, '', ...paragraphs.flatMap((p) => [p, '']), button ? `${button.label}: ${button.url}` : '', '', '— TalentBridge']
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  const html = `<!doctype html><html><body style="margin:0;background:#f6f5f2;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1c1b22">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;padding:28px">
<tr><td style="font-size:18px;font-weight:700;color:#5b2bd9;padding-bottom:16px">TalentBridge</td></tr>
<tr><td style="font-size:20px;font-weight:700;padding-bottom:12px">${esc(heading)}</td></tr>
${paragraphs.map((p) => {
    let body = esc(p);
    if (linkify) body = body.replace(LINK, (u) => `<a href="${u}" style="color:#5b2bd9">${u}</a>`);
    return `<tr><td style="font-size:15px;line-height:1.55;padding-bottom:12px">${body.replace(/\n/g, '<br>')}</td></tr>`;
  }).join('')}
${button ? `<tr><td style="padding:8px 0 4px"><a href="${esc(button.url)}" style="display:inline-block;background:#5b2bd9;color:#ffffff;text-decoration:none;font-weight:600;padding:11px 20px;border-radius:8px">${esc(button.label)}</a></td></tr>` : ''}
</table>
<p style="font-size:12px;color:#8a8796;margin:16px 0 0">${esc(footer || 'You received this email because of activity on your TalentBridge account.')}</p>
</td></tr></table></body></html>`;
  return { text, html };
}

function codeEmail(code, purpose) {
  const isReset = purpose === 'reset';
  const heading = isReset ? 'Reset your password' : 'Verify your email';
  const body = layout({
    heading,
    paragraphs: [
      `Your ${isReset ? 'password reset' : 'verification'} code is: ${code}`,
      'It expires in 10 minutes. If you didn’t request this, you can ignore this email.',
    ],
  });
  return { subject: `${code} is your TalentBridge ${isReset ? 'reset' : 'verification'} code`, ...body };
}

module.exports = { sendMail, mailConfigured, mailStatus, layout, appUrl, codeEmail };
