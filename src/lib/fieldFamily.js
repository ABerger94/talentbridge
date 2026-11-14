// Which field a seeker works in, so their proof-story prompts are written in
// their field's terms (a nurse practitioner isn't asked about recalls).
// Pure, with no imports: server/src/capability.js has the same function, and
// server/test/capability.test.js checks the two agree.

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Keyword hits in the headline count triple; skills, work history and
// education once each. Below 2 points there isn't enough to go on.
export function detectFieldFamily(profile, families) {
  const p = profile || {};
  const work = typeof p.work_history === "string" ? p.work_history : JSON.stringify(p.work_history || "");
  const sources = [
    [String(p.headline || ""), 3],
    [Array.isArray(p.skills) ? p.skills.join(", ") : String(p.skills || ""), 1],
    [work.slice(0, 6000), 1],
    [String(p.education || ""), 1],
  ].map(([t, w]) => [t.toLowerCase(), w]);
  let best = null;
  let bestScore = 1;
  for (const [id, fam] of Object.entries(families || {})) {
    let score = 0;
    for (const kw of fam.keywords || []) {
      const re = new RegExp(`(?<![a-z0-9])${escape(kw.toLowerCase())}(?![a-z0-9])`);
      for (const [text, w] of sources) if (re.test(text)) score += w;
    }
    if (score > bestScore) { best = id; bestScore = score; }
  }
  return best;
}

// "A complex case you worked through" -> "A complex case they worked through",
// for a seeker's stories shown to employers.
export const thirdPerson = (title) => String(title || "")
  .replace(/\byou(['’])re\b/g, "they$1re").replace(/\byour\b/g, "their").replace(/\byou\b/g, "they");
