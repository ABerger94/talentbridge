// Turns a profile's work history into a list of roles for display.
//
// work_history is free text (typed by the seeker or filled in from their
// resume), e.g.:
//   "QA Lab Manager at Cloverland Farms Dairy (Jan-Mar 2023); Vendor QA Analyst at Ingredion, Inc. (Aug 2019-May 2022)"
//   "QA Lab Manager, Cloverland Farms Dairy (2023)\nVendor QA Analyst, Ingredion (2019–2022)"
// or a list of { title, company, start, end, description } objects.
// Anything that can't be read as a role is kept, as a role's description or
// as text on its own: nothing is dropped.

const MONTH = "(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?";
const DATE = `(?:${MONTH}\\s+)?(?:\\d{4})?`;
// "(Jan-Mar 2023)", "(Aug 2019 - May 2022)", "(2023-Present)", "(2019)"
const PAREN_DATES = /\s*\(([^()]*\d{4}[^()]*|[^()]*\b(?:present|current|now)\b[^()]*)\)\s*\.?\s*$/i;
// Trailing dates without parentheses: "... 2019 – 2022", "... Aug 2019 - Present"
const BARE_DATES = new RegExp(`\\s*[,|·–—-]?\\s*((?:${MONTH}\\s*)?\\d{4}\\s*(?:[-–—]|to)\\s*(?:(?:${MONTH}\\s*)?\\d{4}|present|current|now))\\s*\\.?\\s*$`, "i");

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

// A sortable number for the end of a date range ("Present" sorts first).
function endKey(dates) {
  const d = String(dates || "").toLowerCase();
  if (!d) return null;
  if (/\b(present|current|now)\b/.test(d)) return 999999;
  const years = [...d.matchAll(/\d{4}/g)].map((m) => Number(m[0]));
  if (!years.length) return null;
  const year = years[years.length - 1];
  // The month nearest the end of the string belongs to the end date.
  const months = [...d.matchAll(new RegExp(MONTH, "gi"))].map((m) => MONTHS.indexOf(m[0].slice(0, 3).toLowerCase()));
  const month = months.length ? months[months.length - 1] : 11;
  return year * 100 + (month >= 0 ? month : 11);
}

const tidyDates = (d) => String(d || "").replace(/\s*(?:[-–—]|to)\s*/i, " – ").replace(/\s+/g, " ").trim();

function parseLine(raw) {
  let text = String(raw || "").replace(/^[\s•·*–—-]+/, "").trim().replace(/[.;]\s*$/, "");
  if (!text) return null;
  let dates = "";
  const p = text.match(PAREN_DATES);
  if (p) { dates = p[1]; text = text.slice(0, p.index).trim(); } else {
    const b = text.match(BARE_DATES);
    if (b) { dates = b[1]; text = text.slice(0, b.index).trim(); }
  }
  let title = text;
  let company = "";
  const at = text.match(/^(.+?)\s+(?:at|@)\s+(.+)$/i);
  if (at) { [, title, company] = at; } else {
    // "Title, Company" or "Title | Company" (only when it looks like a role).
    const sep = text.match(/^(.{2,80}?)\s*(?:,|\||·| — )\s*(.{2,80})$/);
    if (sep && (dates || sep[1].split(/\s+/).length <= 8)) [, title, company] = sep;
  }
  return { title: title.trim(), company: company.trim(), dates: tidyDates(dates), description: "" };
}

const looksLikeRole = (r, line) => !!r && (r.dates || r.company) && line.length <= 160;

export function parseWorkHistory(value) {
  if (!value) return { roles: [], leftover: "" };
  if (Array.isArray(value)) {
    const roles = value.map((w) => (typeof w === "string" ? parseLine(w) : {
      title: String(w.title || w.role || "").trim(),
      company: String(w.company || w.employer || "").trim(),
      dates: tidyDates(w.dates || [w.start || w.start_date, w.end || w.end_date].filter(Boolean).join(" – ")),
      description: String(w.description || w.summary || "").trim(),
    })).filter((r) => r && (r.title || r.company));
    return { roles: sortRoles(roles), leftover: "" };
  }
  const text = String(value).trim();
  // One role per line, or roles separated by semicolons.
  const lines = text.split(/\n+|;\s*(?=\S)/).map((l) => l.trim()).filter(Boolean);
  const roles = [];
  const loose = [];
  for (const line of lines) {
    const r = parseLine(line);
    if (looksLikeRole(r, line)) roles.push(r);
    else if (roles.length) roles[roles.length - 1].description += `${roles[roles.length - 1].description ? "\n" : ""}${line.replace(/^[•·*–—-]\s*/, "")}`;
    else loose.push(line);
  }
  // Not really a list of roles: show the text as written.
  if (roles.length < 1) return { roles: [], leftover: text };
  return { roles: sortRoles(roles), leftover: loose.join("\n") };
}

// Newest first when every role has a date; otherwise keep the seeker's order.
function sortRoles(roles) {
  if (!roles.every((r) => endKey(r.dates) != null)) return roles;
  return roles.map((r, i) => ({ r, i })).sort((a, b) => endKey(b.r.dates) - endKey(a.r.dates) || a.i - b.i).map((x) => x.r);
}
