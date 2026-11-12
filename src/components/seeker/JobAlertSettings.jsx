import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BellRing } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

const FREQUENCY_LABEL = { off: "Off", daily: "Daily digest", weekly: "Weekly digest" };
const SCORES = [60, 70, 80, 90];

// Opt-in email of new open roles that match the seeker's profile.
export default function JobAlertSettings({ compact = false }) {
  const queryClient = useQueryClient();
  const { data: prefs, isLoading } = useQuery({
    queryKey: ["jobAlertPrefs"],
    queryFn: () => base44.alerts.preferences(),
  });
  const save = useMutation({
    mutationFn: (changes) => base44.alerts.save(changes),
    onSuccess: (p, changes) => {
      queryClient.setQueryData(["jobAlertPrefs"], p);
      if ("frequency" in changes) {
        toast.success(p.frequency === "off" ? "Job alerts turned off." : `You'll get a ${p.frequency} email when new roles match your profile.`);
      }
    },
    onError: (e) => toast.error(e?.message || "Couldn't save your alert settings."),
  });

  if (isLoading || !prefs) return <Skeleton className="h-28 rounded-xl" />;
  const on = prefs.frequency !== "off";

  return (
    <Card className={compact ? "p-4 space-y-3" : "p-5 sm:p-6 space-y-4"}>
      <div>
        <h2 className="font-semibold flex items-center gap-2"><BellRing className="w-4 h-4" /> Job alerts</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Get an email when newly posted roles match your profile. Matching is AI-assisted and never uses your name or contact details.
        </p>
      </div>
      <div className="flex flex-wrap gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="alert-frequency">Email me</Label>
          <Select value={prefs.frequency} onValueChange={(v) => save.mutate({ frequency: v })}>
            <SelectTrigger id="alert-frequency" className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(FREQUENCY_LABEL).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {on && (
          <div className="space-y-1.5">
            <Label htmlFor="alert-score">Only roles matching at least</Label>
            <Select value={String(prefs.min_score)} onValueChange={(v) => save.mutate({ min_score: Number(v) })}>
              <SelectTrigger id="alert-score" className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[...new Set([...SCORES, prefs.min_score])].sort().map((n) => <SelectItem key={n} value={String(n)}>{n}%</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
      {on && (
        <p className="text-xs text-muted-foreground">
          {prefs.last_sent_at ? `Last alert sent ${formatDistanceToNow(new Date(prefs.last_sent_at), { addSuffix: true })}. ` : ""}
          Alerts need a complete profile that's visible to employers. Every email has a one-click unsubscribe link.
        </p>
      )}
    </Card>
  );
}

// One-time nudge on the seeker dashboard, once their profile is complete.
export function JobAlertNudge() {
  const queryClient = useQueryClient();
  const [dismissed, setDismissed] = React.useState(() => {
    try { return localStorage.getItem("tb_alert_nudge_dismissed") === "1"; } catch { return false; }
  });
  const { data: prefs } = useQuery({ queryKey: ["jobAlertPrefs"], queryFn: () => base44.alerts.preferences() });
  const enable = useMutation({
    mutationFn: () => base44.alerts.save({ frequency: "weekly" }),
    onSuccess: (p) => {
      queryClient.setQueryData(["jobAlertPrefs"], p);
      toast.success("Weekly job alerts are on. Change them anytime in Settings.");
    },
  });
  if (dismissed || !prefs || prefs.frequency !== "off" || prefs.subscribed_at) return null;
  const dismiss = () => {
    try { localStorage.setItem("tb_alert_nudge_dismissed", "1"); } catch { /* storage unavailable */ }
    setDismissed(true);
  };
  return (
    <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 sm:p-4 flex items-center gap-3 flex-wrap">
      <BellRing className="w-5 h-5 text-primary shrink-0" />
      <p className="text-sm flex-1 min-w-[12rem]">Want an email when new roles match your profile?</p>
      <div className="flex gap-2">
        <button type="button" onClick={dismiss} className="text-sm text-muted-foreground px-2 hover:underline">Not now</button>
        <button
          type="button"
          onClick={() => enable.mutate()}
          disabled={enable.isPending}
          className="text-sm font-medium rounded-md bg-primary text-primary-foreground px-3 py-1.5 hover:bg-primary/90 disabled:opacity-60"
        >
          Turn on weekly alerts
        </button>
      </div>
    </div>
  );
}
