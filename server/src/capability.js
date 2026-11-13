'use strict';
// The Capability Graph: what a seeker is exceptionally good at, rated on a
// published rubric (src/lib/capabilityRubric.json, shared with the page).
// Built here rather than in the browser so the rubric's rules (evidence caps,
// what counts as a differentiator) are enforced in one place, and so the AI
// fairness check can build graphs exactly the way seekers get them.
const RUBRIC = require('../../src/lib/capabilityRubric.json');
const { fence } = require('./aisafety');

const clip = (v, n) => String(v ?? '').slice(0, n);

function storiesText(stories) {
  const filled = (Array.isArray(stories) ? stories : []).filter((s) => s && (s.action || s.result)).slice(0, 8);
  if (!filled.length) return 'None yet.';
  return filled.map((s, i) => {
    const p = RUBRIC.story_prompts.find((x) => x.id === s.prompt_id);
    // Answers to the graph's own follow-up questions say which question.
    const title = s.question ? `Answer to: ${clip(s.question, 300)}` : p ? p.title : 'Story';
    return `${i + 1}. ${title}\n   Situation: ${clip(s.situation, 1200) || '(not given)'}\n   What they did: ${clip(s.action, 1200) || '(not given)'}\n   Result: ${clip(s.result, 1200) || '(not given)'}`;
  }).join('\n');
}

function buildGraphPrompt(profile) {
  const p = profile || {};
  const levels = RUBRIC.levels.map((l) => `${l.level} = ${l.name}: ${l.detail}`).join('\n');
  const caps = RUBRIC.evidence_caps;
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

HOW TO NAME CAPABILITIES
- Name 5 to 8 specific competencies the way a hiring manager in this candidate's field would, e.g. "Root cause investigation", "Hazard and risk assessment", "Sanitation program design", "Verification and validation", "Recall and crisis response", "Operational data analysis". Never use broad umbrella categories such as "Food Safety Management" or "Leadership".
- Distinguish running an existing program (level 2) from building, evaluating and improving one (levels 3 to 4).

WHAT SETS THEM APART
- Decide what is baseline (expected of anyone at this candidate's experience in this field). Routine duties, such as conducting scheduled audits for an experienced quality professional, are baseline even if done well: mark them differentiator=false.
- Mark differentiator=true only for capabilities at level ${RUBRIC.differentiator_min_level} or above with described or demonstrated evidence that most peers at this level would not show: the work behind the routine duties.
- The evidence field must cite the specific example (a proof story, a result, a number). Do not restate the capability name.

GAPS
- In follow_up_questions, ask 2 to 4 specific questions whose answers would most change this assessment (e.g. "Have you led a recall or market withdrawal? What was your role?").
- Don't ask again about something a proof story already answers ("Answer to: ..."); use that answer as evidence instead.

CANDIDATE
${fence('candidate profile', candidate, 8000)}

PROOF STORIES (the candidate's own examples; strongest evidence)
${fence('proof stories', storiesText(p.proof_stories), 8000)}`;
}

const GRAPH_SCHEMA = {
  type: 'object',
  properties: {
    capability_headline: { type: 'string', description: 'One sentence on what this person is exceptionally good at' },
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
function normalizeGraph(raw) {
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
  return normalizeGraph(result);
}

module.exports = { RUBRIC, buildGraphPrompt, GRAPH_SCHEMA, normalizeGraph, buildGraph };
