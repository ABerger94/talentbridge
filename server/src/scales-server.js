'use strict';
// Server-side twin of src/lib/scales.js — keep the two in sync.
// LLM scores are displayed as percents (0-100); models sometimes return
// 0-1 fractions when a scale isn't pinned. Normalize at the boundary.
function normalizePercent(value, fallback = null) {
  const n = typeof value === 'number' ? value : parseFloat(value);
  if (!Number.isFinite(n)) return fallback;
  const scaled = n > 0 && n <= 1 ? n * 100 : n;
  return Math.min(100, Math.max(0, Math.round(scaled)));
}
module.exports = { normalizePercent };
