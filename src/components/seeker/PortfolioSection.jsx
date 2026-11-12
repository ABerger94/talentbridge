import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Link2, Plus, Trash2, Sparkles, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import ProfessionalLinks, { LINK_TYPES, linksOf } from "./ProfessionalLinks";

const MAX = 8;

function guessType(url) {
  const u = url.toLowerCase();
  if (u.includes("linkedin.com")) return "linkedin";
  if (u.includes("github.com") || u.includes("gitlab.com")) return "github";
  if (/behance\.net|dribbble\.com|artstation\.com|vimeo\.com|youtube\.com|medium\.com|substack\.com/.test(u)) return "portfolio";
  return "website";
}

export default function PortfolioSection({ seeker, onUpdate }) {
  const [rows, setRows] = useState(() => linksOf(seeker).map((l) => ({ ...l, touched: true })));
  const [saving, setSaving] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  // Reload from the saved profile (e.g. after saving, links come back cleaned
  // of tracking parameters).
  const savedKey = JSON.stringify(linksOf(seeker));
  useEffect(() => {
    setRows(JSON.parse(savedKey).map((l) => ({ ...l, touched: true })));
  }, [savedKey]);

  const update = (i, patch) => setRows((r) => r.map((row, j) => (j === i ? { ...row, ...patch } : row)));
  const filled = rows.filter((r) => r.url.trim());

  const save = async () => {
    setSaving(true);
    setErrorMessage("");
    try {
      const professional_links = filled.map(({ url, type, label }) => ({ url: url.trim(), type, label }));
      let profileId = seeker?.id;
      if (!profileId) {
        const created = await base44.entities.SeekerProfile.create({ professional_links });
        profileId = created.id;
      } else {
        await base44.entities.SeekerProfile.update(profileId, { professional_links });
      }
      toast.success("Links saved. Employers will see them on your profile.");
      onUpdate?.();
      return profileId;
    } catch (error) {
      const message = error?.message || "Couldn't save your links.";
      setErrorMessage(message);
      toast.error(message);
      return null;
    } finally {
      setSaving(false);
    }
  };

  const analyze = async () => {
    if (!filled.length) {
      setErrorMessage("Add at least one link first.");
      return;
    }
    const profileId = await save(); // analyze what's saved
    if (!profileId) return;
    setAnalyzing(true);
    try {
      await base44.functions.invoke("analyzePortfolio", { seeker_profile_id: profileId });
      toast.success("Links analyzed! Employers can now see what your pages show.");
      onUpdate?.();
    } catch (error) {
      const message = error?.message || "Couldn't analyze your links.";
      setErrorMessage(message);
      toast.error(message);
    } finally {
      setAnalyzing(false);
    }
  };

  const analysis = seeker?.portfolio_analysis;
  // Older analyses used developer-specific fields; show whichever exists.
  const strengths = analysis?.strengths || analysis?.technical_strengths || [];
  const overview = analysis?.overview || analysis?.github_analysis || "";
  const highlights = analysis?.highlights || (analysis?.project_highlights || []).map((p) => ({ title: p.name, detail: p.impact }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Link2 className="w-5 h-5" /> Professional Links
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          Add the pages that show your work: your website, LinkedIn, a practice or booking page, a portfolio, GitHub,
          or anything else. Employers see these on your profile and applications.
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="space-y-3">
          {rows.map((row, i) => (
            <div key={i} className="rounded-lg border p-3 space-y-2 sm:space-y-0 sm:flex sm:items-center sm:gap-2">
              <Select value={row.type} onValueChange={(type) => update(i, { type, touched: true })}>
                <SelectTrigger className="sm:w-[130px] text-sm" aria-label="Link type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LINK_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input
                value={row.url}
                onChange={(e) => {
                  const url = e.target.value;
                  update(i, { url, ...(row.touched ? {} : { type: guessType(url) }) });
                }}
                placeholder="https://…"
                inputMode="url"
                className="text-sm sm:flex-1"
                aria-label="Link address"
              />
              <div className="flex gap-2">
                <Input
                  value={row.label}
                  onChange={(e) => update(i, { label: e.target.value })}
                  placeholder="Label (optional)"
                  maxLength={60}
                  className="text-sm sm:w-[150px]"
                  aria-label="Link label"
                />
                <Button type="button" variant="ghost" size="icon" onClick={() => setRows((r) => r.filter((_, j) => j !== i))} aria-label="Remove link">
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
          {rows.length < MAX && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs"
              onClick={() => setRows((r) => [...r, { url: "", type: "website", label: "", touched: false }])}
            >
              <Plus className="w-3.5 h-3.5" /> Add a link
            </Button>
          )}
        </div>

        <div className="flex gap-2 pt-1 flex-wrap">
          <Button size="sm" variant="outline" onClick={save} disabled={saving || analyzing} className="text-xs">
            {saving && !analyzing ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
            Save links
          </Button>
          <Button size="sm" onClick={analyze} disabled={analyzing || saving || !filled.length} className="text-xs gap-1">
            {analyzing ? <><Loader2 className="w-3 h-3 animate-spin" /> Analyzing…</> : <><Sparkles className="w-3 h-3" /> Analyze my links</>}
          </Button>
        </div>

        {errorMessage && (
          <div className="rounded-lg bg-destructive/5 border border-destructive/20 p-3 flex gap-2">
            <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
            <p className="text-xs text-destructive leading-relaxed">{errorMessage}</p>
          </div>
        )}

        {linksOf(seeker).length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-muted-foreground">What employers see</p>
            <ProfessionalLinks links={linksOf(seeker)} />
          </div>
        )}

        {analysis && (
          <div className="rounded-lg bg-accent/5 border border-accent/20 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-accent" />
              <span className="text-xs font-semibold text-accent">Links analyzed</span>
              {analysis.last_analyzed && (
                <span className="text-xs text-muted-foreground ml-auto">{new Date(analysis.last_analyzed).toLocaleDateString()}</span>
              )}
            </div>
            {overview && <p className="text-sm text-foreground/90 leading-relaxed">{overview}</p>}
            {strengths.length > 0 && (
              <div>
                <p className="text-xs font-semibold mb-1.5">Strengths</p>
                <div className="flex flex-wrap gap-1">
                  {strengths.map((s, i) => <Badge key={i} variant="secondary" className="text-xs">{s}</Badge>)}
                </div>
              </div>
            )}
            {analysis.credentials?.length > 0 && (
              <div>
                <p className="text-xs font-semibold mb-1.5">Credentials</p>
                <div className="flex flex-wrap gap-1">
                  {analysis.credentials.map((c, i) => <Badge key={i} variant="outline" className="text-xs">{c}</Badge>)}
                </div>
              </div>
            )}
            {highlights.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold">Highlights</p>
                {highlights.slice(0, 4).map((h, i) => (
                  <div key={i} className="text-xs p-2 rounded bg-background/60 border border-border/40">
                    <p className="font-medium">{h.title}</p>
                    {h.detail && <p className="text-muted-foreground mt-0.5">{h.detail}</p>}
                  </div>
                ))}
              </div>
            )}
            {analysis.unreadable?.length > 0 && (
              <p className="text-[11px] text-muted-foreground">
                Couldn’t read: {analysis.unreadable.map((u) => `${new URL(u.url).hostname} (${u.reason})`).join("; ")}.
                Employers still see the link.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
