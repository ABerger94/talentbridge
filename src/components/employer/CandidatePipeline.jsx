import React, { useEffect, useMemo, useState } from "react";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { formatDistanceToNowStrict } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Columns3, List, Search, StickyNote, Calendar, AlertTriangle, Users } from "lucide-react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import CandidateCapabilityCard from "./CandidateCapabilityCard";
import { changeApplicationStatus, PIPELINE_COLUMNS } from "@/lib/applicationStatus";
import { localTime } from "@/lib/calendar";

const VIEW_KEY = "tb_candidates_view";

function readView() {
  try {
    const v = localStorage.getItem(VIEW_KEY);
    if (v === "board" || v === "list") return v;
  } catch { /* storage unavailable */ }
  return typeof window !== "undefined" && window.innerWidth < 768 ? "list" : "board";
}

function PipelineCard({ app, showRole, onOpen, provided, dragging }) {
  return (
    <div
      ref={provided?.innerRef}
      {...(provided?.draggableProps || {})}
      {...(provided?.dragHandleProps || {})}
      role="button"
      tabIndex={0}
      onClick={() => onOpen(app)}
      onKeyDown={(e) => { if (e.key === "Enter") onOpen(app); }}
      className={`rounded-lg border bg-card p-2.5 space-y-1.5 text-left cursor-pointer hover:border-primary/40 transition-shadow ${dragging ? "shadow-lg ring-1 ring-primary/30" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium leading-tight break-words min-w-0">{app.applicant_name || "Candidate"}</span>
        {app.ai_match_score ? (
          <Badge variant="outline" className="text-[10px] shrink-0 px-1.5">{app.ai_match_score}%</Badge>
        ) : null}
      </div>
      {showRole && app.matched_job && <p className="text-[11px] text-muted-foreground truncate">{app.matched_job.title}</p>}
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground flex-wrap">
        <span>{app.created_date ? formatDistanceToNowStrict(new Date(app.created_date), { addSuffix: true }) : ""}</span>
        {app.employer_notes && <StickyNote className="w-3 h-3" aria-label="Has notes" />}
        {app.ai_integrity_flags?.length > 0 && <AlertTriangle className="w-3 h-3 text-amber-600" aria-label="Text aimed at the AI" />}
      </div>
      {app.status === "interview" && app.interview_proposed_time && (
        <p className="text-[11px] text-purple-700 flex items-center gap-1">
          <Calendar className="w-3 h-3" /> {localTime(app.interview_proposed_time)}
          {app.interview_response === "accepted" ? " ✓" : app.interview_response === "counter_proposed" ? " · new time suggested" : ""}
        </p>
      )}
      {app.status === "offered" && app.offer_response && (
        <p className="text-[11px] text-emerald-700 capitalize">Offer {app.offer_response}</p>
      )}
    </div>
  );
}

export default function CandidatePipeline({ applications, jobs, loading, selectedJob, setSelectedJob }) {
  const queryClient = useQueryClient();
  const [view, setView] = useState(readView);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("newest");
  const [openId, setOpenId] = useState(null);
  const [overrides, setOverrides] = useState({}); // optimistic status by application id
  const [confirmPass, setConfirmPass] = useState(null); // { app }

  useEffect(() => { setOverrides({}); }, [applications]);
  useEffect(() => {
    try { localStorage.setItem(VIEW_KEY, view); } catch { /* storage unavailable */ }
  }, [view]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = applications
      .map((a) => (overrides[a.id] ? { ...a, status: overrides[a.id] } : a))
      .filter((a) => !selectedJob || a.job_id === selectedJob)
      .filter((a) => !q || [a.applicant_name, a.cover_letter, a.employer_notes, a.matched_job?.title]
        .some((v) => String(v || "").toLowerCase().includes(q)));
    const by = {
      newest: (x, y) => String(y.created_date).localeCompare(String(x.created_date)),
      oldest: (x, y) => String(x.created_date).localeCompare(String(y.created_date)),
      score: (x, y) => (y.ai_match_score || -1) - (x.ai_match_score || -1),
    }[sort];
    return [...list].sort(by);
  }, [applications, overrides, selectedJob, query, sort]);

  const openApp = visible.find((a) => a.id === openId) || applications.find((a) => a.id === openId);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["allApplications"] });

  const move = async (app, status) => {
    setOverrides((o) => ({ ...o, [app.id]: status }));
    try {
      await changeApplicationStatus(app, app.matched_job, status);
      const col = PIPELINE_COLUMNS.find((c) => c.status === status);
      toast.success(`${app.applicant_name || "Candidate"} moved to ${col?.label || status}${["shortlisted", "rejected"].includes(status) ? ". They've been emailed." : "."}`);
      // Interviews and offers need details: open the candidate to add them.
      if ((status === "interview" && !app.interview_proposed_time) || (status === "offered" && !app.offer_details)) {
        setOpenId(app.id);
      }
      refresh();
    } catch (e) {
      setOverrides((o) => { const n = { ...o }; delete n[app.id]; return n; });
      toast.error(e?.message || "Couldn't move the candidate.");
    }
  };

  const onDragEnd = ({ draggableId, destination, source }) => {
    if (!destination || destination.droppableId === source.droppableId) return;
    const app = visible.find((a) => a.id === draggableId);
    if (!app) return;
    if (destination.droppableId === "rejected") setConfirmPass({ app });
    else move(app, destination.droppableId);
  };

  const withdrawn = visible.filter((a) => a.status === "withdrawn");
  const counts = Object.fromEntries(PIPELINE_COLUMNS.map((c) => [c.status, visible.filter((a) => a.status === c.status).length]));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={selectedJob || "all"} onValueChange={(v) => setSelectedJob(v === "all" ? null : v)}>
          <SelectTrigger className="h-9 w-full sm:w-56" aria-label="Role"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All roles</SelectItem>
            {jobs.map((j) => <SelectItem key={j.id} value={j.id}>{j.title}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="relative flex-1 min-w-[10rem]">
          <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, cover letter, notes" className="h-9 pl-8" />
        </div>
        <Select value={sort} onValueChange={setSort}>
          <SelectTrigger className="h-9 w-36" aria-label="Sort"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest first</SelectItem>
            <SelectItem value="oldest">Oldest first</SelectItem>
            <SelectItem value="score">Best AI match</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex rounded-md border p-0.5" role="group" aria-label="View">
          <Button size="sm" variant={view === "board" ? "secondary" : "ghost"} className="h-8 gap-1.5" onClick={() => setView("board")} aria-pressed={view === "board"}>
            <Columns3 className="w-4 h-4" /> Board
          </Button>
          <Button size="sm" variant={view === "list" ? "secondary" : "ghost"} className="h-8 gap-1.5" onClick={() => setView("list")} aria-pressed={view === "list"}>
            <List className="w-4 h-4" /> List
          </Button>
        </div>
      </div>

      {loading ? (
        <Skeleton className="h-48 rounded-xl" />
      ) : visible.length === 0 ? (
        <Card className="p-12 text-center text-muted-foreground">
          <Users className="w-12 h-12 mx-auto mb-4 opacity-20" />
          <p>{query ? "No candidates match your search." : selectedJob ? "No applications for this role yet." : "No applications yet across your roles."}</p>
        </Card>
      ) : view === "board" ? (
        <>
          <p className="text-xs text-muted-foreground">Drag a candidate to move them. Moving to Shortlisted or Passed emails the candidate.</p>
          <DragDropContext onDragEnd={onDragEnd}>
            <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
              {PIPELINE_COLUMNS.map((col) => (
                <Droppable droppableId={col.status} key={col.status}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={`min-w-[10rem] flex-1 basis-0 rounded-xl border border-t-4 ${col.tone} bg-secondary/40 p-2 space-y-2 min-h-[160px] ${snapshot.isDraggingOver ? "bg-primary/5" : ""}`}
                    >
                      <div className="flex items-center justify-between px-1">
                        <span className="text-sm font-semibold">{col.label}</span>
                        <span className="text-xs text-muted-foreground">{counts[col.status]}</span>
                      </div>
                      {visible.filter((a) => a.status === col.status).map((app, index) => (
                        <Draggable draggableId={app.id} index={index} key={app.id}>
                          {(p, s) => <PipelineCard app={app} showRole={!selectedJob} onOpen={(a) => setOpenId(a.id)} provided={p} dragging={s.isDragging} />}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              ))}
            </div>
          </DragDropContext>
          {withdrawn.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-muted-foreground">Withdrawn by candidate ({withdrawn.length})</summary>
              <div className="grid sm:grid-cols-3 gap-2 mt-2">
                {withdrawn.map((app) => <PipelineCard key={app.id} app={app} showRole={!selectedJob} onOpen={(a) => setOpenId(a.id)} />)}
              </div>
            </details>
          )}
        </>
      ) : (
        <div className="space-y-4">
          {visible.map((app) => (
            <div key={app.id} className="space-y-2">
              {!selectedJob && app.matched_job && <Badge className="text-xs">{app.matched_job.title}</Badge>}
              <CandidateCapabilityCard
                application={app}
                job={app.matched_job}
                onStatusChange={(id, status) => base44Update(id, status, refresh)}
              />
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!openApp} onOpenChange={(o) => { if (!o) setOpenId(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0">
          <DialogHeader className="sr-only">
            <DialogTitle>{openApp?.applicant_name || "Candidate"}</DialogTitle>
            <DialogDescription>{openApp?.matched_job?.title}</DialogDescription>
          </DialogHeader>
          {openApp && (
            <div className="p-2 pt-10 sm:pt-2">
              <CandidateCapabilityCard
                key={openApp.id}
                application={openApp}
                job={openApp.matched_job}
                onStatusChange={(id, status) => base44Update(id, status, refresh)}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmPass} onOpenChange={(o) => { if (!o) setConfirmPass(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Pass on {confirmPass?.app.applicant_name || "this candidate"}?</AlertDialogTitle>
            <AlertDialogDescription>
              They'll get a kind email saying you're moving forward with other candidates for {confirmPass?.app.matched_job?.title || "this role"}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { move(confirmPass.app, "rejected"); setConfirmPass(null); }}>Pass and email</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// The card's own status menu already sent any email; this saves the status.
async function base44Update(id, status, refresh) {
  try {
    await base44.entities.JobApplication.update(id, { status });
  } catch { /* the email function already stored it */ }
  refresh();
}
