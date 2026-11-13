// The Capability Graph rubric: what is measured, and how depth is decided.
// Shown to seekers ("How we assess") and employers, and sent to the AI, so
// all three read the same definitions.
import { normalizePercent } from "@/lib/scales";

export const RUBRIC_VERSION = 2;

// Depth: what the person has shown they can do with a capability, not how
// long they've done it. Each level includes the ones below it.
export const LEVELS = [
  { level: 1, name: "Executes", short: "Carries out established procedures", detail: "Performs the work as designed by others: runs the checks, follows the procedure, completes the audit." },
  { level: 2, name: "Maintains", short: "Owns and runs an existing program", detail: "Keeps an existing program or process running and compliant, trains others in it, handles routine issues." },
  { level: 3, name: "Builds", short: "Designs and implements new systems", detail: "Creates a program, process or system that didn't exist, or rebuilds one from the ground up." },
  { level: 4, name: "Improves", short: "Diagnoses with data and measurably improves", detail: "Finds root causes, evaluates what's working with evidence, and changes systems with measurable results." },
  { level: 5, name: "Leads", short: "Sets direction and is trusted when it matters most", detail: "Shapes approach across teams or sites, is brought in for crises and novel problems, and holds others accountable for results." },
];

// How strong the evidence behind a rating is.
export const EVIDENCE = {
  demonstrated: { label: "Demonstrated", detail: "A specific example with actions and outcomes, ideally measured" },
  described: { label: "Described", detail: "Stated as a responsibility, without a concrete outcome" },
  inferred: { label: "Inferred", detail: "Implied by job titles, skills or education only" },
};

// Guided prompts for the evidence resumes leave out. Each answer is a short
// story: the situation, what you did, and what changed.
export const STORY_PROMPTS = [
  { id: "investigation", title: "A failure you investigated", hint: "A defect, incident, complaint or outage: how you found the root cause and what you changed so it didn't recur." },
  { id: "risk", title: "A risk you caught early", hint: "A hazard or weakness you identified before it became a problem, and how you assessed and controlled it." },
  { id: "emergency", title: "An emergency you handled", hint: "A recall, crisis, outage or urgent escalation: your role, the decisions you made, and how it ended." },
  { id: "built", title: "A system you built or fixed", hint: "A program, process or tool you designed or rebuilt, and how you proved it worked." },
  { id: "data", title: "Data that changed an operation", hint: "Analysis or trending you did that led to a real operational change, with the before and after." },
  { id: "accountability", title: "Holding others accountable", hint: "Getting a team, supplier or leadership to own a problem and deliver results." },
];

export const levelInfo = (n) => LEVELS.find((l) => l.level === Number(n)) || null;

function clampLevel(v) {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(5, Math.max(1, n)) : null;
}

// Normalizes a graph from the AI (or storage) into the current shape. Older
// graphs (strength %, no levels) are kept as they were, flagged as legacy so
// the page can offer a rebuild. `strength` stays on every capability (level
// x 20) for code that still reads it, such as matching keywords.
export function normalizeGraph(graph) {
  if (!graph || !Array.isArray(graph.core_execution_vectors)) return graph;
  const legacy = Number(graph.rubric_version || 1) < RUBRIC_VERSION;
  return {
    ...graph,
    legacy,
    core_execution_vectors: graph.core_execution_vectors
      .filter((v) => v && (v.vector || v.name))
      .map((v) => {
        const level = legacy ? null : clampLevel(v.level);
        const evidence_type = EVIDENCE[v.evidence_type] ? v.evidence_type : legacy ? null : "inferred";
        return {
          ...v,
          vector: String(v.vector || v.name).slice(0, 120),
          level,
          evidence_type,
          // Enforced here too, not only asked of the AI: a differentiator is
          // level 3+ ("Builds" or deeper) and backed by more than inference.
          differentiator: !legacy && !!v.differentiator && level >= 3 && evidence_type !== "inferred",
          strength: level ? level * 20 : normalizePercent(v.strength),
        };
      })
      // Differentiators first, then deepest.
      .sort((a, b) => Number(b.differentiator) - Number(a.differentiator) || (b.level || 0) - (a.level || 0)),
  };
}

export const differentiators = (graph) => (graph?.core_execution_vectors || []).filter((v) => v.differentiator);

function storiesText(stories) {
  const filled = (stories || []).filter((s) => s && (s.action || s.result));
  if (!filled.length) return "None yet.";
  return filled.map((s, i) => {
    const p = STORY_PROMPTS.find((x) => x.id === s.prompt_id);
    return `${i + 1}. ${p ? p.title : "Story"}\n   Situation: ${s.situation || "(not given)"}\n   What they did: ${s.action || "(not given)"}\n   Result: ${s.result || "(not given)"}`;
  }).join("\n");
}

export function buildGraphPrompt(profile) {
  const levels = LEVELS.map((l) => `${l.level} = ${l.name}: ${l.detail}`).join("\n");
  return `You are TalentBridge's Capability Graph engine. Assess what this candidate is exceptionally good at doing, not just what their resume says they have done. An employer will use this to tell this candidate apart from other experienced people in the same field.

Current date: ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}

THE RUBRIC (use it exactly)
Depth level for each capability (each level includes the ones below):
${levels}

Evidence type for each capability:
- demonstrated: a specific example with actions and outcomes (most proof stories are this)
- described: stated as a responsibility, without a concrete outcome
- inferred: implied only by titles, skills or education
Never rate above level 2 on inferred evidence alone, or above level 3 on described evidence alone. Levels 4 and 5 need demonstrated evidence.

HOW TO NAME CAPABILITIES
- Name 5 to 8 specific competencies the way a hiring manager in this candidate's field would, e.g. "Root cause investigation", "Hazard and risk assessment", "Sanitation program design", "Verification and validation", "Recall and crisis response", "Operational data analysis". Never use broad umbrella categories such as "Food Safety Management" or "Leadership".
- Distinguish running an existing program (level 2) from building, evaluating and improving one (levels 3 to 4).

WHAT SETS THEM APART
- Decide what is baseline (expected of anyone at this candidate's experience in this field). Routine duties, such as conducting scheduled audits for an experienced quality professional, are baseline even if done well: mark them differentiator=false.
- Mark differentiator=true only for capabilities at level 3 or above with described or demonstrated evidence that most peers at this level would not show: the work behind the routine duties.
- The evidence field must cite the specific example (a proof story, a result, a number). Do not restate the capability name.

GAPS
- In follow_up_questions, ask 2 to 4 specific questions whose answers would most change this assessment (e.g. "Have you led a recall or market withdrawal? What was your role?").

CANDIDATE
Headline: ${profile.headline || ""}
Skills: ${(profile.skills || []).join(", ")}
Experience: ${profile.experience_years || "?"} years (${profile.experience_level || "level not given"})
Work history: ${profile.work_history || ""}
Education: ${profile.education || ""}
Career goals: ${profile.career_goals || ""}

PROOF STORIES (the candidate's own examples; strongest evidence)
${storiesText(profile.proof_stories)}`;
}

export const GRAPH_SCHEMA = {
  type: "object",
  properties: {
    capability_headline: { type: "string", description: "One sentence on what this person is exceptionally good at" },
    field_baseline: { type: "string", description: "What is expected of anyone at this experience level in this field" },
    core_execution_vectors: {
      type: "array",
      items: {
        type: "object",
        properties: {
          vector: { type: "string", description: "Specific competency name" },
          level: { type: "integer", description: "Depth level 1-5 from the rubric" },
          evidence_type: { type: "string", enum: ["demonstrated", "described", "inferred"] },
          differentiator: { type: "boolean" },
          evidence: { type: "string", description: "The specific example behind the rating" },
        },
      },
    },
    follow_up_questions: { type: "array", items: { type: "string" } },
    adjacent_zones: { type: "array", items: { type: "string" } },
    suggested_role_types: { type: "array", items: { type: "string" } },
  },
};
