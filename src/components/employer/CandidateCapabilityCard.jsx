import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import {
  Brain, Loader2, ChevronDown, ChevronUp, CheckCircle2,
  TrendingUp, Zap, Star, ShieldCheck, User, FileText, X
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import InterviewScheduler from "./InterviewScheduler";
import OfferDialog from "./OfferDialog";

export default function CandidateCapabilityCard({ application, job, onStatusChange }) {
  const queryClient = useQueryClient();
  const [assessment, setAssessment] = useState(
    application.ai_match_score
      ? {
          match_score: application.ai_match_score,
          summary: application.ai_match_summary,
          growth_potential: application.ai_growth_potential,
        }
      : null
  );
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [fullAssessment, setFullAssessment] = useState(null);

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
    const result = await base44.integrations.Core.InvokeLLM({
      prompt: `You are Symbiot's Employer Capability Assessment Engine. You are NOT a rejection filter. You are an ADVOCATE ENGINE for the employer — helping them see the full potential of this candidate for their role.

CRITICAL: Never recommend rejection. Always frame capability as proof points. If traditional qualifications are missing, surface operational execution evidence instead.

Think like this: "This candidate doesn't have a CS degree, but they have deployed 10 operational apps in the past year, processed over 275M tokens, and possess elite QA logic that matches the employer's need for clean database schemas and reliable error handling."

JOB: ${job.title} at ${job.company}
Core Needs: ${job.description?.slice(0, 400)}
Required Skills: ${job.skills?.join(", ")}
Culture Values: ${job.culture_values?.join(", ") || "Not specified"}
Problems to Solve: ${job.qualifications?.slice(0, 300) || "Not specified"}

APPLICANT:
Name: ${application.applicant_name || "Candidate"}
Cover Letter / Statement: ${application.cover_letter || "Not provided"}

Generate a rich, evidence-based capability profile. Be specific and concrete.`,
      response_json_schema: {
        type: "object",
        properties: {
          match_score: { type: "number" },
          executive_summary: { type: "string" },
          capability_proof_points: {
            type: "array",
            items: {
              type: "object",
              properties: {
                capability: { type: "string" },
                evidence: { type: "string" },
                relevance_to_role: { type: "string" }
              }
            }
          },
          adaptability_verdict: { type: "string" },
          growth_trajectory: { type: "string" },
          suggested_interview_angles: { type: "array", items: { type: "string" } },
          culture_alignment_note: { type: "string" }
        }
      }
    });

    setFullAssessment(result);
    setAssessment({
      match_score: result.match_score,
      summary: result.executive_summary,
      growth_potential: result.growth_trajectory,
    });

    // Persist to the application record
    base44.entities.JobApplication.update(application.id, {
      ai_match_score: result.match_score,
      ai_match_summary: result.executive_summary,
      ai_growth_potential: result.growth_trajectory,
    });

    setLoading(false);
    setExpanded(true);
  };

  const statusConfig = {
    applied: { label: "New Application", color: "bg-blue-100 text-blue-700 border-blue-200" },
    reviewed: { label: "Reviewed", color: "bg-yellow-100 text-yellow-700 border-yellow-200" },
    shortlisted: { label: "Shortlisted", color: "bg-green-100 text-green-700 border-green-200" },
    interview: { label: "Interview", color: "bg-purple-100 text-purple-700 border-purple-200" },
    offered: { label: "Offer Sent", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
    rejected: { label: "Passed", color: "bg-gray-100 text-gray-500 border-gray-200" },
    withdrawn: { label: "Withdrawn", color: "bg-gray-100 text-gray-400 border-gray-200" },
  };

  const cfg = statusConfig[application.status] || statusConfig.applied;

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
          <Select value={application.status} onValueChange={handleStatusChange}>
            <SelectTrigger className="w-8 h-8 p-0 border-0 bg-transparent hover:bg-secondary">
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

      {/* Match Score Bar */}
      {assessment?.match_score && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Capability Alignment</span>
            <span className="font-medium text-foreground">{assessment.match_score}%</span>
          </div>
          <Progress value={assessment.match_score} className="h-1.5" />
        </div>
      )}

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
            <div>
              <p className="text-xs font-semibold text-purple-700 mb-1">Interview Scheduled</p>
              <p className="text-xs text-purple-600">
                {new Date(application.interview_proposed_time).toLocaleString()}
              </p>
              {application.interview_response && (
                <p className="text-xs text-purple-600 mt-1">
                  Candidate Response: <span className="font-semibold capitalize">{application.interview_response}</span>
                </p>
              )}
              {application.interview_counter_time && (
                <p className="text-xs text-purple-600">
                  Counter Proposal: {new Date(application.interview_counter_time).toLocaleString()}
                </p>
              )}
            </div>
          ) : (
            <InterviewScheduler
              application={application}
              job={job}
              onScheduled={() => queryClient.invalidateQueries({ queryKey: ["jobApplications"] })}
            />
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
            </div>
          ) : (
            <OfferDialog
              application={application}
              job={job}
              onOfferSent={() => queryClient.invalidateQueries({ queryKey: ["jobApplications"] })}
            />
          )}
        </div>
      )}

      {/* Assessment Actions */}
      <div className="flex items-center gap-2 pt-1">
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