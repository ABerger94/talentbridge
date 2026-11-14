'use strict';
// The Capability Graph: what a seeker is exceptionally good at, rated on a
// published rubric (src/lib/capabilityRubric.json, shared with the page).
// Built here rather than in the browser so the rubric's rules (evidence caps,
// what counts as a differentiator) are enforced in one place, and so the AI
// fairness check can build graphs exactly the way seekers get them.
const RUBRIC = require('../../src/lib/capabilityRubric.json');
const { fence } = require('./aisafety');

const clip = (v, n) => String(v ?? '').slice(0, n);
const FAMILIES = RUBRIC.field_families;
const FAMILY_IDS = ['general', ...Object.keys(FAMILIES)];

// Same as detectFieldFamily in src/lib/fieldFamily.js (the page's copy);
// test/capability.test.js checks they agree. Keyword hits in the headline
// count triple; skills, work history and education once each.
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function detectFieldFamily(profile) {
  const p = profile || {};
  const work = typeof p.work_history === 'string' ? p.work_history : JSON.stringify(p.work_history || '');
  const sources = [
    [String(p.headline || ''), 3],
    [Array.isArray(p.skills) ? p.skills.join(', ') : String(p.skills || ''), 1],
    [work.slice(0, 6000), 1],
    [String(p.education || ''), 1],
  ].map(([t, w]) => [t.toLowerCase(), w]);
  let best = null;
  let bestScore = 1;
  for (const [id, fam] of Object.entries(FAMILIES)) {
    let score = 0;
    for (const kw of fam.keywords || []) {
      const re = new RegExp(`(?<![a-z0-9])${escapeRe(kw.toLowerCase())}(?![a-z0-9])`);
      for (const [text, w] of sources) if (re.test(text)) score += w;
    }
    if (score > bestScore) { best = id; bestScore = score; }
  }
  return best;
}

// The seeker's own choice wins; otherwise a guess from the profile.
function familyFor(profile) {
  const chosen = profile?.story_field_family;
  if (chosen === 'general') return null;
  if (FAMILIES[chosen]) return chosen;
  return detectFieldFamily(profile);
}
const promptsFor = (family) => FAMILIES[family]?.prompts || RUBRIC.story_prompts;

function storiesText(stories, family) {
  const filled = (Array.isArray(stories) ? stories : []).filter((s) => s && (s.action || s.result)).slice(0, 8);
  if (!filled.length) return 'None yet.';
  return filled.map((s, i) => {
    const p = promptsFor(family).find((x) => x.id === s.prompt_id);
    // Answers to the graph's own follow-up questions say which question.
    const title = s.question ? `Answer to: ${clip(s.question, 300)}` : p ? p.title : 'Story';
    return `${i + 1}. ${title}\n   Situation: ${clip(s.situation, 1200) || '(not given)'}\n   What they did: ${clip(s.action, 1200) || '(not given)'}\n   Result: ${clip(s.result, 1200) || '(not given)'}`;
  }).join('\n');
}

function buildGraphPrompt(profile) {
  const p = profile || {};
  const levels = RUBRIC.levels.map((l) => `${l.level} = ${l.name}: ${l.detail}`).join('\n');
  const caps = RUBRIC.evidence_caps;
  const family = familyFor(p);
  const candidate = [
    `Headline: ${clip(p.headline, 300)}`,
    `Skills: ${clip((p.skills || []).join(', '), 1200)}`,
    `Experience: ${p.experience_years || '?'} years (${clip(p.experience_level, 40) || 'level not given'})`,
    `Work history: ${clip(typeof p.work_history === 'string' ? p.work_history : JSON.stringify(p.work_history || ''), 4000)}`,
    `Education: ${clip(p.education, 600)}`,
    `Career goals: ${clip(p.career_goals, 600)}`,
  ].join('\n');
  return `You are TalentBridge's Capability Graph engine. Assess what this candidate is exceptionally good at doing, not just what their resume says they have done. An employer will use this to tell this candidate apart from other experienced people in the same field. Judge only job-relevant evidence: a person's name, gender, age, ethnicity, nationality, religion, disability or family situation must never affect a rating.

Current date: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}

THE RUBRIC (use it exactly)
Depth level for each capability (each level includes the ones below):
${levels}

Evidence type for each capability:
- demonstrated: a specific example with actions and outcomes (most proof stories are this)
- described: stated as a responsibility, without a concrete outcome
- inferred: implied only by titles, skills or education
Never rate above level ${caps.inferred} on inferred evidence alone, or above level ${caps.described} on described evidence alone. Levels 4 and 5 need demonstrated evidence.

FIELD
${family ? `This candidate's field looks like: ${FAMILIES[family].label}. Check that against the profile, and set field_family to the best fit.` : 'Set field_family to the best fit for this candidate\'s field, or "general" if none fits.'}
Write everything (capability names, the baseline, follow-up questions) in the terms a hiring manager in this candidate's own field would use. The examples below come from different fields to show the pattern; don't borrow their subject matter.

HOW TO NAME CAPABILITIES
- Name 5 to 8 specific competencies, e.g. "Root cause investigation" for a quality professional, "Differential diagnosis" or "Crisis risk assessment" for a clinician, "Incident response" for a software engineer, "Curriculum design" for a teacher, "Account expansion" for a salesperson. Never use broad umbrella categories such as "Patient Care", "Food Safety Management", "Software Development" or "Leadership".
- Distinguish running existing work (level 2) from building, evaluating and improving it (levels 3 to 4).

WHAT SETS THEM APART
- Decide what is baseline (expected of anyone at this candidate's experience in this field). Routine duties are baseline even if done well, e.g. scheduled audits for an experienced quality professional, or routine medication management for an experienced psychiatric nurse practitioner: mark them differentiator=false.
- Mark differentiator=true only for capabilities at level ${RUBRIC.differentiator_min_level} or above with described or demonstrated evidence that most peers at this level would not show: the work behind the routine duties.
- The evidence field must cite the specific example (a proof story, a result, a number). Do not restate the capability name.

GAPS
- In follow_up_questions, ask 2 to 4 specific questions, in this candidate's field's terms, whose answers would most change this assessment. For example, a quality professional might be asked "Have you led a recall or market withdrawal? What was your role?", and a psychiatric nurse practitioner "Have you managed a patient through an acute crisis or a hold decision? What did you decide, and how did it end?"
- Never ask for names or details that could identify a patient, student or client.
- Don't ask again about something a proof story already answers ("Answer to: ..."); use that answer as evidence instead.

CANDIDATE
${fence('candidate profile', candidate, 8000)}

PROOF STORIES (the candidate's own examples; strongest evidence)
${fence('proof stories', storiesText(p.proof_stories, family), 8000)}`;
}

const GRAPH_SCHEMA = {
  type: 'object',
  properties: {
    capability_headline: { type: 'string', description: 'One sentence on what this person is exceptionally good at' },
    field_family: { type: 'string', enum: FAMILY_IDS, description: 'The family of fields this candidate works in' },
    field_baseline: { type: 'string', description: 'What is expected of anyone at this experience level in this field' },
    core_execution_vectors: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          vector: { type: 'string', description: 'Specific competency name' },
          level: { type: 'integer', description: 'Depth level 1-5 from the rubric' },
          evidence_type: { type: 'string', enum: ['demonstrated', 'described', 'inferred'] },
          differentiator: { type: 'boolean' },
          evidence: { type: 'string', description: 'The specific example behind the rating' },
        },
      },
    },
    follow_up_questions: { type: 'array', items: { type: 'string' } },
    adjacent_zones: { type: 'array', items: { type: 'string' } },
    suggested_role_types: { type: 'array', items: { type: 'string' } },
  },
};

const strList = (v, n, each) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim()).slice(0, n).map((x) => x.trim().slice(0, each)) : []);

// Applies the rubric's rules to what the AI returned: levels are capped by
// evidence, and only level-3+ capabilities with real evidence can set
// someone apart. `strength` (level x 20) stays for older readers.
function normalizeGraph(raw, fallbackFamily = null) {
  const g = raw && typeof raw === 'object' ? raw : {};
  const vectors = (Array.isArray(g.core_execution_vectors) ? g.core_execution_vectors : [])
    .filter((v) => v && typeof v.vector === 'string' && v.vector.trim())
    .slice(0, 10)
    .map((v) => {
      const evidence_type = RUBRIC.evidence[v.evidence_type] ? v.evidence_type : 'inferred';
      const asked = Math.round(Number(v.level));
      const level = Math.min(Number.isFinite(asked) ? Math.max(1, Math.min(5, asked)) : 1, RUBRIC.evidence_caps[evidence_type]);
      return {
        vector: v.vector.trim().slice(0, 120),
        level,
        evidence_type,
        differentiator: !!v.differentiator && level >= RUBRIC.differentiator_min_level && evidence_type !== 'inferred',
        evidence: clip(v.evidence, 600),
        strength: level * 20,
      };
    })
    .sort((a, b) => Number(b.differentiator) - Number(a.differentiator) || b.level - a.level);
  return {
    rubric_version: RUBRIC.version,
    capability_headline: clip(g.capability_headline, 300),
    field_family: FAMILY_IDS.includes(g.field_family) ? g.field_family : (fallbackFamily || 'general'),
    field_baseline: clip(g.field_baseline, 400),
    core_execution_vectors: vectors,
    follow_up_questions: strList(g.follow_up_questions, 4, 300),
    adjacent_zones: strList(g.adjacent_zones, 8, 80),
    suggested_role_types: strList(g.suggested_role_types, 8, 80),
    built_at: new Date().toISOString(),
  };
}

async function buildGraph(profile) {
  const { invokeLLM } = require('./llm');
  // temperature 0: the same profile should get the same levels on every
  // rebuild (and in the fairness check, only the identity hint differs).
  const result = await invokeLLM({ prompt: buildGraphPrompt(profile), response_json_schema: GRAPH_SCHEMA, temperature: 0 });
  return normalizeGraph(result, familyFor(profile));
}

module.exports = { RUBRIC, buildGraphPrompt, GRAPH_SCHEMA, normalizeGraph, buildGraph, detectFieldFamily, familyFor };
