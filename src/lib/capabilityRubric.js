// The Capability Graph rubric: what is measured, and how depth is decided.
// Shown to seekers ("How we assess") and employers, and sent to the AI, so
// all three read the same definitions.
import { normalizePercent } from "@/lib/scales";

// The definitions live in capabilityRubric.json, which the server reads too
// (server/src/capability.js builds graphs and enforces the rules).
import RUBRIC from "./capabilityRubric.json";

export const RUBRIC_VERSION = RUBRIC.version;
// Depth: what the person has shown they can do with a capability, not how
// long they've done it. Each level includes the ones below it.
export const LEVELS = RUBRIC.levels;
// How strong the evidence behind a rating is.
export const EVIDENCE = RUBRIC.evidence;
// Guided prompts for the evidence resumes leave out.
export const STORY_PROMPTS = RUBRIC.story_prompts;

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
