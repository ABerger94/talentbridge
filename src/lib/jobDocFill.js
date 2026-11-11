// Maps AI-extracted job-posting fields onto the Post a Role form.
// Used by components/jobs/JobDocUploader.jsx.

export const ENUMS = {
  work_type: ["remote", "hybrid", "onsite"],
  employment_type: ["full_time", "part_time", "contract", "internship", "freelance"],
  experience_level: ["entry", "mid", "senior", "lead", "executive"],
};

const TEXT_FIELDS = [
  "title", "company", "location", "industry", "description", "responsibilities",
  "qualifications", "nice_to_haves", "benefits", "growth_opportunities",
];

const LIST_FIELDS = ["skills", "culture_values"];

export const LABELS = {
  title: "Job title", company: "Company", location: "Location", industry: "Industry",
  description: "Description", responsibilities: "Responsibilities", qualifications: "Qualifications",
  nice_to_haves: "Nice-to-haves", benefits: "Benefits", growth_opportunities: "Growth opportunities",
  salary_min: "Minimum salary", salary_max: "Maximum salary",
};

export const JOB_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string", description: "Job title" },
    company: { type: "string", description: "Hiring company name" },
    location: { type: "string", description: "City/region, or empty if fully remote and unstated" },
    industry: { type: "string" },
    work_type: { type: "string", enum: ENUMS.work_type, description: "Only if the posting states it" },
    employment_type: { type: "string", enum: ENUMS.employment_type, description: "Only if the posting states it" },
    experience_level: { type: "string", enum: ENUMS.experience_level, description: "Only if the posting states or clearly implies it" },
    salary_min: { type: "number", description: "Lower bound of the annual salary as a plain number (no currency symbols); omit if not stated" },
    salary_max: { type: "number", description: "Upper bound of the annual salary as a plain number; omit if not stated" },
    description: { type: "string", description: "The role overview / summary, as written in the document" },
    responsibilities: { type: "string", description: "Responsibilities, one per line" },
    qualifications: { type: "string", description: "Required qualifications, one per line" },
    nice_to_haves: { type: "string", description: "Preferred / bonus qualifications, one per line" },
    benefits: { type: "string", description: "Benefits and perks, one per line" },
    growth_opportunities: { type: "string", description: "Career growth / learning opportunities mentioned" },
    skills: { type: "array", items: { type: "string" }, description: "Concrete skills and technologies named in the posting" },
    culture_values: { type: "array", items: { type: "string" }, description: "Company values / culture traits named in the posting" },
  },
};

const clean = (v) => (typeof v === "string" ? v.trim() : "");
const toNumber = (v) => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? String(Math.round(n)) : "";
};

// Split extracted values into fills for empty fields and conflicts with
// values the employer already entered.
export function planJobFill(extracted, form) {
  const fills = {};
  const conflicts = {};
  if (!extracted || typeof extracted !== "object") return { fills, conflicts };

  const consider = (key, value) => {
    if (!value) return;
    const current = String(form[key] ?? "").trim();
    if (!current) fills[key] = value;
    else if (current !== value) conflicts[key] = value;
  };

  for (const key of TEXT_FIELDS) consider(key, clean(extracted[key]));
  consider("salary_min", toNumber(extracted.salary_min));
  consider("salary_max", toNumber(extracted.salary_max));

  // Selects always hold a default, so a value stated in the document wins.
  for (const [key, allowed] of Object.entries(ENUMS)) {
    const v = clean(extracted[key]).toLowerCase();
    if (allowed.includes(v) && v !== form[key]) fills[key] = v;
  }

  for (const key of LIST_FIELDS) {
    const incoming = Array.isArray(extracted[key]) ? extracted[key].map(clean).filter(Boolean) : [];
    const merged = [...new Set([...(form[key] || []), ...incoming])];
    if (merged.length > (form[key] || []).length) fills[key] = merged;
  }
  return { fills, conflicts };
}
