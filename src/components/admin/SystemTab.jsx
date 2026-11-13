import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

const ago = (d) => (d ? formatDistanceToNow(new Date(d), { addSuffix: true }) : "—");
const mb = (bytes) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

const ACTIONS = {
  "employer.approve": "approved employer",
  "employer.reject": "rejected / revoked employer",
  "signup.reminder_sent": "sent a profile reminder",
  "account.deleted": "deleted their account",
  "account.password_changed": "changed their password",
  "account.signed_out_others": "signed out other devices",
  "storage.migrated_batch": "moved files to the bucket",
  "ai.fairness_check": "ran an AI fairness check",
  "jobs.import_run": "ran the job import",
  "jobs.source_added": "added a job source",
  "jobs.source_removed": "removed a job source",
};

function Check({ ok, label, detail }) {
  return (
    <div className="flex items-start gap-2 text-sm">
      {ok ? <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" /> : <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />}
      <div><span className="font-medium">{label}</span>{detail ? <span className="text-muted-foreground"> · {detail}</span> : null}</div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xl font-semibold tabular-nums">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

// Across recent runs: a group that moves the same way run after run.
function FairnessPatterns({ patterns }) {
  const fmt = (m, unit) => (m.n ? `${m.mean > 0 ? "+" : ""}${m.mean}${unit} · lower in ${m.lower} of ${m.n}${m.higher ? `, higher in ${m.higher}` : ""}` : "—");
  return (
    <div className="space-y-2 pt-3 border-t">
      <h4 className="text-sm font-semibold">Patterns across your last {patterns.runs} {patterns.runs === 1 ? "run" : "runs"}</h4>
      {patterns.runs < patterns.min_runs ? (
        <p className="text-xs text-muted-foreground">
          Run the check at least {patterns.min_runs} times to see patterns ({patterns.runs} so far). A single flag can be noise; a group that comes out lower in run after run is what bias looks like.
        </p>
      ) : (
        <>
          <p className={`text-xs ${patterns.flagged.length ? "text-amber-800" : "text-emerald-800"}`}>
            {patterns.flagged.length
              ? `Consistent pattern: ${patterns.flagged.join(", ")}. Worth reviewing the prompts and model for this.`
              : "No consistent pattern: no group moved the same way run after run."}
            <span className="block text-muted-foreground mt-0.5">Rule: {patterns.rule}.</span>
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="text-left text-muted-foreground"><th className="py-1 pr-2">Variant</th><th className="pr-2">Match score vs control</th><th>Avg depth vs control</th></tr></thead>
              <tbody>
                {patterns.rows.map((r) => (
                  <tr key={r.variant} className="border-t">
                    <td className={`py-1 pr-2 whitespace-nowrap ${r.pattern ? "text-amber-700 font-semibold" : ""}`}>{r.variant}</td>
                    <td className={`pr-2 tabular-nums ${r.match.direction ? "text-amber-700 font-semibold" : "text-muted-foreground"}`}>{fmt(r.match, " pts")}</td>
                    <td className={`tabular-nums ${r.depth.direction ? "text-amber-700 font-semibold" : "text-muted-foreground"}`}>{fmt(r.depth, " levels")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// Depth levels half of the fairness check (Capability Graph, 1-5 rubric).
function DepthResults({ depth }) {
  return (
    <div className="space-y-2 pt-2">
      <h4 className="text-sm font-semibold">Capability Graph depth levels</h4>
      <p className={`text-xs ${depth.passed === false ? "text-amber-800" : depth.inconclusive ? "text-muted-foreground" : "text-emerald-800"}`}>
        {depth.inconclusive
          ? depth.reason || "Inconclusive: the control graphs didn’t agree on any capability, so there was nothing stable to compare. Run it again."
          : depth.passed
            ? `No variant moved a capability by ${depth.threshold} level or more (compared ${depth.stable} capabilities ${depth.controls === 2 || !depth.controls ? "both" : "all three"} controls rated the same).`
            : `Review needed: ${depth.flagged.join(", ")} moved a capability by ${depth.threshold} level or more.`}
        {depth.noise > 0 && ` The controls themselves disagreed on ${depth.noise === 1 ? "1 capability, which was" : `${depth.noise} capabilities, which were`} left out.`}
      </p>
      {depth.rows?.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="text-left text-muted-foreground"><th className="py-1 pr-2">Variant</th><th className="pr-2 text-right">Avg depth</th><th className="pr-2 text-right">Sets apart</th><th>Changes vs control</th></tr></thead>
            <tbody>
              {depth.rows.map((r) => (
                <tr key={r.variant} className="border-t align-top">
                  <td className="py-1 pr-2 whitespace-nowrap">{r.variant}</td>
                  <td className="pr-2 text-right tabular-nums">{r.error ? "—" : r.mean_level}</td>
                  <td className="pr-2 text-right tabular-nums">{r.error ? "—" : r.sets_apart}</td>
                  <td className={r.changes.length ? "text-amber-700 font-semibold" : "text-muted-foreground"}>
                    {r.error ? "AI didn’t answer" : r.changes.length ? r.changes.map((c) => `${c.capability}: ${c.control} → ${c.variant}`).join("; ") : "None"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function SystemTab() {
  const queryClient = useQueryClient();
  const [showResolved, setShowResolved] = useState(false);
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["adminSystem", showResolved],
    queryFn: () => base44.admin.system({ resolved: showResolved }),
  });
  const resolve = useMutation({
    mutationFn: (sig) => base44.admin.resolveError(sig),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["adminSystem"] }),
  });
  const migrate = useMutation({
    mutationFn: () => base44.admin.migrateStorage(),
    onSuccess: (r) => {
      toast.success(`Moved ${r.moved} file${r.moved === 1 ? "" : "s"}. ${r.remaining} left in the database.`);
      queryClient.invalidateQueries({ queryKey: ["adminSystem"] });
    },
    onError: (e) => toast.error(e?.message || "Couldn't move files."),
  });

  const runAlerts = useMutation({
    mutationFn: () => base44.admin.runJobAlerts(),
    onSuccess: (r) => {
      toast.success(`Job alerts: ${r.due} due, ${r.emailed} emailed, ${r.no_new_matches} with no new matches${r.deferred ? `, ${r.deferred} left for the next run` : ""}.`);
      queryClient.invalidateQueries({ queryKey: ["adminSystem"] });
    },
    onError: (e) => toast.error(e?.message || "Couldn't run job alerts."),
  });
  const fairness = useMutation({
    mutationFn: () => base44.admin.fairnessCheck(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["adminSystem"] }),
    onError: (e) => toast.error(e?.message || "The fairness check couldn't run."),
  });

  if (isLoading || !data) return <Skeleton className="h-64 rounded-xl" />;
  const { health, counts, email_7d: mail, failed_emails: failed, errors, audit } = data;
  const fair = fairness.data || data.fairness;
  const patterns = fairness.data?.patterns || data.fairness_patterns;
  const users = counts.users || {};

  return (
    <div className="space-y-5">
      <Card className="p-5 space-y-2.5">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Health</h3>
          <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>
        <Check ok={health.auth_secret === "ok"} label="Sign-in secret" detail={health.auth_secret} />
        <Check ok={health.ai?.configured} label="AI providers" detail={(health.ai?.order || []).map((p) => p.provider).join(" → ") || "none configured"} />
        <Check ok={health.mail?.configured} label="Email" detail={(health.mail?.providers || []).join(", ") || "not configured"} />
        <Check ok label="Database" detail={health.database} />
        <Check
          ok={health.storage.backend === "s3" ? counts.files_in_database === 0 : true}
          label="File storage"
          detail={health.storage.backend === "s3"
            ? `bucket ${health.storage.bucket}${counts.files_in_database ? ` · ${counts.files_in_database} older files still in the database` : ""}`
            : `in the database (${counts.files} files, ${mb(counts.file_bytes)})`}
        />
        {health.storage.backend === "s3" && counts.files_in_database > 0 && (
          <Button size="sm" variant="outline" onClick={() => migrate.mutate()} disabled={migrate.isPending} className="gap-1.5">
            {migrate.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Move next 20 files to the bucket
          </Button>
        )}
      </Card>

      <Card className="p-5 space-y-3">
        <h3 className="font-semibold">Last 7 days</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Stat label="New signups" value={counts.signups_7d} />
          <Stat label="Applications" value={counts.applications_7d} />
          <Stat label="Messages" value={counts.messages_7d} />
          <Stat label="Emails sent" value={mail.sent || 0} />
        </div>
        <p className="text-xs text-muted-foreground">
          Accounts: {users.job_seeker || 0} seekers · {users.employer || 0} employers · {users.user || 0} without a role yet · {users.admin || 0} admins.
          Active roles: {counts.jobs_active} posted here{counts.jobs_pending_review ? ` (+${counts.jobs_pending_review} awaiting approval)` : ""}, {(counts.jobs_imported_active || 0).toLocaleString()} imported.
        </p>
        <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
          <span>
            Job alerts: {counts.alert_subscribers || 0} subscriber{counts.alert_subscribers === 1 ? "" : "s"} · sent automatically every day
            {health.cron ? "" : " once CRON_SECRET is set"}.
          </span>
          <Button size="sm" variant="ghost" className="h-7 gap-1.5" onClick={() => runAlerts.mutate()} disabled={runAlerts.isPending}>
            {runAlerts.isPending && <Loader2 className="w-3 h-3 animate-spin" />} Send due alerts now
          </Button>
        </div>
        {(mail.failed || 0) > 0 && (
          <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-sm space-y-1">
            <p className="font-medium text-amber-900">{mail.failed} email{mail.failed === 1 ? "" : "s"} failed to send</p>
            {failed.slice(0, 5).map((f, i) => (
              <p key={i} className="text-xs text-amber-900/80 break-all">{f.kind} → {f.recipient || "?"}: {f.error} ({ago(f.created_date)})</p>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-5 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h3 className="font-semibold">AI fairness check</h3>
          <Button size="sm" variant="outline" onClick={() => fairness.mutate()} disabled={fairness.isPending} className="gap-1.5">
            {fairness.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />} {fair ? "Run again" : "Run check"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Runs identical made-up candidates through the AI for one of your live roles. Each differs only by one sentence hinting at gender,
          ethnicity, nationality, age, disability, or religion. It checks both match scores (0–100) and the depth levels (1–5) in each
          candidate’s Capability Graph, against three identical controls. A fair model treats them all the same. One run can be noise, so the
          patterns below look across your recent runs. Uses 10 AI calls and takes up to a minute.
        </p>
        {fair && (
          <div className="space-y-2">
            <div className={`rounded-md border p-2.5 text-sm ${fair.passed ? "bg-emerald-50 border-emerald-200 text-emerald-900" : "bg-amber-50 border-amber-200 text-amber-900"}`}>
              {fair.passed ? "Passed" : "Review needed"}
              {fair.depth?.inconclusive && fair.passed ? " (depth levels inconclusive this run, see below)" : ""}
              <span className="block text-xs opacity-80">
                Role: {fair.job.title} · control {fair.baseline}%{fair.noise != null ? ` · control repeat differed by ${fair.noise}` : ""} · {ago(fair.ran_at)}
              </span>
            </div>
            <h4 className="text-sm font-semibold pt-1">Match scores</h4>
            <p className={`text-xs ${(fair.match_passed ?? fair.passed) ? "text-emerald-800" : "text-amber-800"}`}>
              {(fair.match_passed ?? fair.passed)
                ? `No variant moved more than ${fair.worst_difference} points from the control (limit ${fair.threshold}).`
                : `A variant moved ${fair.worst_difference} points from the control (limit ${fair.threshold}).`}
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead><tr className="text-left text-muted-foreground"><th className="py-1 pr-2">Variant</th><th className="pr-2">Added sentence</th><th className="pr-2 text-right">Score</th><th className="text-right">vs control</th></tr></thead>
                <tbody>
                  {fair.rows.map((r) => (
                    <tr key={r.variant} className="border-t">
                      <td className="py-1 pr-2 whitespace-nowrap">{r.variant}</td>
                      <td className="pr-2 text-muted-foreground">{r.added_text}</td>
                      <td className="pr-2 text-right tabular-nums">{r.score ?? "—"}</td>
                      <td className={`text-right tabular-nums ${Math.abs(r.difference ?? 0) >= fair.threshold ? "text-amber-700 font-semibold" : ""}`}>
                        {r.difference == null ? "—" : r.difference > 0 ? `+${r.difference}` : r.difference}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {fair.depth && <DepthResults depth={fair.depth} />}
            {patterns && <FairnessPatterns patterns={patterns} />}
          </div>
        )}
      </Card>

      <Card className="p-5 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h3 className="font-semibold">Errors</h3>
          <label className="text-xs text-muted-foreground flex items-center gap-1.5">
            <input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} /> Show resolved
          </label>
        </div>
        {errors.length === 0 ? (
          <p className="text-sm text-muted-foreground">No errors recorded. 🎉 New errors also email the admins.</p>
        ) : errors.map((e) => (
          <details key={e.signature} className="rounded-md border p-3 text-sm">
            <summary className="cursor-pointer flex items-start gap-2 flex-wrap">
              <Badge variant="outline" className="text-[10px]">{e.source}</Badge>
              <span className="font-medium break-all flex-1 min-w-0">{e.message}</span>
              <span className="text-xs text-muted-foreground">×{e.count} · {ago(e.last_seen)}</span>
            </summary>
            <div className="mt-2 space-y-2">
              {e.path && <p className="text-xs text-muted-foreground">Where: {e.path}</p>}
              <p className="text-xs text-muted-foreground">First seen {ago(e.first_seen)}</p>
              {e.stack && <pre className="text-[11px] bg-muted p-2 rounded overflow-x-auto max-h-48">{e.stack}</pre>}
              {!e.resolved && (
                <Button size="sm" variant="outline" onClick={() => resolve.mutate(e.signature)}>Mark resolved</Button>
              )}
            </div>
          </details>
        ))}
      </Card>

      <Card className="p-5 space-y-2">
        <h3 className="font-semibold">Audit log</h3>
        {audit.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing recorded yet.</p>
        ) : (
          <ul className="divide-y text-sm">
            {audit.map((a) => (
              <li key={a.id} className="py-2 flex flex-wrap gap-x-2">
                <span className="font-medium break-all">{a.actor_email || (a.action === "account.deleted" ? "A user" : a.actor_id || "system")}</span>
                <span>{ACTIONS[a.action] || a.action}</span>
                {a.detail?.company && <span className="text-muted-foreground">{a.detail.company}</span>}
                {a.detail?.email && !a.detail?.company && <span className="text-muted-foreground break-all">{a.detail.email}</span>}
                <span className="text-xs text-muted-foreground ml-auto">{ago(a.created_date)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
