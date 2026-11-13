import React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { HelpCircle, Sparkles, MessageCircleQuestion } from "lucide-react";
import { LEVELS, EVIDENCE, levelInfo } from "@/lib/capabilityRubric";

// Five segments, filled to the capability's depth level.
export function DepthMeter({ level }) {
  return (
    <div className="flex gap-0.5" aria-hidden="true">
      {LEVELS.map((l) => (
        <span key={l.level} className={`h-1.5 w-5 rounded-full ${l.level <= level ? "bg-primary" : "bg-primary/15"}`} />
      ))}
    </div>
  );
}

export function LevelBadge({ level }) {
  const info = levelInfo(level);
  if (!info) return null;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-primary" title={info.detail}>
      <DepthMeter level={level} />
      {info.level} · {info.name}
    </span>
  );
}

const EVIDENCE_TONE = {
  demonstrated: "bg-emerald-50 text-emerald-800 border-emerald-200",
  described: "bg-sky-50 text-sky-800 border-sky-200",
  inferred: "bg-secondary text-muted-foreground border-border",
};

export function EvidenceBadge({ type }) {
  if (!EVIDENCE[type]) return null;
  return <Badge variant="outline" className={`text-[10px] font-medium ${EVIDENCE_TONE[type]}`} title={EVIDENCE[type].detail}>{EVIDENCE[type].label}</Badge>;
}

export function RubricDialog({ trigger }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        {trigger || (
          <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs text-muted-foreground">
            <HelpCircle className="w-3.5 h-3.5" /> How we assess
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>How the Capability Graph is assessed</DialogTitle>
          <DialogDescription>
            Each capability gets a depth level and an evidence type. Depth is about what someone has shown they can do, not years in the job.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <div className="space-y-2">
            <p className="font-semibold">Depth levels</p>
            {LEVELS.map((l) => (
              <div key={l.level} className="flex gap-3">
                <div className="pt-1.5 shrink-0"><DepthMeter level={l.level} /></div>
                <p><b>{l.level} · {l.name}.</b> <span className="text-muted-foreground">{l.detail}</span></p>
              </div>
            ))}
          </div>
          <div className="space-y-2">
            <p className="font-semibold">Evidence</p>
            {Object.entries(EVIDENCE).map(([k, e]) => (
              <p key={k} className="flex gap-2 items-start"><EvidenceBadge type={k} /> <span className="text-muted-foreground">{e.detail}</span></p>
            ))}
            <p className="text-muted-foreground">Ratings are capped by evidence: inferred evidence can’t go above level 2, described above level 3. Levels 4 and 5 need a specific example, which is what proof stories are for.</p>
          </div>
          <div className="space-y-1">
            <p className="font-semibold">What sets you apart</p>
            <p className="text-muted-foreground">
              Routine duties expected of anyone at your experience, like scheduled audits for a seasoned quality lead, are listed as expected at your level, not as strengths.
              Differentiators are capabilities at level 3 or deeper, backed by real evidence, that most peers wouldn’t show.
            </p>
          </div>
          <p className="text-xs text-muted-foreground">The assessment is AI-assisted and reads only what you’ve written. Employers see the same levels and evidence you see.</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Capability({ v, compact }) {
  return (
    <div className={compact ? "py-2" : "rounded-lg border border-border p-3 space-y-1.5"}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="text-sm font-medium">{v.vector}</span>
        <div className="flex items-center gap-2">
          <LevelBadge level={v.level} />
          <EvidenceBadge type={v.evidence_type} />
        </div>
      </div>
      {v.evidence && <p className={`text-xs text-muted-foreground ${compact ? "line-clamp-1 mt-0.5" : ""}`}>{v.evidence}</p>}
    </div>
  );
}

export default function CapabilityGraphView({ graph, onAddStory }) {
  const caps = graph.core_execution_vectors || [];
  const apart = caps.filter((v) => v.differentiator);
  const baseline = caps.filter((v) => !v.differentiator);

  if (graph.legacy) {
    return (
      <div className="space-y-3">
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
          This graph was built with our earlier method, which gave broad categories a percentage. Rebuild it to get specific capabilities with depth levels, evidence, and what sets you apart.
        </div>
        <div className="flex flex-wrap gap-1.5">
          {caps.map((v, i) => <Badge key={i} variant="secondary" className="text-xs">{v.vector}</Badge>)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        {graph.capability_headline && (
          <div className="rounded-xl bg-primary/8 border border-primary/15 p-3 sm:p-4">
            <p className="text-sm sm:text-base font-medium">{graph.capability_headline}</p>
          </div>
        )}
        <div className="flex justify-end"><RubricDialog /></div>
      </div>

      <section className="space-y-2">
        <h3 className="text-xs sm:text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-primary" /> What sets you apart
        </h3>
        {apart.length ? apart.map((v, i) => <Capability key={i} v={v} />) : (
          <p className="text-sm text-muted-foreground rounded-lg border border-dashed border-border p-3">
            Nothing stands out from peers yet, usually because the evidence is thin rather than the experience. Proof stories are the fastest way to change that.
          </p>
        )}
      </section>

      {baseline.length > 0 && (
        <section>
          <h3 className="text-xs sm:text-sm font-semibold uppercase tracking-wider text-muted-foreground">Expected at your level</h3>
          {graph.field_baseline && <p className="text-xs text-muted-foreground mt-1">{graph.field_baseline}</p>}
          <div className="divide-y divide-border mt-1">
            {baseline.map((v, i) => <Capability key={i} v={v} compact />)}
          </div>
        </section>
      )}

      {graph.follow_up_questions?.length > 0 && (
        <section className="rounded-lg bg-secondary p-3 sm:p-4 space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <MessageCircleQuestion className="w-3.5 h-3.5" /> Questions that would sharpen this
          </h3>
          <ul className="text-sm space-y-1 list-disc pl-5">
            {graph.follow_up_questions.slice(0, 4).map((q, i) => <li key={i}>{q}</li>)}
          </ul>
          {onAddStory && <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={onAddStory}>Answer with a proof story</Button>}
        </section>
      )}

      <div className="grid sm:grid-cols-2 gap-4">
        {graph.adjacent_zones?.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Could move into quickly</h3>
            <div className="flex flex-wrap gap-1.5">{graph.adjacent_zones.map((z, i) => <Badge key={i} variant="outline" className="text-xs bg-accent/8 border-accent/20 text-accent">{z}</Badge>)}</div>
          </div>
        )}
        {graph.suggested_role_types?.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Roles you’re built for</h3>
            <div className="flex flex-wrap gap-1.5">{graph.suggested_role_types.map((r, i) => <Badge key={i} variant="secondary" className="text-xs">{r}</Badge>)}</div>
          </div>
        )}
      </div>
    </div>
  );
}
