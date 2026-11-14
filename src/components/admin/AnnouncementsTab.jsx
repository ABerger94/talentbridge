import React, { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AlertTriangle, Bot, Eye, Loader2, Mail, Megaphone, Pencil, RotateCcw, Send, Trash2, XCircle } from "lucide-react";
import { toast } from "sonner";

const ago = (d) => (d ? formatDistanceToNow(new Date(d), { addSuffix: true }) : "");
const EMPTY = { subject: "", body: "", audience: "all", verified_only: true, button_label: "", button_url: "" };
const STATUS = {
  draft: ["Draft", "bg-secondary text-muted-foreground"],
  sending: ["Sending", "bg-blue-50 text-blue-800 border-blue-200"],
  paused: ["Paused", "bg-amber-50 text-amber-900 border-amber-200"],
  done: ["Sent", "bg-emerald-50 text-emerald-800 border-emerald-200"],
  cancelled: ["Cancelled", "bg-red-50 text-red-800 border-red-200"],
};
// The email exactly as the server renders it. No scripts may run in it; it's
// same-origin only so the frame can grow to the email's full height.
function EmailFrame({ html, title }) {
  const ref = useRef(null);
  const fit = () => {
    try {
      const d = ref.current?.contentDocument;
      if (d?.body) ref.current.style.height = `${d.documentElement.scrollHeight + 4}px`;
    } catch { /* keep the default height */ }
  };
  useEffect(fit, [html]);
  return <iframe ref={ref} title={title} sandbox="allow-same-origin" srcDoc={html} onLoad={fit} className="w-full h-[420px] rounded-md border bg-white" />;
}

const people = (n) => `${n.toLocaleString()} ${n === 1 ? "person" : "people"}`;
const fromRecord = (a) => ({
  subject: a.subject, body: a.body, audience: a.audience, verified_only: a.verified_only,
  button_label: a.button_label || "", button_url: a.button_url || "",
});
const payload = (f) => ({ ...f, button_label: f.button_label.trim() || null, button_url: f.button_label.trim() ? f.button_url.trim() : null });

// The email exactly as the server renders it, isolated from the page.
function Preview({ form }) {
  const [state, setState] = useState({ html: "", error: "", recipients: null });
  useEffect(() => {
    if (form.subject.trim().length < 3 || !form.body.trim()) {
      setState({ html: "", error: "", recipients: null });
      return undefined;
    }
    let live = true;
    const t = setTimeout(async () => {
      try {
        const p = await base44.admin.previewAnnouncement(payload(form));
        if (live) setState({ html: p.html, error: "", recipients: p.recipients });
      } catch (e) {
        if (live) setState((s) => ({ ...s, error: e.message }));
      }
    }, 400);
    return () => { live = false; clearTimeout(t); };
  }, [form]);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="font-medium flex items-center gap-1.5"><Eye className="w-4 h-4" /> Preview</span>
        {state.recipients != null && <span className="text-muted-foreground">Goes to {people(state.recipients)}</span>}
      </div>
      {state.error && <p className="text-sm text-red-700">{state.error}</p>}
      {state.html ? (
        <EmailFrame title="Email preview" html={state.html} />
      ) : (
        <div className="h-24 rounded-md border border-dashed grid place-items-center text-sm text-muted-foreground px-4 text-center">
          Add a subject and a message to see the email.
        </div>
      )}
    </div>
  );
}

function Composer({ data, editing, onDone }) {
  const qc = useQueryClient();
  const [form, setForm] = useState(editing ? fromRecord(editing) : EMPTY);
  const [id, setId] = useState(editing?.id || null);
  const [confirm, setConfirm] = useState(null);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v?.target ? v.target.value : v }));
  const counts = data.audiences;
  const count = counts[form.audience]?.[form.verified_only ? "verified" : "all"] ?? 0;

  const save = async () => {
    const saved = id ? await base44.admin.updateAnnouncement(id, payload(form)) : await base44.admin.createAnnouncement(payload(form));
    setId(saved.id);
    qc.invalidateQueries({ queryKey: ["admin-announcements"] });
    return saved;
  };
  const saveM = useMutation({ mutationFn: save, onSuccess: () => toast.success("Draft saved"), onError: (e) => toast.error(e.message) });
  const testM = useMutation({
    mutationFn: async () => base44.admin.announcementAction((await save()).id, "test"),
    onSuccess: (r) => toast.success(`Test sent to ${r.sent_to}`),
    onError: (e) => toast.error(e.message),
  });
  const prepM = useMutation({
    mutationFn: save,
    onSuccess: (saved) => setConfirm({ id: saved.id, recipients: saved.recipients_now }),
    onError: (e) => toast.error(e.message),
  });
  const sendM = useMutation({
    mutationFn: () => base44.admin.announcementAction(confirm.id, "send", { confirm_count: confirm.recipients }),
    onSuccess: (r) => {
      setConfirm(null);
      qc.invalidateQueries({ queryKey: ["admin-announcements"] });
      toast.success(r.status === "done" ? `Sent to ${people(r.progress.sent)}`
        : r.status === "paused" ? `Sent to ${people(r.progress.sent)} so far. Paused: ${r.note || "it continues later."}`
        : `Sent to ${people(r.progress.sent)} so far. Still sending…`);
      onDone(r.id);
    },
    onError: (e) => {
      toast.error(e.message);
      setConfirm(null);
    },
  });
  const busy = saveM.isPending || testM.isPending || prepM.isPending || sendM.isPending;
  const ready = form.subject.trim().length >= 3 && form.body.trim();

  return (
    <Card className="p-4 sm:p-5 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold flex items-center gap-2"><Megaphone className="w-4 h-4" /> {id ? "Edit draft" : "New announcement"}</h3>
        <Button type="button" variant="ghost" size="sm" onClick={() => onDone(null)}>Close</Button>
      </div>
      <div className="grid lg:grid-cols-2 gap-5">
        <div className="space-y-3 min-w-0">
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ann-audience">Send to</Label>
              <Select value={form.audience} onValueChange={set("audience")}>
                <SelectTrigger id="ann-audience"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(counts).map(([k, c]) => (
                    <SelectItem key={k} value={k}>{c.label} ({(form.verified_only ? c.verified : c.all).toLocaleString()})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-start gap-2 text-sm sm:pt-7">
              <Checkbox checked={form.verified_only} onCheckedChange={(v) => set("verified_only")(!!v)} className="mt-0.5" />
              <span>Verified emails only <span className="text-muted-foreground">(recommended)</span></span>
            </label>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ann-subject">Subject</Label>
            <Input id="ann-subject" value={form.subject} onChange={set("subject")} maxLength={150} placeholder="We’ve updated our Terms of Service" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ann-body">Message</Label>
            <Textarea id="ann-body" value={form.body} onChange={set("body")} rows={9} maxLength={10000}
              placeholder={"What changed, when it takes effect, and what (if anything) people need to do.\n\nLeave a blank line between paragraphs. Links become clickable."} />
            <p className="text-xs text-muted-foreground">Each email starts with “Hi [first name],” and ends with a note that it’s a service announcement.</p>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ann-btn">Button text <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input id="ann-btn" value={form.button_label} onChange={set("button_label")} maxLength={40} placeholder="Read the new terms" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ann-url">Button link</Label>
              <Input id="ann-url" value={form.button_url} onChange={set("button_url")} placeholder="/terms" disabled={!form.button_label.trim()} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground rounded-md bg-secondary/60 p-2.5">
            Use this for service updates: policy changes, new features, outages. Our Privacy Policy says we don’t send marketing email.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" disabled={!ready || busy} onClick={() => saveM.mutate()}>
              {saveM.isPending && <Loader2 className="w-4 h-4 animate-spin" />} Save draft
            </Button>
            <Button type="button" variant="outline" className="gap-1.5" disabled={!ready || busy || !data.mail_configured} onClick={() => testM.mutate()}>
              {testM.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />} Send test to me
            </Button>
            <Button type="button" className="gap-1.5" disabled={!ready || busy || !count || !data.mail_configured} onClick={() => prepM.mutate()}>
              {prepM.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Send to {people(count)}…
            </Button>
          </div>
        </div>
        <div className="min-w-0"><Preview form={form} /></div>
      </div>

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && !sendM.isPending && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Email {confirm ? people(confirm.recipients) : ""}?</AlertDialogTitle>
            <AlertDialogDescription>
              “{form.subject}” goes to {counts[form.audience]?.label.toLowerCase()}{form.verified_only ? " with verified emails" : ""}. This can’t be unsent. Send yourself a test first if you haven’t.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={sendM.isPending}>Not yet</AlertDialogCancel>
            <AlertDialogAction disabled={sendM.isPending} onClick={(e) => { e.preventDefault(); sendM.mutate(); }}>
              {sendM.isPending && <Loader2 className="w-4 h-4 animate-spin" />} Send now
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

// Keeps a running send moving while the page is open (the daily job also does).
function useKeepSending(items) {
  const qc = useQueryClient();
  const running = useRef(false);
  const sending = items.find((a) => a.status === "sending");
  useEffect(() => {
    if (!sending || running.current) return undefined;
    let live = true;
    running.current = true;
    base44.admin.announcementAction(sending.id, "process")
      .catch(() => {})
      .finally(() => {
        running.current = false;
        if (live) qc.invalidateQueries({ queryKey: ["admin-announcements"] });
      });
    return () => { live = false; };
  }, [sending, qc]);
}

function Row({ a, onEdit }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [label, tone] = STATUS[a.status] || STATUS.draft;
  const detail = useQuery({ queryKey: ["admin-announcement", a.id], queryFn: () => base44.admin.announcement(a.id), enabled: open });
  const act = useMutation({
    mutationFn: ({ action }) => (action === "delete" ? base44.admin.deleteAnnouncement(a.id) : base44.admin.announcementAction(a.id, action)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-announcements"] });
      qc.invalidateQueries({ queryKey: ["admin-announcement", a.id] });
    },
    onError: (e) => toast.error(e.message),
  });
  const p = a.progress;
  const done = p ? p.sent + p.failed + p.cancelled : 0;
  return (
    <Card className="p-4 space-y-2.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium break-words">{a.subject}</p>
          <p className="text-xs text-muted-foreground">
            {a.audience_label}{a.verified_only ? " · verified only" : ""} · {a.status === "draft" ? `${people(a.recipients_now)} now · saved ${ago(a.updated_date)}` : `sent by ${a.sent_by} ${ago(a.sent_date)}`}
            {a.created_by?.startsWith("API key") && <span className="inline-flex items-center gap-1 ml-1"><Bot className="w-3 h-3" /> drafted by {a.created_by.replace("API key: ", "")}</span>}
          </p>
        </div>
        <Badge variant="outline" className={tone}>{label}</Badge>
      </div>
      {p && (
        <div className="space-y-1">
          <Progress value={p.total ? (done / p.total) * 100 : 100} className="h-1.5" />
          <p className="text-xs text-muted-foreground">
            {p.sent.toLocaleString()} sent of {p.total.toLocaleString()}
            {p.pending > 0 && ` · ${p.pending.toLocaleString()} waiting`}
            {p.failed > 0 && <span className="text-red-700"> · {p.failed} failed</span>}
            {p.cancelled > 0 && ` · ${p.cancelled} not sent`}
          </p>
        </div>
      )}
      {a.note && <p className="text-sm text-amber-900 flex items-start gap-1.5"><AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> {a.note}</p>}
      <div className="flex flex-wrap gap-2">
        {a.status === "draft" && <>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => onEdit(a)}><Pencil className="w-3.5 h-3.5" /> Edit</Button>
          <Button size="sm" variant="ghost" className="gap-1.5 text-red-700" disabled={act.isPending} onClick={() => act.mutate({ action: "delete" })}><Trash2 className="w-3.5 h-3.5" /> Delete</Button>
        </>}
        {a.status === "paused" && <Button size="sm" className="gap-1.5" disabled={act.isPending} onClick={() => act.mutate({ action: "process" })}><Send className="w-3.5 h-3.5" /> Continue</Button>}
        {p?.failed > 0 && ["done", "paused"].includes(a.status) && <Button size="sm" variant="outline" className="gap-1.5" disabled={act.isPending} onClick={() => act.mutate({ action: "retry" })}><RotateCcw className="w-3.5 h-3.5" /> Retry failed</Button>}
        {["sending", "paused"].includes(a.status) && <Button size="sm" variant="ghost" className="gap-1.5 text-red-700" disabled={act.isPending} onClick={() => act.mutate({ action: "cancel" })}><XCircle className="w-3.5 h-3.5" /> Stop sending</Button>}
        {a.status !== "draft" && <Button size="sm" variant="ghost" onClick={() => setOpen((o) => !o)}>{open ? "Hide" : "View email"}</Button>}
        {act.isPending && <Loader2 className="w-4 h-4 animate-spin self-center" />}
      </div>
      {open && (detail.data ? (
        <div className="space-y-2">
          {detail.data.failures?.length > 0 && (
            <div className="text-xs rounded-md border border-red-200 bg-red-50/60 p-2.5 space-y-1">
              <p className="font-medium text-red-800">Couldn’t deliver to:</p>
              {detail.data.failures.map((f) => <p key={f.email} className="break-all">{f.email} <span className="text-muted-foreground">— {f.error}</span></p>)}
            </div>
          )}
          <EmailFrame title={`Email: ${a.subject}`} html={detail.data.preview.html} />
        </div>
      ) : <Skeleton className="h-40" />)}
    </Card>
  );
}

export default function AnnouncementsTab() {
  const [editing, setEditing] = useState(null); // null: closed; {}: new; record: draft
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-announcements"],
    queryFn: () => base44.admin.announcements(),
    refetchInterval: (q) => (q.state.data?.announcements?.some((a) => a.status === "sending") ? 4000 : false),
  });
  useKeepSending(data?.announcements || []);
  if (isLoading) return <Skeleton className="h-40" />;
  if (error) return <p className="text-sm text-red-700">{error.message}</p>;
  const items = data.announcements;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-sm text-muted-foreground max-w-xl">
          Email everyone, or just job seekers or employers, about changes to TalentBridge. Your agent can draft these too with an API key that has the “Draft announcements” permission.
        </p>
        {!editing && <Button className="gap-1.5" onClick={() => setEditing({})}><Megaphone className="w-4 h-4" /> New announcement</Button>}
      </div>
      {!data.mail_configured && (
        <p className="text-sm text-amber-900 rounded-md border border-amber-200 bg-amber-50 p-3 flex items-start gap-1.5">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> Email isn’t set up on the server, so nothing can be sent. Add BREVO_API_KEY and TB_MAIL_FROM in Vercel.
        </p>
      )}
      {editing && <Composer key={editing.id || "new"} data={data} editing={editing.id ? editing : null} onDone={() => setEditing(null)} />}
      {items.length === 0 && !editing && <Card className="p-6 text-center text-sm text-muted-foreground">No announcements yet.</Card>}
      {items.map((a) => <Row key={a.id} a={a} onEdit={(x) => { setEditing(x); window.scrollTo({ top: 0, behavior: "smooth" }); }} />)}
      <p className="text-xs text-muted-foreground">
        Large sends go out in batches. If the email provider’s daily limit is reached, sending pauses and picks up again automatically the next day; nobody gets the email twice.
      </p>
    </div>
  );
}
