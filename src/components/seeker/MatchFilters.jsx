import React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MapPin, X } from "lucide-react";

const STORAGE_KEY = "tb_match_filters";

export const MATCH_FILTER_KEYS = ["location", "work_type", "experience_level", "employment_type", "min_salary", "posted_within", "origin"];

// Filters are remembered on this device, so a seeker who only wants remote
// roles doesn't have to set it every visit.
export function loadMatchFilters() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}");
    return Object.fromEntries(MATCH_FILTER_KEYS.filter((k) => typeof saved[k] === "string" && saved[k]).map((k) => [k, saved[k]]));
  } catch {
    return {};
  }
}

export function saveMatchFilters(filters) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
  } catch {
    // Private browsing or blocked storage: filters just aren't remembered.
  }
}

const SELECTS = [
  { key: "work_type", label: "Work type", any: "Any work type", options: [["remote", "Remote"], ["hybrid", "Hybrid"], ["onsite", "On-site"]] },
  { key: "experience_level", label: "Level", any: "Any level", options: [["entry", "Entry level"], ["mid", "Mid level"], ["senior", "Senior"], ["lead", "Lead"], ["executive", "Executive"]] },
  { key: "employment_type", label: "Job type", any: "Any job type", options: [["full_time", "Full-time"], ["part_time", "Part-time"], ["contract", "Contract"], ["internship", "Internship"], ["freelance", "Freelance"]] },
  { key: "min_salary", label: "Pay at least", any: "Any pay", options: [["40000", "$40k"], ["60000", "$60k"], ["80000", "$80k"], ["100000", "$100k"], ["125000", "$125k"], ["150000", "$150k"]] },
  { key: "posted_within", label: "Posted", any: "Any time", options: [["1", "Past 24 hours"], ["7", "Past week"], ["30", "Past month"]] },
  { key: "origin", label: "Source", any: "All sources", options: [["direct", "Posted on TalentBridge"], ["imported", "Company job boards"]] },
];

export default function MatchFilters({ filters, onChange, pool }) {
  const set = (key, value) => onChange({ ...filters, [key]: value || "" });
  const active = MATCH_FILTER_KEYS.filter((k) => filters[k]).length;

  return (
    <div className="rounded-xl border border-border bg-secondary/30 p-3 sm:p-4 mb-4 space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-3">
        <div className="col-span-2 sm:col-span-3 space-y-1">
          <Label htmlFor="match-location" className="text-xs text-muted-foreground">Location</Label>
          <div className="relative">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="match-location"
              placeholder="City, state, or Remote"
              className="pl-9 h-10 bg-card"
              value={filters.location || ""}
              onChange={(e) => set("location", e.target.value)}
            />
          </div>
        </div>
        {SELECTS.map((f) => (
          <div key={f.key} className="space-y-1 min-w-0">
            <Label htmlFor={`match-${f.key}`} className="text-xs text-muted-foreground">{f.label}</Label>
            <Select value={filters[f.key] || "any"} onValueChange={(v) => set(f.key, v === "any" ? "" : v)}>
              <SelectTrigger id={`match-${f.key}`} className="h-10 bg-card">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">{f.any}</SelectItem>
                {f.options.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between gap-3 flex-wrap text-xs text-muted-foreground">
        <p aria-live="polite">
          {pool == null
            ? "Counting roles…"
            : active
              ? `${pool.toLocaleString()} open ${pool === 1 ? "role fits" : "roles fit"} these filters.`
              : `${pool.toLocaleString()} open roles to match against.`}
          {filters.min_salary ? " Roles that don't list pay are included." : ""}
        </p>
        {active > 0 && (
          <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 px-2 text-muted-foreground" onClick={() => onChange({})}>
            <X className="w-3 h-3" /> Clear filters
          </Button>
        )}
      </div>
    </div>
  );
}
