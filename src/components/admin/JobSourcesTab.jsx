import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Loader2, Play, Plus, Trash2, KeyRound } from "lucide-react";
import { toast } from "sonner";

const KEY_HELP = {
  usajobs: { vars: "USAJOBS_API_KEY and USAJOBS_EMAIL", where: "developer.usajobs.gov (free; use the email you registered)" },
  adzuna: { vars: "ADZUNA_APP_ID and ADZUNA_APP_KEY", where: "developer.adzuna.com (free to start; ask them about commercial use)" },
  jooble: { vars: "JOOBLE_API_KEY", where: "jooble.org/api/about (free key on request)" },
};
const QUERY_FIELDS = {
  usajobs: [["location", "Location (e.g. Maryland)"], ["keyword", "Keyword (optional)"]],
  adzuna: [["where", "Location (e.g. Baltimore)"], ["what", "Keywords (optional)"]],
  jooble: [["location", "Location (e.g. Maryland)"], ["keywords", "Keywords (optional)"]],
};
const STATUS = {
  ok: "bg-emerald-50 text-emerald-800 border-emerald-200",
  error: "bg-red-50 text-red-800 border-red-200",
  needs_key: "bg-amber-50 text-amber-900 border-amber-200",
};

function AddSource({ kinds, onAdded }) {
  const [kind, setKind] = useState("greenhouse");
  const [form, setForm] = useState({ max_jobs: 100 });
  const k = kinds.find((x) => x.id === kind);
  const add = useMutation({
    mutationFn: () => base44.admin.addJobSource({ kind, ...form }),
    onSuccess: (src) => {
      toast.success(`Added ${src.name}${src.preview != null ? ` (${src.preview} US roles on the board)` : ""}. Run it to import its jobs.`);
      setForm({ max_jobs: 100 });
      onAdded();
    },
    onError: (e) => toast.error(e?.message || "Couldn't add that source."),
  });
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); add.mutate(); }}>
      <div className="grid gap-3 sm:grid-cols-[180px_minmax(0,1fr)_minmax(0,1fr)_110px]">
        <div className="space-y-1.5">
          <Label htmlFor="src-kind">Type</Label>
          <Select value={kind} onValueChange={(v) => { setKind(v); setForm({ max_jobs: 100 }); }}>
            <SelectTrigger id="src-kind"><SelectValue /></SelectTrigger>
            <SelectContent>
              {kinds.map((x) => <SelectItem key={x.id} value={x.id}>{x.label}{x.company ? " board" : ""}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {k?.company ? (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="src-token">Board name or jobs URL</Label>
              <Input id="src-token" required placeholder={kind === "greenhouse" ? "e.g. sweetgreen" : kind === "lever" ? "e.g. palantir" : kind === "workday" ? "e.g. https://ingredion.wd1.myworkdayjobs.com/en-US/IngredionCareers" : "e.g. ramp"} value={form.token || ""} onChange={set("token")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="src-name">Company name</Label>
              <Input id="src-name" placeholder="Shown on listings" value={form.name || ""} onChange={set("name")} />
            </div>
          </>
        ) : kind === "remotive" ? (
          <p className="text-sm text-muted-foreground self-end sm:col-span-2 pb-2">Remote jobs open to US candidates. No settings needed.</p>
        ) : (
          (QUERY_FIELDS[kind] || []).map(([key, label]) => (
            <div key={key} className="space-y-1.5">
              <Label htmlFor={`src-${key}`}>{label}</Label>
              <Input id={`src-${key}`} value={form[key] || ""} onChange={set(key)} />
            </div>
          ))
        )}
        <div className="space-y-1.5">
          <Label htmlFor="src-max">Max jobs</Label>
          <Input id="src-max" type="number" min="1" max="200" value={form.max_jobs} onChange={set("max_jobs")} />
        </div>
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <Button type="submit" size="sm" className="gap-1.5" disabled={add.isPending}>
          {add.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Add source
        </Button>
        {k?.company && (
          <p className="text-xs text-muted-foreground">
            Find it in the company’s careers links: boards.greenhouse.io/<b>name</b>, jobs.lever.co/<b>name</b>, jobs.ashbyhq.com/<b>name</b>, or for Workday paste the whole careers address (<b>company</b>.wd1.myworkdayjobs.com/<b>Site</b>). We check it exists before saving.
          </p>
        )}
      </div>
    </form>
  );
}

function SourceRow({ s, onChanged }) {
  const [max, setMax] = useState(String(s.max_jobs));
  const update = useMutation({
    mutationFn: (changes) => base44.admin.updateJobSource(s.id, changes),
    onSuccess: onChanged,
    onError: (e) => toast.error(e?.message || "Couldn't save."),
  });
  const run = useMutation({
    mutationFn: () => base44.admin.runJobImports([s.id]),
    onSuccess: (r) => {
      if (r.errors.length) toast.error(r.errors[0]);
      else toast.success(`${s.name}: ${r.added} new, ${r.closed} closed.`);
      onChanged();
    },
    onError: (e) => toast.error(e?.message || "Import failed."),
  });
  const remove = useMutation({
    mutationFn: () => base44.admin.removeJobSource(s.id),
    onSuccess: (r) => { toast.success(`Removed ${s.name}${r.closed ? ` and closed its ${r.closed} listings` : ""}.`); onChanged(); },
  });
  const detail = s.query ? Object.entries(s.query).map(([k, v]) => `${k}: ${v}`).join(" · ") : s.token;
  return (
    <li className="py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
      <div className="min-w-0 flex-1 basis-56">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium">{s.name}</span>
          <Badge variant="outline" className="text-[10px]">{s.kind_label}</Badge>
          {s.last_status && <Badge variant="outline" className={`text-[10px] ${STATUS[s.last_status] || ""}`}>{s.last_status === "needs_key" ? "needs key" : s.last_status}</Badge>}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5 break-all">
          {detail ? `${detail} · ` : ""}{s.active_count} live listings
          {s.last_run_at ? ` · checked ${formatDistanceToNow(new Date(s.last_run_at), { addSuffix: true })}` : " · not run yet"}
          {s.last_found != null ? ` · ${s.last_found} US roles on source` : ""}
        </p>
        {s.last_error && s.last_status !== "needs_key" && <p className="text-xs text-red-700 mt-0.5">{s.last_error}</p>}
        {s.needs?.length > 0 && <p className="text-xs text-amber-800 mt-0.5">Add {s.needs.join(" and ")} in Vercel to turn this on.</p>}
      </div>
      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        Max
        <Input
          type="number" min="1" max="200" value={max} aria-label={`Max jobs from ${s.name}`}
          className="h-8 w-20" onChange={(e) => setMax(e.target.value)}
          onBlur={() => { if (String(s.max_jobs) !== max) update.mutate({ max_jobs: Number(max) }); }}
        />
      </label>
      <Switch checked={s.enabled} onCheckedChange={(v) => update.mutate({ enabled: v })} aria-label={`${s.enabled ? "Turn off" : "Turn on"} ${s.name}`} />
      <Button size="sm" variant="outline" className="h-8 gap-1" onClick={() => run.mutate()} disabled={run.isPending || !s.enabled || s.needs?.length > 0}>
        {run.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />} Run
      </Button>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button size="sm" variant="ghost" className="h-8 text-muted-foreground" aria-label={`Remove ${s.name}`}><Trash2 className="w-3.5 h-3.5" /></Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {s.name}?</AlertDialogTitle>
            <AlertDialogDescription>Its {s.active_count} listings come off the job board. You can add it again later.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => remove.mutate()}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}

export default function JobSourcesTab() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["jobSources"], queryFn: () => base44.admin.jobSources() });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["jobSources"] });
  const runAll = useMutation({
    mutationFn: () => base44.admin.runJobImports(),
    onSuccess: (r) => {
      toast.success(`Checked ${r.ran} sources: ${r.added} new listings, ${r.closed} closed${r.skipped ? `. ${r.skipped} left for the next run (time limit), so run again to finish.` : "."}`);
      refresh();
    },
    onError: (e) => toast.error(e?.message || "Import failed."),
  });

  if (isLoading || !data) return <Skeleton className="h-64 rounded-xl" />;
  const { sources, kinds, totals } = data;
  const keyed = kinds.filter((k) => k.needs.length);

  return (
    <div className="space-y-5">
      <Card className="p-5 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h3 className="font-semibold">Real job listings</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {totals.imported.toLocaleString()} live listings imported from {sources.filter((s) => s.active_count > 0).length} sources, plus {totals.direct} posted on TalentBridge.
              Sources refresh automatically every day (needs CRON_SECRET); listings that come down at the source are closed here too.
            </p>
          </div>
          <Button onClick={() => runAll.mutate()} disabled={runAll.isPending} className="gap-1.5">
            {runAll.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />} Run import now
          </Button>
        </div>
        {runAll.isPending && <p className="text-xs text-muted-foreground">Fetching from every source. This can take up to a minute.</p>}
        {keyed.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950 space-y-1">
            <p className="font-medium flex items-center gap-1.5"><KeyRound className="w-4 h-4" /> More listings available with free keys</p>
            {keyed.map((k) => (
              <p key={k.id} className="text-xs">
                <b>{k.label}</b>: add {KEY_HELP[k.id]?.vars} in Vercel → Settings → Environment Variables. Get one at {KEY_HELP[k.id]?.where}.
              </p>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-5">
        <h3 className="font-semibold mb-3">Add a source</h3>
        <AddSource kinds={kinds} onAdded={refresh} />
      </Card>

      <Card className="p-5">
        <h3 className="font-semibold">Sources ({sources.length})</h3>
        <ul className="divide-y mt-2">
          {sources.map((s) => <SourceRow key={s.id} s={s} onChanged={refresh} />)}
        </ul>
      </Card>
    </div>
  );
}
