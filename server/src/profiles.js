'use strict';
// Seeker profile pages: the Capability Graph, proof stories, work history and
// more on one page.
//
// Who can see a profile (GET /api/profiles/:id):
//   - the seeker (a preview of exactly what employers see) and admins;
//   - approved employers, when the seeker is visible to employers, or has
//     applied to one of their roles.
// Public link (GET /api/public/profiles/:slug): only when the seeker turns it
// on. It's left out of search engines, and a new link retires the old one.
//
// Never on a profile page: email, phone, résumé file, or anything the seeker
// hid (sections, or single proof stories marked private).
const crypto = require('crypto');
const { db } = require('./db');
const { authRequired, getUserById, publicUser } = require('./auth');
const { store } = require('./entities');
const { hit, clientIp } = require('./ratelimit');

db.exec(`
CREATE TABLE IF NOT EXISTS profile_views (
  profile_id TEXT NOT NULL,
  viewer_id TEXT NOT NULL,
  day TEXT NOT NULL,
  viewed_at TEXT NOT NULL,
  PRIMARY KEY (profile_id, viewer_id, day)
);
CREATE INDEX IF NOT EXISTS profile_views_by_profile ON profile_views (profile_id, viewed_at);
`);

const SECTIONS = ['proof_stories', 'work_history', 'education', 'links'];
const PHOTO_MAX_BYTES = 1.5 * 1024 * 1024;
const PHOTO_TYPES = {
  jpg: { mime: 'image/jpeg', ok: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  png: { mime: 'image/png', ok: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  webp: { mime: 'image/webp', ok: (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP' },
};

const fail = (status, message) => Object.assign(new Error(message), { status });
const sharingOf = (p) => {
  const s = p?.profile_sharing && typeof p.profile_sharing === 'object' ? p.profile_sharing : {};
  return {
    public_enabled: !!s.public_enabled && !!s.public_slug,
    public_slug: s.public_slug || null,
    hidden_sections: Array.isArray(s.hidden_sections) ? s.hidden_sections.filter((x) => SECTIONS.includes(x)) : [],
  };
};

function ownProfile(userId) {
  return store.filter('SeekerProfile', { created_by_id: userId })[0] || null;
}

function employerCanSee(user, profile) {
  const { isApprovedEmployer } = require('./employers');
  if (!isApprovedEmployer(user)) return false;
  if (require('./completeness').isListable(profile)) return true;
  // Someone who applied to this employer can always be looked at by them.
  return !!db.prepare("SELECT 1 FROM records WHERE entity = 'JobApplication' AND json_extract(data, '$.seeker_profile_id') = ? AND json_extract(data, '$.employer_user_id') = ? LIMIT 1").get(profile.id, user.id);
}

// What a viewer sees. audience: 'employer' | 'public' | 'owner' (owner sees
// the employer view plus their own settings).
function presentProfile(p, audience) {
  const sharing = sharingOf(p);
  const hidden = new Set(sharing.hidden_sections);
  const { profileLinks } = require('./links');
  let photo_url = null;
  if (p.photo_file) {
    photo_url = audience === 'public'
      ? `/api/public/profiles/${encodeURIComponent(sharing.public_slug)}/photo?v=${encodeURIComponent(p.photo_file.slice(0, 13))}`
      : require('./files').signFileUrl(`/api/files/${p.photo_file}`);
  }
  const graph = p.capability_graph && Array.isArray(p.capability_graph.core_execution_vectors) ? p.capability_graph : null;
  const out = {
    id: p.id,
    full_name: p.full_name || '',
    headline: p.headline || '',
    bio: p.bio || '',
    photo_url,
    location: p.preferred_location || '',
    work_type: p.preferred_work_type || '',
    experience_years: p.experience_years ?? null,
    experience_level: p.experience_level || '',
    skills: Array.isArray(p.skills) ? p.skills.slice(0, 40) : [],
    career_goals: p.career_goals || '',
    open_to_opportunities: p.open_to_opportunities !== false,
    story_field_family: p.story_field_family || null,
    capability_graph: graph && {
      rubric_version: graph.rubric_version || 1,
      field_family: graph.field_family || null,
      capability_headline: graph.capability_headline || '',
      field_baseline: graph.field_baseline || '',
      core_execution_vectors: graph.core_execution_vectors.slice(0, 10).map((v) => ({
        vector: v.vector, level: v.level ?? null, evidence_type: v.evidence_type ?? null, differentiator: !!v.differentiator, evidence: v.evidence || '', strength: v.strength ?? null,
      })),
      adjacent_zones: Array.isArray(graph.adjacent_zones) ? graph.adjacent_zones.slice(0, 8) : [],
      suggested_role_types: Array.isArray(graph.suggested_role_types) ? graph.suggested_role_types.slice(0, 8) : [],
    },
    proof_stories: hidden.has('proof_stories') ? [] : (Array.isArray(p.proof_stories) ? p.proof_stories : [])
      .filter((s) => s && !s.private && (s.action || s.result))
      .map((s) => ({ prompt_id: s.prompt_id, question: s.question || null, situation: s.situation || '', action: s.action || '', result: s.result || '' })),
    work_history: hidden.has('work_history') ? null : (p.work_history || null),
    education: hidden.has('education') ? null : (p.education || null),
    links: hidden.has('links') ? [] : profileLinks(p),
    audience,
  };
  if (audience === 'owner') {
    out.sharing = { ...sharing, public_url: sharing.public_enabled ? require('./mailer').appUrl(`/p/${sharing.public_slug}`) : null };
  }
  return out;
}

function recordView(profile, viewer) {
  const now = new Date().toISOString();
  db.prepare('INSERT OR IGNORE INTO profile_views (profile_id, viewer_id, day, viewed_at) VALUES (?, ?, ?, ?)').run(profile.id, viewer.id, now.slice(0, 10), now);
}

function viewsSummary(profileId) {
  const since = (d) => new Date(Date.now() - d * 86400000).toISOString();
  const count = (d) => db.prepare('SELECT COUNT(DISTINCT viewer_id) AS n FROM profile_views WHERE profile_id = ? AND viewed_at >= ?').get(profileId, since(d)).n;
  const { publicCompany } = require('./employers');
  const recent = db.prepare('SELECT viewer_id, MAX(viewed_at) AS viewed_at FROM profile_views WHERE profile_id = ? AND viewed_at >= ? GROUP BY viewer_id ORDER BY viewed_at DESC LIMIT 10').all(profileId, since(30))
    .map((r) => ({ company: publicCompany(r.viewer_id)?.name || 'An employer', viewed_at: r.viewed_at }));
  return { last_7d: count(7), last_30d: count(30), recent };
}

function slugFor(name) {
  const base = String(name || 'profile').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'profile';
  for (;;) {
    const slug = `${base}-${crypto.randomBytes(4).toString('base64url').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5)}`;
    if (slug.length > base.length + 3 && !profileBySlug(slug, { includeDisabled: true })) return slug;
  }
}

function profileBySlug(slug, { includeDisabled = false } = {}) {
  if (!/^[a-z0-9-]{3,60}$/.test(String(slug || ''))) return null;
  const row = db.prepare("SELECT id FROM records WHERE entity = 'SeekerProfile' AND json_extract(data, '$.profile_sharing.public_slug') = ? LIMIT 1").get(slug);
  const p = row ? store.get('SeekerProfile', row.id) : null;
  if (!p) return null;
  return includeDisabled || sharingOf(p).public_enabled ? p : null;
}

function updateSharing(user, body) {
  const p = ownProfile(user.id);
  if (!p) throw fail(400, 'Save your profile first.');
  const current = sharingOf(p);
  const next = { ...current };
  if (Array.isArray(body?.hidden_sections)) next.hidden_sections = [...new Set(body.hidden_sections.filter((x) => SECTIONS.includes(x)))];
  if (typeof body?.public_enabled === 'boolean') next.public_enabled = body.public_enabled;
  if (next.public_enabled && !String(p.full_name || '').trim()) throw fail(400, 'Add your name to your profile before sharing a public link.');
  if (next.public_enabled && (!next.public_slug || body?.new_link)) next.public_slug = slugFor(p.full_name);
  store.update('SeekerProfile', p.id, { profile_sharing: { public_enabled: next.public_enabled, public_slug: next.public_slug, hidden_sections: next.hidden_sections } });
  require('./audit').audit(user, 'profile.sharing_updated', { type: 'seeker_profile', id: p.id }, { public_enabled: next.public_enabled, new_link: !!body?.new_link });
  return presentProfile(store.get('SeekerProfile', p.id), 'owner');
}

async function setPhoto(user, body) {
  const p = ownProfile(user.id);
  if (!p) throw fail(400, 'Save your profile first.');
  if (body?.remove) {
    if (p.photo_file) await require('./files').deleteFile(p.photo_file).catch(() => {});
    store.update('SeekerProfile', p.id, { photo_file: null });
    return presentProfile(store.get('SeekerProfile', p.id), 'owner');
  }
  const m = String(body?.data_url || '').match(/^data:image\/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=]+)$/);
  if (!m) throw fail(400, 'Choose a JPG, PNG or WebP image.');
  const buffer = Buffer.from(m[2], 'base64');
  if (!buffer.length) throw fail(400, 'That image is empty.');
  if (buffer.length > PHOTO_MAX_BYTES) throw fail(413, 'That image is too large. Try a smaller photo.');
  const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
  if (!PHOTO_TYPES[ext].ok(buffer)) throw fail(415, 'That file isn’t a valid image.');
  const storage = require('./storage');
  const name = `${Date.now()}-${crypto.randomUUID()}.${ext}`;
  const stored = await storage.putBytes(name, buffer);
  db.prepare('INSERT INTO files (name, content_type, original_name, size, data, created_by_id, created_date, storage) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(name, PHOTO_TYPES[ext].mime, `profile-photo.${ext}`, buffer.length, stored.data, user.id, new Date().toISOString(), stored.storage);
  if (p.photo_file) await require('./files').deleteFile(p.photo_file).catch(() => {});
  store.update('SeekerProfile', p.id, { photo_file: name });
  return presentProfile(store.get('SeekerProfile', p.id), 'owner');
}

function wrap(fn) {
  return async (req, res) => {
    try {
      res.json({ data: await fn(req, res) });
    } catch (e) {
      if (!e.status || e.status >= 500) require('./monitor').captureServerError(e, req);
      res.status(e.status || 500).json({ error: e.message });
    }
  };
}

function registerProfileRoutes(app) {
  // The seeker's own page, settings, and who viewed it.
  app.get('/api/profiles/me', authRequired, wrap((req) => {
    const p = ownProfile(req.user.id);
    if (!p) throw fail(404, 'You don’t have a profile yet.');
    return { ...presentProfile(p, 'owner'), views: viewsSummary(p.id) };
  }));
  app.put('/api/profiles/me/sharing', authRequired, wrap((req) => updateSharing(req.user, req.body || {})));
  app.post('/api/profiles/me/photo', authRequired, wrap((req) => setPhoto(req.user, req.body || {})));

  app.get('/api/profiles/:id', authRequired, wrap((req) => {
    const p = store.get('SeekerProfile', req.params.id);
    const notFound = () => fail(404, 'Profile not found');
    if (!p) throw notFound();
    if (p.created_by_id === req.user.id) return presentProfile(p, 'owner');
    if (req.user.role === 'admin') return presentProfile(p, 'employer');
    if (req.user.role !== 'employer' || !employerCanSee(req.user, p)) throw notFound();
    recordView(p, req.user);
    return presentProfile(p, 'employer');
  }));

  // Public share link: anyone with the link, if the seeker turned it on.
  app.get('/api/public/profiles/:slug', wrap((req, res) => {
    const r = hit(`public-profile:${clientIp(req)}`, 300, 60 * 60 * 1000);
    if (!r.ok) throw fail(429, 'Too many requests. Please wait a bit.');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    const p = profileBySlug(req.params.slug);
    if (!p) throw fail(404, 'This profile link isn’t active.');
    return presentProfile(p, 'public');
  }));
  // The link-preview image (1200x630) for a public profile link.
  app.get('/api/public/profiles/:slug/card.png', async (req, res) => {
    const p = profileBySlug(req.params.slug);
    if (!p) return res.status(404).end();
    try {
      const { renderCard, cardData } = require('./sharecard');
      const png = await renderCard(cardData({ ...presentProfile(p, 'public'), photo_file: p.photo_file }));
      res.setHeader('Content-Type', 'image/png');
      // The URL carries a version, so a changed profile gets a new one.
      res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.send(png);
    } catch (e) {
      // Never leave a preview blank: fall back to the photo or the site image.
      require('./monitor').captureServerError(e, req);
      res.redirect(302, p.photo_file ? `/api/public/profiles/${encodeURIComponent(req.params.slug)}/photo` : '/og-image.png');
    }
  });
  app.get('/api/public/profiles/:slug/photo', async (req, res) => {
    const p = profileBySlug(req.params.slug);
    if (!p || !p.photo_file) return res.status(404).end();
    const file = await require('./files').loadFile(p.photo_file).catch(() => null);
    if (!file) return res.status(404).end();
    res.setHeader('Content-Type', file.contentType || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Robots-Tag', 'noindex');
    res.send(file.buffer);
  });
}

module.exports = { registerProfileRoutes, presentProfile, profileBySlug, sharingOf, SECTIONS };
