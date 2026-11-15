'use strict';
// Where new accounts come from, so the owner can see which outreach works:
// the campaign link someone arrived through (utm_* tags, kept in the browser
// for 30 days) and, if they answer it, "How did you hear about TalentBridge?"
// at onboarding. Saved once on the account (users.data.acquisition).
const { db } = require('./db');

const HEARD_FROM = {
  friend: 'A friend or coworker',
  linkedin: 'LinkedIn',
  facebook: 'Facebook',
  x: 'X (Twitter)',
  instagram: 'Instagram',
  search: 'Google or another search',
  job_center: 'A job center, school or program',
  employer: 'An employer',
  news: 'News, a podcast or an article',
  other: 'Somewhere else',
};

const tag = (v, n = 80) => {
  const s = String(v ?? '').trim().toLowerCase().replace(/[^a-z0-9 ._\-/:]/g, '').slice(0, n);
  return s || null;
};

// Only known keys, short and plain, from what the browser sends.
function cleanAcquisition({ heard_from, acquisition } = {}) {
  const a = acquisition && typeof acquisition === 'object' ? acquisition : {};
  const out = {
    heard_from: HEARD_FROM[heard_from] ? heard_from : null,
    utm_source: tag(a.utm_source), utm_medium: tag(a.utm_medium), utm_campaign: tag(a.utm_campaign), utm_content: tag(a.utm_content),
    referrer: tag(a.referrer, 120), landing: tag(a.landing, 120),
  };
  for (const k of Object.keys(out)) if (out[k] == null) delete out[k];
  return Object.keys(out).length ? { ...out, recorded_at: new Date().toISOString() } : null;
}

// Adds it to a user's data the first time only.
function withAcquisition(data, body) {
  if (data.acquisition) return data;
  const acq = cleanAcquisition(body);
  return acq ? { ...data, acquisition: acq } : data;
}

// Signups in the last `days`, by what they said and by campaign link.
function sourcesSummary(days = 30) {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const rows = db.prepare("SELECT json_extract(data, '$.acquisition') AS a FROM users WHERE created_date >= ? AND role != 'admin'").all(since);
  const count = (key) => {
    const m = {};
    for (const r of rows) {
      let a = null;
      try { a = r.a ? JSON.parse(r.a) : null; } catch { a = null; }
      const v = a?.[key] || (key === 'utm_source' && a?.referrer ? `referral: ${a.referrer}` : null) || 'unknown';
      m[v] = (m[v] || 0) + 1;
    }
    return Object.entries(m).sort((x, y) => y[1] - x[1]).map(([value, signups]) => ({ value, label: HEARD_FROM[value] || value, signups }));
  };
  return { days, signups: rows.length, heard_from: count('heard_from'), source: count('utm_source'), campaign: count('utm_campaign') };
}

module.exports = { HEARD_FROM, cleanAcquisition, withAcquisition, sourcesSummary };
