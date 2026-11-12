'use strict';
// Professional links on seeker profiles: websites, LinkedIn, portfolios,
// GitHub, practice/booking pages — any profession.
const LINK_TYPES = ['website', 'linkedin', 'portfolio', 'github', 'other'];
const MAX_LINKS = 8;
// Tracking parameters stripped from saved links.
const TRACKING = /^(utm_[a-z]+|fbclid|gclid|dclid|msclkid|mc_cid|mc_eid|igshid|si|ref_src)$/i;

function detectType(host) {
  if (/(^|\.)linkedin\.com$/.test(host)) return 'linkedin';
  if (/(^|\.)github\.com$/.test(host) || /(^|\.)gitlab\.com$/.test(host)) return 'github';
  if (/(^|\.)(behance\.net|dribbble\.com|artstation\.com|vimeo\.com|youtube\.com|medium\.com|substack\.com|notion\.site|wixsite\.com|squarespace\.com|carrd\.co)$/.test(host)) return 'portfolio';
  return 'website';
}

function cleanLink(raw) {
  const text = String(raw || '').trim();
  if (!text) return null;
  let url;
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    throw Object.assign(new Error(`“${text.slice(0, 60)}” isn’t a valid web address`), { status: 400 });
  }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname.includes('.') || url.username || url.password) {
    throw Object.assign(new Error(`“${text.slice(0, 60)}” isn’t a valid web address`), { status: 400 });
  }
  for (const key of [...url.searchParams.keys()]) if (TRACKING.test(key)) url.searchParams.delete(key);
  url.hash = '';
  const href = url.href.length > 500 ? null : url.href;
  if (!href) throw Object.assign(new Error('That link is too long'), { status: 400 });
  return { href, host: url.hostname.toLowerCase().replace(/^www\./, '') };
}

// Validates and normalizes a list of { url, type?, label? }.
function normalizeLinks(list) {
  if (!Array.isArray(list)) throw Object.assign(new Error('professional_links must be a list'), { status: 400 });
  const out = [];
  const seen = new Set();
  for (const item of list) {
    const cleaned = cleanLink(typeof item === 'string' ? item : item?.url);
    if (!cleaned || seen.has(cleaned.href)) continue;
    seen.add(cleaned.href);
    const given = typeof item === 'object' && LINK_TYPES.includes(item.type) ? item.type : null;
    out.push({
      url: cleaned.href,
      type: given || detectType(cleaned.host),
      label: typeof item === 'object' ? String(item.label || '').trim().slice(0, 60) : '',
    });
  }
  if (out.length > MAX_LINKS) throw Object.assign(new Error(`You can add up to ${MAX_LINKS} links`), { status: 400 });
  return out;
}

// A profile's links, including the older github_url / portfolio_url fields.
function profileLinks(profile) {
  if (Array.isArray(profile?.professional_links) && profile.professional_links.length) return profile.professional_links;
  const legacy = [profile?.portfolio_url, profile?.github_url].filter(Boolean);
  try {
    return normalizeLinks(legacy);
  } catch {
    return [];
  }
}

module.exports = { normalizeLinks, profileLinks, LINK_TYPES, MAX_LINKS };
