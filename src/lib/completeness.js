// Mirror of server/src/completeness.js (the server is authoritative).
const text = (v) => String(v || "").trim();

export function graphBuilt(profile) {
  return Array.isArray(profile?.capability_graph?.core_execution_vectors)
    && profile.capability_graph.core_execution_vectors.length > 0;
}

export function profileCompleteness(profile) {
  const checks = {
    name: !!text(profile?.full_name),
    skills_or_graph: (Array.isArray(profile?.skills) && profile.skills.some((s) => text(s))) || graphBuilt(profile),
    headline_or_bio: !!(text(profile?.headline) || text(profile?.bio)),
  };
  const missing = [];
  if (!checks.name) missing.push("your full name");
  if (!checks.headline_or_bio) missing.push("a headline or short bio");
  if (!checks.skills_or_graph) missing.push("your skills (or a Capability Graph)");
  return { complete: missing.length === 0, missing, checks };
}

export function isListable(profile) {
  return !!profile && profile.open_to_opportunities !== false && profileCompleteness(profile).complete;
}
