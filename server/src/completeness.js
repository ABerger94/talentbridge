'use strict';
// When is a seeker profile complete enough to show employers, be matched,
// receive invitations, or apply? One definition, used everywhere.
//   name  AND  (at least one skill OR a built Capability Graph)  AND  (headline OR bio)
// Listing in the employer directory additionally requires the seeker's
// "Visible to employers" switch (open_to_opportunities) to be on.
// Keep in sync with src/lib/completeness.js.

const text = (v) => String(v || '').trim();

function graphBuilt(profile) {
  return Array.isArray(profile?.capability_graph?.core_execution_vectors)
    && profile.capability_graph.core_execution_vectors.length > 0;
}

function profileCompleteness(profile) {
  const checks = {
    name: !!text(profile?.full_name),
    skills_or_graph: (Array.isArray(profile?.skills) && profile.skills.some((s) => text(s))) || graphBuilt(profile),
    headline_or_bio: !!(text(profile?.headline) || text(profile?.bio)),
  };
  const missing = [];
  if (!checks.name) missing.push('your full name');
  if (!checks.headline_or_bio) missing.push('a headline or short bio');
  if (!checks.skills_or_graph) missing.push('your skills (or a Capability Graph)');
  return { complete: missing.length === 0, missing, checks };
}

// Shown in Explore Seekers / matching / invitations.
function isListable(profile) {
  return !!profile && profile.open_to_opportunities !== false && profileCompleteness(profile).complete;
}

// Enough data for the AI to say anything meaningful about fit.
function hasMatchableData(profile) {
  return (Array.isArray(profile?.skills) && profile.skills.length > 0) || graphBuilt(profile) || !!text(profile?.bio);
}

module.exports = { profileCompleteness, isListable, hasMatchableData, graphBuilt };
