import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import {
  Brain, Loader2, ChevronDown, ChevronUp, CheckCircle2,
  TrendingUp, Zap, Star, ShieldCheck, User, FileText, MessageSquare
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import InterviewScheduler from "./InterviewScheduler";
import { normalizePercent } from "@/lib/scales";
import OfferDialog from "./OfferDialog";
import { AiAssisted, IntegrityWarning } from "@/components/AiDisclosure";
import AddToCalendar from "@/components/AddToCalendar";
import { Textarea } from "@/components/ui/textarea";
import ProfessionalLinks from "@/components/seeker/ProfessionalLinks";

export default function CandidateCapabilityCard({ application, job, onStatusChange }) {
  const queryClient = useQueryClient();
  const [assessment, setAssessment] = useState(
    application.ai_match_score
      ? {
          match_score: normalizePercent(application.ai_match_score),
          summary: application.ai_match_summary,
          growth_potential: application.ai_growth_potential,
        }
      : null
  );
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [fullAssessment, setFullAssessment] = useState(application.ai_assessment || null);
  const integrityFlags = fullAssessment?.integrity_flags || application.ai_integrity_flags || [];

  const handleStatusChange = async (newStatus) => {
    if (newStatus === "shortlisted") {
      try {
        await base44.functions.invoke("sendShortlistNotification", {
          application_id: application.id,
          job_id: job.id,
        });
        toast.success("Shortlist notification sent!");
      } catch (error) {
        toast.error("Failed to send notification");
      }
    } else if (newStatus === "rejected") {
      try {
        await base44.functions.invoke("sendRejectionEmail", {
          application_id: application.id,
          job_id: job.id,
        });
        toast.success("Rejection email sent!");
      } catch (error) {
        toast.error("Failed to send rejection email");
      }
    }
    onStatusChange(application.id, newStatus);
  };

  const runCapabilityAssessment = async () => {
    setLoading(true);
    try {
      // Runs on the server: blind to the candidate's identity, with the
      // candidate's text fenced off from the AI's instructions.
      const { data: result } = await base44.functions.invoke("assessApplication", {
        application_id: application.id,
        job_id: job?.id,
      });
      setFullAssessment(result);
      setAssessment({
        match_score: normalizePercent(result.match_score),
        summary: result.executive_summary,
        growth_potential: result.growth_trajectory,
      });
      setExpanded(true);
      queryClient.invalidateQueries({ queryKey: ["allApplications"] });
    } catch (err) {
      console.error("runCapabilityAssessment failed", err);
      toast.error(`Couldn't run the capability assessment: ${err?.message || "please try again."}`);
    } finally {
      setLoading(false);
    }
  };

  const statusConfig = {
    applied: { label: "New Application", color: "bg-blue-100 text-blue-700 border-blue-200" },
    reviewed: { label: "Reviewed", color: "bg-yellow-100 text-yellow-700 border-yellow-200" },
    shortlisted: { label: "Shortlisted", color: "bg-green-100 text-green-700 border-green-200" },
    interview: { label: "Interview", color: "bg-purple-100 text-purple-700 border-purple-200" },
    offered: { label: "Offer Sent", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
    rejected: { label: "Passed", color: "bg-gray-100 text-gray-500 border-gray-200" },
    withdrawn: { label: "Withdrawn by candidate", color: "bg-gray-100 text-gray-500 border-gray-200" },
  };

  const cfg = statusConfig[application.status] || statusConfig.applied;
  const [counterLoading, setCounterLoading] = useState(false);

  const refreshApplications = () => {
    queryClient.invalidateQueries({ queryKey: ["allApplications"] });
  };

  const fmtTime = (iso) =>
    new Date(iso).toLocaleString("en-US", {
      weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short",
    });

  const acceptCounter = async () => {
    setCounterLoading(true);
    try {
      await base44.functions.invoke("acceptInterviewCounter", { application_id: application.id, job_id: job?.id });
      toast.success("Interview confirmed — the candidate has been emailed.");
      refreshApplications();
    } catch (error) {
      toast.error(error?.message || "Couldn't confirm the interview.");
    } finally {
      setCounterLoading(false);
    }
  };

  return (
    <Card className="p-5 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center shrink-0">
            <User className="w-5 h-5 text-muted-foreground" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="font-semibold text-sm">{application.applicant_name || "Anonymous"}</h4>
              {assessment?.match_score && (
                <Badge className="bg-primary/10 text-primary border-primary/20 text-xs gap-1">
                  <Zap className="w-2.5 h-2.5" /> {assessment.match_score}% capability match
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{application.applicant_email}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={`text-xs ${cfg.color}`}>{cfg.label}</Badge>
          <Select value={application.status} onValueChange={handleStatusChange} disabled={application.status === "withdrawn"}>
            <SelectTrigger className="w-8 h-8 p-0 border-0 bg-transparent hover:bg-secondary" aria-label="Change status">
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="applied">New</SelectItem>
              <SelectItem value="reviewed">Reviewed</SelectItem>
              <SelectItem value="shortlisted">Shortlist</SelectItem>
              <SelectItem value="interview">Interview</SelectItem>
              <SelectItem value="offered">Send Offer</SelectItem>
              <SelectItem value="rejected">Pass</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {application.seeker_links?.length > 0 && <ProfessionalLinks links={application.seeker_links} />}

      {/* Match Score Bar */}
      {assessment?.match_score && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">Capability Alignment <AiAssisted /></span>
            <span className="font-medium text-foreground">{assessment.match_score}%</span>
          </div>
          <Progress value={assessment.match_score} className="h-1.5" />
        </div>
      )}

      <IntegrityWarning flags={integrityFlags} />

      {/* Resume Link */}
      {application.resume_url && (
        <a href={application.resume_url} target="_blank" rel="noreferrer">
          <Button variant="outline" size="sm" className="gap-1.5 text-xs w-full">
            <FileText className="w-3.5 h-3.5" /> View Resume
          </Button>
        </a>
      )}

      {/* Cover Letter */}
      {application.cover_letter && (
        <p className="text-xs text-muted-foreground bg-secondary/60 rounded-lg p-3 leading-relaxed italic">
          "{application.cover_letter}"
        </p>
      )}

      {/* Summary */}
      {assessment?.summary && !expanded && (
        <p className="text-xs text-foreground leading-relaxed bg-primary/5 rounded-lg p-3">
          {assessment.summary}
        </p>
      )}

      {/* Expanded Full Assessment */}
      {fullAssessment && expanded && (
        <div className="space-y-3 pt-1">
          <div className="rounded-lg bg-primary/5 border border-primary/15 p-3">
            <p className="text-xs font-semibold text-primary mb-1.5 flex items-center gap-1.5">
              <Brain className="w-3 h-3" /> Executive Capability Summary
            </p>
            <p className="text-xs text-foreground leading-relaxed">{fullAssessment.executive_summary}</p>
          </div>

          {fullAssessment.capability_proof_points?.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Capability Proof Points</p>
              {fullAssessment.capability_proof_points.map((pt, i) => (
                <div key={i} className="rounded-lg border border-border/50 p-3 space-y-1">
                  <p className="text-xs font-semibold flex items-center gap-1.5">
                    <CheckCircle2 className="w-3 h-3 text-accent" /> {pt.capability}
                  </p>
                  <p className="text-xs text-muted-foreground">{pt.evidence}</p>
                  <p className="text-xs text-primary/80 flex items-start gap-1">
                    <Star className="w-3 h-3 shrink-0 mt-0.5" /> {pt.relevance_to_role}
                  </p>
                </div>
              ))}
            </div>
          )}

          {fullAssessment.adaptability_verdict && (
            <div className="rounded-lg bg-accent/8 border border-accent/20 p-3">
              <p className="text-xs font-semibold text-accent mb-1 flex items-center gap-1.5">
                <ShieldCheck className="w-3 h-3" /> Adaptability Verdict
              </p>
              <p className="text-xs text-foreground leading-relaxed">{fullAssessment.adaptability_verdict}</p>
            </div>
          )}

          {fullAssessment.growth_trajectory && (
            <div className="rounded-lg bg-secondary p-3">
              <p className="text-xs font-semibold mb-1 flex items-center gap-1.5">
                <TrendingUp className="w-3 h-3 text-primary" /> Growth Trajectory
              </p>
              <p className="text-xs text-muted-foreground">{fullAssessment.growth_trajectory}</p>
            </div>
          )}

          {fullAssessment.suggested_interview_angles?.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Suggested Interview Angles</p>
              {fullAssessment.suggested_interview_angles.map((a, i) => (
                <div key={i} className="rounded bg-secondary/60 px-3 py-2 text-xs text-foreground flex items-start gap-2">
                  <span className="text-primary font-bold shrink-0">{i + 1}.</span> {a}
                </div>
              ))}
            </div>
          )}

          {fullAssessment.culture_alignment_note && (
            <p className="text-xs text-muted-foreground italic px-1">
              💡 {fullAssessment.culture_alignment_note}
            </p>
          )}
        </div>
      )}

      {/* Status-specific Actions */}
      {application.status === "interview" && (
        <div className="rounded-lg bg-purple-50 border border-purple-200 p-3 space-y-2">
          {application.interview_proposed_time ? (
            <div className="space-y-2">
              <div>
                <p className="text-xs font-semibold text-purple-700 mb-1">
                  {application.interview_response === "accepted" ? "Interview Confirmed" : "Interview Proposed"}
                </p>
                <p className="text-xs text-purple-600">
                  {fmtTime(application.interview_proposed_time)}
                  {application.interview_duration_minutes ? ` · ${application.interview_duration_minutes} min` : ""}
                </p>
                {application.interview_location && (
                  <p className="text-xs text-purple-600 break-all">Where: {application.interview_location}</p>
                )}
              </div>
              {application.interview_response === "accepted" && <AddToCalendar application={application} job={job} />}
              {application.interview_response === "declined" && (
                <p className="text-xs text-purple-700">The candidate declined this time.</p>
              )}
              {(!application.interview_response || application.interview_response === "pending") && (
                <p className="text-xs text-purple-600">Waiting for the candidate to respond.</p>
              )}
              {application.interview_response === "counter_proposed" && application.interview_counter_time && (
                <div className="rounded bg-white border border-purple-200 p-2 space-y-2">
                  <p className="text-xs text-purple-700">
                    The candidate suggested <span className="font-semibold">{fmtTime(application.interview_counter_time)}</span>
                  </p>
                  <Button size="sm" className="text-xs h-7" onClick={acceptCounter} disabled={counterLoading}>
                    {counterLoading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                    Accept this time
                  </Button>
                </div>
              )}
              <InterviewScheduler
                application={application}
                job={job}
                onScheduled={refreshApplications}
                triggerLabel={application.interview_response === "counter_proposed" ? "Propose a different time" : "Reschedule"}
              />
            </div>
          ) : (
            <InterviewScheduler application={application} job={job} onScheduled={refreshApplications} />
          )}
        </div>
      )}

      {application.status === "offered" && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 space-y-2">
          {application.offer_details ? (
            <div>
              <p className="text-xs font-semibold text-emerald-700 mb-1">Offer Details</p>
              <p className="text-xs text-emerald-600">
                {application.offer_details.salary_currency} {application.offer_details.salary}
              </p>
              {application.offer_response && (
                <p className="text-xs text-emerald-600 mt-1">
                  Candidate Response: <span className="font-semibold capitalize">{application.offer_response}</span>
                </p>
              )}
              {application.offer_negotiation_notes && (
                <p className="text-xs text-emerald-600 italic mt-1">
                  "{application.offer_negotiation_notes}"
                </p>
              )}
              {["negotiating", "declined"].includes(application.offer_response) && (
                <div className="mt-2">
                  <OfferDialog
                    application={application}
                    job={job}
                    onOfferSent={refreshApplications}
                    triggerLabel="Send revised offer"
                  />
                </div>
              )}
            </div>
          ) : (
            <OfferDialog
               application={application}
               job={job}
               onOfferSent={() => {
                 queryClient.invalidateQueries({ queryKey: ["allApplications"] });
                 queryClient.refetchQueries({ queryKey: ["allApplications"] });
               }}
             />
          )}
        </div>
      )}

      {application.status === "withdrawn" && (
        <div className="rounded-lg bg-gray-50 border border-gray-200 p-3">
          <p className="text-xs text-gray-600">
            The candidate withdrew this application{application.withdrawn_date ? ` on ${new Date(application.withdrawn_date).toLocaleDateString()}` : ""}.
          </p>
        </div>
      )}

      <PrivateNotes application={application} onSaved={refreshApplications} />

      {/* Assessment Actions */}
      <div className="flex items-center gap-2 pt-1 flex-wrap">
        <Link to={`/messages?c=${application.id}`}>
          <Button variant="outline" size="sm" className="gap-1.5 text-xs">
            <MessageSquare className="w-3.5 h-3.5" /> Message
          </Button>
        </Link>
        {!assessment ? (
          <Button size="sm" className="gap-1.5 text-xs" onClick={runCapabilityAssessment} disabled={loading}>
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Brain className="w-3.5 h-3.5" />}
            Run Capability Assessment
          </Button>
        ) : (
          <>
            {fullAssessment && (
              <Button variant="ghost" size="sm" className="gap-1 text-xs" onClick={() => setExpanded(p => !p)}>
                {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                {expanded ? "Collapse" : "View Full Report"}
              </Button>
            )}
            {!fullAssessment && (
              <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={runCapabilityAssessment} disabled={loading}>
                {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Brain className="w-3.5 h-3.5" />}
                Run Full Assessment
              </Button>
            )}
          </>
        )}
      </div>
    </Card>
  );
}
// Employer-only notes on the application (never shown to the candidate).
function PrivateNotes({ application, onSaved }) {
  const [text, setText] = useState(application.employer_notes || "");
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(!!application.employer_notes);
  const dirty = text !== (application.employer_notes || "");

  const save = async () => {
    setSaving(true);
    try {
      await base44.entities.JobApplication.update(application.id, { employer_notes: text.slice(0, 5000) });
      toast.success("Note saved.");
      onSaved?.();
    } catch (e) {
      toast.error(e?.message || "Couldn't save the note.");
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-xs text-primary hover:underline">
        + Add a private note
      </button>
    );
  }
  return (
    <div className="space-y-1.5">
      <label htmlFor={`notes-${application.id}`} className="text-xs font-medium text-muted-foreground">
        Private notes <span className="font-normal">· only you see these</span>
      </label>
      <Textarea
        id={`notes-${application.id}`}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="e.g. Strong on audits; ask about weekend availability."
        className="text-xs min-h-[64px]"
        maxLength={5000}
      />
      {dirty && (
        <Button size="sm" className="h-7 text-xs" onClick={save} disabled={saving}>
          {saving ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null} Save note
        </Button>
      )}
    </div>
  );
}
