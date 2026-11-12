import React from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, Circle, Eye, EyeOff } from "lucide-react";
import { graphBuilt, isListable, profileCompleteness } from "@/lib/completeness";

// Steps that take a seeker from signup to a profile employers can find.
// Each step deep-links to the tab (and field) that completes it.
export function checklistSteps(saved) {
  const p = saved || {};
  return [
    { key: "name", label: "Add your name", done: !!String(p.full_name || "").trim(), tab: "profile", focus: "full_name" },
    { key: "headline", label: "Write a headline", done: !!String(p.headline || p.bio || "").trim(), tab: "profile", focus: "headline" },
    { key: "resume", label: "Upload your resume", done: !!p.resume_url, tab: "resume" },
    { key: "graph", label: "Build your Capability Graph", done: graphBuilt(p), tab: "capability" },
    { key: "skills", label: "Confirm your skills", done: Array.isArray(p.skills) && p.skills.length > 0, tab: "profile", focus: "skill-input" },
  ];
}

export default function ProfileChecklist({ saved, onGo }) {
  const steps = checklistSteps(saved);
  const done = steps.filter((s) => s.done).length;
  const listable = isListable(saved);
  const hidden = saved?.open_to_opportunities === false;
  const { missing } = profileCompleteness(saved || {});

  if (done === steps.length && listable) {
    return (
      <Card className="p-4 flex items-center gap-3 border-emerald-200 bg-emerald-50">
        <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
        <p className="text-sm text-emerald-900">
          Your profile is complete and visible to approved employers. Keep it current to get better matches.
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-4 sm:p-5 space-y-3 border-primary/20 bg-primary/5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm sm:text-base font-semibold">Finish your profile</h2>
        <span className="text-xs font-semibold text-primary">{done}/{steps.length} done</span>
      </div>
      <Progress value={(done / steps.length) * 100} className="h-2" />
      <p className={`text-xs flex items-center gap-1.5 ${listable ? "text-emerald-700" : "text-muted-foreground"}`}>
        {listable ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
        {listable
          ? "You're visible to approved employers. Finishing the rest improves your matches."
          : hidden
            ? "You've hidden your profile from employers (switch it back on under Profile)."
            : `Not visible to employers yet${missing.length ? `: add ${missing.join(", ")}` : ""}. You also need this to apply.`}
      </p>
      <ol className="grid gap-1.5 sm:grid-cols-2">
        {steps.map((s, i) => (
          <li key={s.key}>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={s.done}
              onClick={() => onGo(s.tab, s.focus)}
              className={`w-full justify-start gap-2 h-auto py-1.5 text-left ${s.done ? "opacity-70" : "hover:bg-primary/10"}`}
            >
              {s.done ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" /> : <Circle className="w-4 h-4 text-primary shrink-0" />}
              <span className={`text-sm ${s.done ? "line-through text-muted-foreground" : ""}`}>{i + 1}. {s.label}</span>
            </Button>
          </li>
        ))}
      </ol>
    </Card>
  );
}
