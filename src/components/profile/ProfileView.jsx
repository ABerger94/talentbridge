import React from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, Briefcase, Sparkles, BookOpen, GraduationCap, Wrench, ArrowUpRight } from "lucide-react";
import ProfessionalLinks from "@/components/seeker/ProfessionalLinks";
import { LevelBadge, EvidenceBadge, RubricDialog } from "@/components/seeker/CapabilityGraphView";
import { STORY_PROMPTS } from "@/lib/capabilityRubric";

const WORK_TYPE = { remote: "Remote", hybrid: "Hybrid", onsite: "On-site", any: "Open to any" };
const LEVEL = { entry: "Entry level", mid: "Mid level", senior: "Senior", lead: "Lead", executive: "Executive" };

const initials = (name) => String(name || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";

export function Avatar({ name, src, size = "h-24 w-24 text-3xl" }) {
  return src ? (
    <img src={src} alt={name ? `${name}’s photo` : "Profile photo"} className={`${size} rounded-full object-cover border-4 border-card shadow-md bg-secondary`} />
  ) : (
    <div className={`${size} rounded-full border-4 border-card shadow-md bg-primary/10 text-primary font-bold flex items-center justify-center`} aria-hidden="true">{initials(name)}</div>
  );
}

function Section({ icon: Icon, title, children, aside }) {
  return (
    <Card className="p-5 sm:p-6 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2"><Icon className="w-4 h-4 text-primary" />{title}</h2>
        {aside}
      </div>
      {children}
    </Card>
  );
}

// The seeker's prompts say "you"; on their profile page it's "they".
const THIRD_PERSON = {
  investigation: "A failure they investigated",
  risk: "A risk they caught early",
  emergency: "An emergency they handled",
  built: "A system they built or fixed",
  data: "Data that changed an operation",
  accountability: "Holding others accountable",
};
const storyTitle = (s) => (s.question ? `Asked: ${s.question}` : THIRD_PERSON[s.prompt_id] || STORY_PROMPTS.find((p) => p.id === s.prompt_id)?.title || "Story");

// Work history is free text or a list of { title, company, description }.
function WorkHistory({ value }) {
  if (Array.isArray(value)) {
    return (
      <ul className="space-y-3">
        {value.map((w, i) => (typeof w === "string" ? <li key={i} className="text-sm whitespace-pre-line">{w}</li> : (
          <li key={i}>
            <p className="font-medium text-sm">{[w.title || w.role, w.company].filter(Boolean).join(" · ")}</p>
            {(w.description || w.summary) && <p className="text-sm text-muted-foreground whitespace-pre-line mt-0.5">{w.description || w.summary}</p>}
          </li>
        )))}
      </ul>
    );
  }
  return <p className="text-sm whitespace-pre-line leading-relaxed">{String(value)}</p>;
}

// A seeker's profile page, as employers (and public-link visitors) see it.
export default function ProfileView({ profile, actions }) {
  const graph = profile.capability_graph;
  const caps = graph?.core_execution_vectors || [];
  const rubric = graph && Number(graph.rubric_version || 1) >= 2;
  const apart = rubric ? caps.filter((c) => c.differentiator) : [];
  const expected = rubric ? caps.filter((c) => !c.differentiator) : [];
  const facts = [
    profile.location && { icon: MapPin, text: profile.location },
    profile.work_type && WORK_TYPE[profile.work_type] && { icon: Briefcase, text: WORK_TYPE[profile.work_type] },
    (profile.experience_years || profile.experience_level) && {
      icon: Sparkles,
      text: [profile.experience_years ? `${profile.experience_years} years` : null, LEVEL[profile.experience_level]].filter(Boolean).join(" · "),
    },
  ].filter(Boolean);

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <div className="h-24 sm:h-28 bg-gradient-to-r from-[#1d0f4a] via-[#3a1590] to-[#6a2fe6]" aria-hidden="true" />
        <div className="px-5 sm:px-6 pb-5">
          {/* Only the photo overlaps the banner; the name sits below it. */}
          <div className="-mt-12"><Avatar name={profile.full_name} src={profile.photo_url} /></div>
          <div className="mt-3 flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-5">
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-bold leading-tight break-words">{profile.full_name || "Unnamed profile"}</h1>
              {profile.headline && <p className="text-muted-foreground mt-0.5">{profile.headline}</p>}
            </div>
            {actions && <div className="shrink-0">{actions}</div>}
          </div>
          {facts.length > 0 && (
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-4 text-sm text-muted-foreground">
              {facts.map((f, i) => <span key={i} className="inline-flex items-center gap-1.5"><f.icon className="w-4 h-4" />{f.text}</span>)}
            </div>
          )}
          {graph?.capability_headline && (
            <p className="mt-4 rounded-xl bg-primary/5 border border-primary/15 p-3 text-sm sm:text-base font-medium">{graph.capability_headline}</p>
          )}
          {profile.bio && <p className="mt-3 text-sm leading-relaxed whitespace-pre-line">{profile.bio}</p>}
          {profile.links?.length > 0 && <div className="mt-3"><ProfessionalLinks links={profile.links} /></div>}
        </div>
      </Card>

      {graph && (
        <Section icon={Sparkles} title="What sets them apart" aside={rubric ? <RubricDialog /> : null}>
          {!rubric ? (
            <div className="flex flex-wrap gap-1.5">{caps.map((c, i) => <Badge key={i} variant="secondary">{c.vector}</Badge>)}</div>
          ) : apart.length ? (
            <div className="space-y-2">
              {apart.map((c, i) => (
                <div key={i} className="rounded-lg border border-border p-3 space-y-1">
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                    <span className="font-medium text-sm">{c.vector}</span>
                    <span className="flex items-center gap-2"><LevelBadge level={c.level} /><EvidenceBadge type={c.evidence_type} /></span>
                  </div>
                  {c.evidence && <p className="text-sm text-muted-foreground">{c.evidence}</p>}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Their Capability Graph doesn’t show standout strengths yet.</p>
          )}
        </Section>
      )}

      {profile.proof_stories?.length > 0 && (
        <Section icon={BookOpen} title="Proof of their work">
          <div className="space-y-3">
            {profile.proof_stories.map((s, i) => (
              <div key={i} className="rounded-lg bg-secondary/50 p-3 sm:p-4 space-y-1.5">
                <p className="font-semibold text-sm">{storyTitle(s)}</p>
                {s.situation && <p className="text-sm"><span className="text-muted-foreground">Situation: </span>{s.situation}</p>}
                {s.action && <p className="text-sm"><span className="text-muted-foreground">What they did: </span>{s.action}</p>}
                {s.result && <p className="text-sm"><span className="text-muted-foreground">Result: </span>{s.result}</p>}
              </div>
            ))}
          </div>
        </Section>
      )}

      {expected.length > 0 && (
        <Section icon={Wrench} title="Expected at their level">
          {graph.field_baseline && <p className="text-xs text-muted-foreground -mt-1">{graph.field_baseline}</p>}
          <div className="divide-y divide-border">
            {expected.map((c, i) => (
              <div key={i} className="py-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <span className="text-sm">{c.vector}</span>
                <span className="flex items-center gap-2"><LevelBadge level={c.level} /><EvidenceBadge type={c.evidence_type} /></span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {profile.work_history && (
        <Section icon={Briefcase} title="Experience"><WorkHistory value={profile.work_history} /></Section>
      )}

      {profile.education && (
        <Section icon={GraduationCap} title="Education"><p className="text-sm whitespace-pre-line">{profile.education}</p></Section>
      )}

      {(profile.skills?.length > 0 || graph?.adjacent_zones?.length > 0) && (
        <Section icon={Wrench} title="Skills">
          {profile.skills?.length > 0 && <div className="flex flex-wrap gap-1.5">{profile.skills.map((s) => <Badge key={s} variant="outline" className="font-normal">{s}</Badge>)}</div>}
          {graph?.adjacent_zones?.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1"><ArrowUpRight className="w-3.5 h-3.5" />Could move into</p>
              <div className="flex flex-wrap gap-1.5">{graph.adjacent_zones.map((z) => <Badge key={z} variant="outline" className="font-normal bg-accent/8 border-accent/20 text-accent">{z}</Badge>)}</div>
            </div>
          )}
        </Section>
      )}
    </div>
  );
}
