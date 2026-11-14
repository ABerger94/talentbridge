'use strict';
// Search engines and link previews (LinkedIn, Slack, iMessage) don't run the
// app's JavaScript, so job pages are served with their real <head>: title,
// description, Open Graph tags, and schema.org JobPosting data for Google's
// job search. Plus /sitemap.xml. On Vercel, vercel.json routes /jobs/:id and
// /sitemap.xml to this server; the page itself is the normal app.
const fs = require('fs');
const path = require('path');
const { store } = require('./entities');
const { appUrl } = require('./mailer');

const DIST_INDEX = path.join(__dirname, '..', '..', 'dist', 'index.html');
const TEMPLATE_TTL_MS = 5 * 60 * 1000;
let cached = { html: null, at: 0 };

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const oneLine = (s, n) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1).replace(/\s+\S*$/, '')}…` : t;
};

// The built app's index.html: from disk when bundled, else from the site.
async function template(req) {
  if (cached.html && Date.now() - cached.at < TEMPLATE_TTL_MS) return cached.html;
  let html = null;
  try { html = fs.readFileSync(DIST_INDEX, 'utf8'); } catch { /* not bundled */ }
  if (!html) {
    const res = await fetch(`${req.protocol}://${req.get('host')}/`, { signal: AbortSignal.timeout(5000) });
    if (res.ok) html = await res.text();
  }
  if (!html || !html.includes('</head>')) throw new Error('App page template unavailable');
  cached = { html, at: Date.now() };
  return html;
}

const EMPLOYMENT = { full_time: 'FULL_TIME', part_time: 'PART_TIME', contract: 'CONTRACTOR', internship: 'INTERN', freelance: 'CONTRACTOR', temporary: 'TEMPORARY' };
const US_STATES = /^(A[LKZR]|C[AOT]|D[EC]|FL|GA|HI|I[ADLN]|K[SY]|LA|M[ADEINOST]|N[CDEHJMVY]|O[HKR]|PA|RI|S[CD]|T[NX]|UT|V[AT]|W[AIVY])$/i;

function postalAddress(location) {
  const parts = String(location || '').split(',').map((p) => p.trim()).filter(Boolean);
  if (!parts.length || /^remote$/i.test(parts[0])) return null;
  const address = { '@type': 'PostalAddress', addressLocality: parts[0] };
  if (parts[1]) address.addressRegion = parts[1];
  if (parts[2]) address.addressCountry = parts[2];
  else if (parts[1] && US_STATES.test(parts[1])) address.addressCountry = 'US';
  return address;
}

function descriptionHtml(job) {
  const block = (title, v) => {
    const items = Array.isArray(v) ? v.filter(Boolean) : v ? String(v).split(/\n+/).filter(Boolean) : [];
    if (!items.length) return '';
    return `${title ? `<h3>${esc(title)}</h3>` : ''}${Array.isArray(v) ? `<ul>${items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>` : items.map((p) => `<p>${esc(p)}</p>`).join('')}`;
  };
  return [
    block('', job.description),
    block('Responsibilities', job.responsibilities),
    block('Qualifications', job.qualifications),
    block('Nice to have', job.nice_to_haves),
    block('Benefits', job.benefits),
    block('Skills', job.skills),
  ].join('') || esc(job.title);
}

function jobPostingLd(job, company, url) {
  const ld = {
    '@context': 'https://schema.org/',
    '@type': 'JobPosting',
    title: job.title,
    description: descriptionHtml(job),
    identifier: { '@type': 'PropertyValue', name: 'TalentBridge', value: job.id },
    datePosted: String(job.created_date || '').slice(0, 10),
    validThrough: new Date(Date.parse(job.created_date || Date.now()) + 90 * 24 * 60 * 60 * 1000).toISOString(),
    hiringOrganization: {
      '@type': 'Organization',
      name: company?.name || job.company || 'Confidential employer',
      ...(company?.website ? { sameAs: company.website } : {}),
      ...(job.company_logo_url ? { logo: job.company_logo_url } : {}),
    },
    url,
    directApply: true,
  };
  if (EMPLOYMENT[job.employment_type]) ld.employmentType = EMPLOYMENT[job.employment_type];
  const address = postalAddress(job.location);
  if (job.work_type === 'remote') {
    ld.jobLocationType = 'TELECOMMUTE';
    ld.applicantLocationRequirements = { '@type': 'Country', name: address?.addressCountry === 'US' || !address ? 'USA' : address.addressCountry };
  }
  if (address) ld.jobLocation = { '@type': 'Place', address };
  const min = Number(job.salary_min);
  const max = Number(job.salary_max);
  if (min > 0 || max > 0) {
    ld.baseSalary = {
      '@type': 'MonetaryAmount',
      currency: job.salary_currency || 'USD',
      value: {
        '@type': 'QuantitativeValue',
        ...(min > 0 ? { minValue: min } : {}),
        ...(max > 0 ? { maxValue: max } : {}),
        unitText: 'YEAR',
      },
    };
  }
  return ld;
}

function headFor({ title, description, url, image, ld }) {
  const tags = [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(description)}" />`,
    `<link rel="canonical" href="${esc(url)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="TalentBridge" />`,
    `<meta property="og:title" content="${esc(title)}" />`,
    `<meta property="og:description" content="${esc(description)}" />`,
    `<meta property="og:url" content="${esc(url)}" />`,
    `<meta property="og:image" content="${esc(image)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(title)}" />`,
    `<meta name="twitter:description" content="${esc(description)}" />`,
    `<meta name="twitter:image" content="${esc(image)}" />`,
  ];
  // JSON-LD is data, not script: CSP doesn't block it. "<" is escaped so the
  // description can never close the tag.
  if (ld) tags.push(`<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>`);
  return tags.join('\n    ');
}

// Replaces the template's generic title/description/og tags with these.
function render(html, head) {
  return html
    .replace(/<title>[\s\S]*?<\/title>\s*/i, '')
    .replace(/<meta\s+(name="description"|property="og:[^"]+"|name="twitter:[^"]+")[^>]*>\s*/gi, '')
    .replace(/<link\s+rel="canonical"[^>]*>\s*/gi, '')
    .replace('</head>', `    ${head}\n  </head>`);
}

async function jobPage(req, res, next) {
  try {
    const html = await template(req);
    const job = store.get('Job', req.params.id);
    const url = appUrl(`/jobs/${encodeURIComponent(req.params.id)}`);
    const image = appUrl('/og-image.png');
    if (!job || !['active', 'closed', 'paused'].includes(job.status)) {
      res.status(job ? 200 : 404).setHeader('Cache-Control', 'public, max-age=0, s-maxage=60');
      return res.type('html').send(html);
    }
    // Imported listings live on the employer's own site: never ask search
    // engines to index our copy (duplicate content, and source terms).
    if (job.imported) {
      const head = headFor({ title: `${job.title}${job.company ? ` at ${job.company}` : ''} · TalentBridge`, description: oneLine(job.description, 155) || job.title, url, image, ld: null })
        + '\n    <meta name="robots" content="noindex, follow" />';
      res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=600');
      return res.type('html').send(render(html, head));
    }
    const company = require('./employers').publicCompany(job.created_by_id);
    const companyName = company?.name || job.company;
    const where = [job.work_type === 'remote' ? 'Remote' : job.location].filter(Boolean).join('');
    const title = `${job.title}${companyName ? ` at ${companyName}` : ''}${where ? ` (${where})` : ''} · TalentBridge`;
    const description = oneLine(job.description, 155) || `${job.title}${companyName ? ` at ${companyName}` : ''}. Apply on TalentBridge.`;
    const head = headFor({
      title,
      description,
      url,
      image,
      // Only open roles are advertised to job search.
      ld: job.status === 'active' ? jobPostingLd(job, company, url) : null,
    });
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300, stale-while-revalidate=600');
    res.type('html').send(render(html, head));
  } catch (e) {
    require('./monitor').captureServerError(e, req);
    next(); // fall back to the plain app
  }
}

function sitemap(req, res) {
  const pages = ['/', '/jobs', '/privacy', '/terms'].map((p) => ({ loc: appUrl(p) }));
  // Roles posted on TalentBridge only (imported listings aren't indexed).
  require('./jobindex').rebuildIfEmpty();
  const { db } = require('./db');
  for (const row of db.prepare("SELECT job_id, posted FROM job_index WHERE status = 'active' AND imported = 0 ORDER BY posted DESC LIMIT 5000").all()) {
    pages.push({ loc: appUrl(`/jobs/${encodeURIComponent(row.job_id)}`), lastmod: String(row.posted || '').slice(0, 10) });
  }
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages.map((p) => `  <url><loc>${esc(p.loc)}</loc>${p.lastmod ? `<lastmod>${p.lastmod}</lastmod>` : ''}</url>`).join('\n')}
</urlset>
`;
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=3600');
  res.type('application/xml').send(xml);
}

// Public profile links (/p/<slug>): a real title, description and photo for
// link previews (LinkedIn, Slack, iMessage), but never indexed.
async function profilePage(req, res, next) {
  try {
    const html = await template(req);
    const { profileBySlug, presentProfile } = require('./profiles');
    const p = profileBySlug(req.params.slug);
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    if (!p) {
      res.status(404).setHeader('Cache-Control', 'public, max-age=0, s-maxage=60');
      return res.type('html').send(render(html, '<meta name="robots" content="noindex, nofollow" />'));
    }
    const view = presentProfile(p, 'public');
    const url = appUrl(`/p/${encodeURIComponent(req.params.slug)}`);
    const title = `${view.full_name}${view.headline ? ` · ${view.headline}` : ''} | TalentBridge`;
    const description = oneLine(view.capability_graph?.capability_headline || view.bio || `${view.full_name}’s Capability Graph on TalentBridge.`, 155);
    const image = view.photo_url ? appUrl(view.photo_url) : appUrl('/og-image.png');
    const head = headFor({ title, description, url, image, ld: null }).replace('content="website"', 'content="profile"')
      + '\n    <meta name="robots" content="noindex, nofollow" />';
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=120');
    res.type('html').send(render(html, head));
  } catch (e) {
    require('./monitor').captureServerError(e, req);
    next();
  }
}

function registerSeoRoutes(app) {
  app.get('/jobs/:id', jobPage);
  app.get('/p/:slug', profilePage);
  app.get('/sitemap.xml', sitemap);
}

module.exports = { registerSeoRoutes, jobPostingLd, render, headFor };
