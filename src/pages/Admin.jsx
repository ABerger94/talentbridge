import React, { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import SystemTab from "@/components/admin/SystemTab";
import JobSourcesTab from "@/components/admin/JobSourcesTab";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CheckCircle2, AlertTriangle, Info, ShieldCheck, Flag, ExternalLink, UserPlus, Send, Loader2, Activity, Briefcase } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";

const LEVEL = {
  good: { icon: CheckCircle2, cls: "text-emerald-700" },
  warn: { icon: AlertTriangle, cls: "text-amber-700" },
  info: { icon: Info, cls: "text-muted-foreground" },
};
const STATUS_BADGE = {
  pending: "bg-amber-100 text-amber-800 border-amber-200",
  approved: "bg-emerald-100 text-emerald-700 border-emerald-200",
  rejected: "bg-red-100 text-red-700 border-red-200",
};

function EmployerCard({ e, onDecide }) {
  const c = e.company || {};
  return (
    <Card className="p-5 space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h3 className="font-semibold">{c.name || <span className="text-muted-foreground">No company profile yet</span>}</h3>
          <p className="text-sm text-muted-foreground break-all">
            {e.name ? `${e.name} · ` : ""}{e.email}{c.contact_title ? ` · ${c.contact_title}` : ""}
          </p>
        </div>
        {e.is_admin ? (
          <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">Site admin</Badge>
        ) : (
          <Badge variant="outline" className={STATUS_BADGE[e.status] || ""}>{e.status}</Badge>
        )}
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
        {c.website && <a href={c.website} target="_blank" rel="noreferrer noopener" className="text-primary hover:underline inline-flex items-center gap-1">{e.website_domain} <ExternalLink className="w-3 h-3" /></a>}
        {c.linkedin && <a href={c.linkedin} target="_blank" rel="noreferrer noopener" className="text-primary hover:underline inline-flex items-center gap-1">LinkedIn <ExternalLink className="w-3 h-3" /></a>}
        {c.size && <span className="text-muted-foreground">{c.size} employees</span>}
        {c.location && <span className="text-muted-foreground">{c.location}</span>}
      </div>
      {c.about && <p className="text-sm text-foreground/80 line-clamp-3">{c.about}</p>}
      <ul className="space-y-1">
        {e.signals.map((s, i) => {
          const L = LEVEL[s.level] || LEVEL.info;
          return (
            <li key={i} className={`text-sm flex items-start gap-2 ${L.cls}`}>
              <L.icon className="w-4 h-4 mt-0.5 shrink-0" /> {s.text}
            </li>
          );
        })}
      </ul>
      {e.jobs.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Drafted roles: {e.jobs.map((j) => j.title).join(", ")}
        </p>
      )}
      {e.review_note && <p className="text-xs text-muted-foreground">Last note: “{e.review_note}”</p>}
      {e.is_admin ? (
        <p className="text-xs text-muted-foreground pt-1">Admin accounts are trusted automatically; your jobs show as a verified employer.</p>
      ) : (
      <div className="flex gap-2 pt-1 flex-wrap">
        {e.status !== "approved" && (
          <Button size="sm" className="gap-1.5" onClick={() => onDecide(e, "approve")}>
            <ShieldCheck className="w-4 h-4" /> Approve
          </Button>
        )}
        {e.status !== "rejected" && (
          <Button size="sm" variant="outline" onClick={() => onDecide(e, "reject")}>
            {e.status === "approved" ? "Revoke approval" : "Reject"}
          </Button>
        )}
        <span className="text-xs text-muted-foreground self-center ml-auto">
          {e.submitted_at ? `Submitted ${formatDistanceToNow(new Date(e.submitted_at), { addSuffix: true })}` : "No profile submitted"}
        </span>
      </div>
      )}
    </Card>
  );
}

export default function Admin() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState("pending");
  const [pending, setPending] = useState(null); // { e, decision }
  const [note, setNote] = useState("");
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = ["employers", "signups", "reports", "jobs", "system"].includes(searchParams.get("tab")) ? searchParams.get("tab") : "employers";

  const { data: employers = [], isLoading } = useQuery({
    queryKey: ["adminEmployers", filter],
    queryFn: () => base44.admin.employers(filter),
  });
  const { data: reports = [], isLoading: reportsLoading } = useQuery({
    queryKey: ["adminReports"],
    queryFn: () => base44.admin.reports(),
  });

  const { data: signups = [], isLoading: signupsLoading } = useQuery({
    queryKey: ["adminIncompleteSignups"],
    queryFn: () => base44.admin.incompleteSignups(),
  });
  const remind = useMutation({
    mutationFn: (u) => base44.admin.remind(u.id),
    onSuccess: (_, u) => {
      toast.success(`Reminder sent to ${u.name || u.email}.`);
      queryClient.invalidateQueries({ queryKey: ["adminIncompleteSignups"] });
    },
    onError: (err) => toast.error(err?.message || "Couldn't send the reminder."),
  });

  const decide = useMutation({
    mutationFn: ({ e, decision }) => base44.admin.decide(e.id, decision, note),
    onSuccess: (res, { e, decision }) => {
      toast.success(decision === "approve"
        ? `${e.company?.name || e.email} approved${res.published ? ` — ${res.published} role${res.published === 1 ? "" : "s"} published` : ""}. They've been emailed.`
        : `${e.company?.name || e.email} ${e.status === "approved" ? "revoked" : "rejected"}. They've been emailed.`);
      setPending(null);
      setNote("");
      queryClient.invalidateQueries({ queryKey: ["adminEmployers"] });
    },
    onError: (err) => toast.error(err?.message || "Couldn't save the decision."),
  });

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
      <h1 className="text-2xl sm:text-3xl font-bold mb-1">Admin</h1>
      <p className="text-muted-foreground mb-6">Review employers, follow up on incomplete signups, check reported conversations, and watch site health.</p>
      <Tabs value={tab} onValueChange={(v) => setSearchParams(v === "employers" ? {} : { tab: v }, { replace: true })}>
        <TabsList className="mb-5 h-auto flex-wrap justify-start">
          <TabsTrigger value="employers">Employers</TabsTrigger>
          <TabsTrigger value="signups" className="gap-1.5"><UserPlus className="w-3.5 h-3.5" /> Incomplete ({signups.length})</TabsTrigger>
          <TabsTrigger value="reports" className="gap-1.5"><Flag className="w-3.5 h-3.5" /> Reports ({reports.length})</TabsTrigger>
          <TabsTrigger value="jobs" className="gap-1.5"><Briefcase className="w-3.5 h-3.5" /> Job sources</TabsTrigger>
          <TabsTrigger value="system" className="gap-1.5"><Activity className="w-3.5 h-3.5" /> System</TabsTrigger>
        </TabsList>

        <TabsContent value="employers" className="space-y-4">
          <div className="flex gap-2 flex-wrap">
            {["pending", "approved", "rejected", "all"].map((f) => (
              <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)} className="capitalize">
                {f}
              </Button>
            ))}
          </div>
          {isLoading ? (
            [0, 1].map((i) => <Skeleton key={i} className="h-40 rounded-xl" />)
          ) : employers.length === 0 ? (
            <Card className="p-10 text-center text-muted-foreground">
              {filter === "pending" ? "No employers waiting for review. 🎉" : "No employers here."}
            </Card>
          ) : (
            employers.map((e) => <EmployerCard key={e.id} e={e} onDecide={(emp, decision) => setPending({ e: emp, decision })} />)
          )}
        </TabsContent>

        <TabsContent value="signups" className="space-y-3">
          <p className="text-sm text-muted-foreground">
            People who signed up but aren’t visible to employers yet, newest first. A reminder email lists their
            remaining steps and links straight to the next one (at most once a week per person).
          </p>
          {signupsLoading ? (
            <Skeleton className="h-24 rounded-xl" />
          ) : signups.length === 0 ? (
            <Card className="p-10 text-center text-muted-foreground">Everyone who signed up has a complete profile. 🎉</Card>
          ) : (
            signups.map((u) => (
              <Card key={u.id} className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <p className="font-medium text-sm">{u.name || <span className="text-muted-foreground">No name yet</span>}</p>
                    <p className="text-xs text-muted-foreground break-all">{u.email}</p>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    Signed up {formatDistanceToNow(new Date(u.created_date), { addSuffix: true })}
                    {u.role === "user" ? " · no account type yet" : ""}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <Progress value={u.percent} className="h-2 flex-1" />
                  <span className="text-xs font-semibold w-10 text-right">{u.percent}%</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Stopped after: <span className="text-foreground">{u.last_step}</span>
                  {u.next_step && <> · Next: <span className="text-foreground">{u.next_step}</span></>}
                </p>
                <div className="flex items-center gap-3 flex-wrap pt-1">
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    disabled={!u.can_remind || (remind.isPending && remind.variables?.id === u.id)}
                    onClick={() => remind.mutate(u)}
                  >
                    {remind.isPending && remind.variables?.id === u.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    Send reminder
                  </Button>
                  {u.last_reminder_at && (
                    <span className="text-xs text-muted-foreground">
                      Reminded {formatDistanceToNow(new Date(u.last_reminder_at), { addSuffix: true })}
                      {!u.can_remind ? " · next one available a week after" : ""}
                    </span>
                  )}
                </div>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="reports" className="space-y-3">
          {reportsLoading ? (
            <Skeleton className="h-24 rounded-xl" />
          ) : reports.length === 0 ? (
            <Card className="p-10 text-center text-muted-foreground">No reported conversations.</Card>
          ) : (
            reports.map((r) => (
              <Card key={r.id} className="p-4 space-y-1.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="font-medium text-sm">{r.job_title || "Application"}{r.company ? ` · ${r.company}` : ""}</span>
                  <span className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(r.created_date), { addSuffix: true })}</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Reported by the {r.reporter_role} ({r.reporter_email}){r.candidate ? ` · candidate: ${r.candidate}` : ""}
                </p>
                <p className="text-sm">{r.reason ? `“${r.reason}”` : <span className="text-muted-foreground">No reason given</span>}</p>
                <Link to={`/messages?c=${r.application_id}`} className="text-sm text-primary hover:underline">Read conversation</Link>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="jobs">
          {tab === "jobs" && <JobSourcesTab />}
        </TabsContent>

        <TabsContent value="system">
          {tab === "system" && <SystemTab />}
        </TabsContent>
      </Tabs>

      <AlertDialog open={!!pending} onOpenChange={(o) => { if (!o) { setPending(null); setNote(""); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pending?.decision === "approve" ? "Approve" : pending?.e.status === "approved" ? "Revoke approval for" : "Reject"} {pending?.e.company?.name || pending?.e.email}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pending?.decision === "approve"
                ? "They'll be able to browse candidates, invite and message, and their drafted roles go live. They'll be emailed."
                : "They'll lose access to candidates and be emailed with your note so they can fix their profile and resubmit."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={pending?.decision === "approve" ? "Optional note to the employer" : "Reason (shown to the employer), e.g. “Please add your company website.”"}
            maxLength={1000}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={(ev) => { ev.preventDefault(); decide.mutate(pending); }} disabled={decide.isPending}>
              {pending?.decision === "approve" ? "Approve" : "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
