'use strict';
// Public job search (the job board) and per-seeker suggestions, both served
// from job_index so thousands of listings stay fast.
const { authRequired } = require('./auth');
const jobindex = require('./jobindex');
const { store } = require('./entities');
const { hit, clientIp } = require('./ratelimit');

function registerJobRoutes(app) {
  app.get('/api/jobs/search', (req, res) => {
    const r = hit(`job-search:${clientIp(req)}`, 600, 60 * 60 * 1000);
    if (!r.ok) return res.status(429).json({ error: 'Too many searches. Please wait a bit.' });
    try {
      jobindex.rebuildIfEmpty();
      const q = req.query || {};
      res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=120');
      res.json({
        data: jobindex.search({
          q: String(q.q || '').slice(0, 120),
          location: String(q.location || '').slice(0, 80),
          work_type: ['remote', 'hybrid', 'onsite'].includes(q.work_type) ? q.work_type : undefined,
          employment_type: ['full_time', 'part_time', 'contract', 'internship', 'freelance'].includes(q.employment_type) ? q.employment_type : undefined,
          experience_level: ['entry', 'mid', 'senior', 'lead', 'executive'].includes(q.experience_level) ? q.experience_level : undefined,
          origin: ['direct', 'imported'].includes(q.origin) ? q.origin : 'all',
          page: q.page,
          per: q.per,
        }),
        counts: jobindex.counts(),
      });
    } catch (e) {
      require('./monitor').captureServerError(e, req);
      res.status(500).json({ error: 'Search failed. Please try again.' });
    }
  });

  // Roles most relevant to the signed-in seeker's profile (for AI matching).
  app.get('/api/jobs/suggested', authRequired, (req, res) => {
    jobindex.rebuildIfEmpty();
    const profile = store.filter('SeekerProfile', { created_by_id: req.user.id })[0];
    if (!profile) return res.json({ data: [] });
    const applied = store.filter('JobApplication', { created_by_id: req.user.id }).map((a) => a.job_id);
    const limit = Math.min(parseInt(req.query.limit, 10) || 25, 40);
    res.json({ data: jobindex.suggestFor(profile, { limit, excludeIds: applied }) });
  });
}

module.exports = { registerJobRoutes };
