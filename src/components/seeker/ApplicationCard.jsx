import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  CheckCircle2, Clock, AlertCircle, Briefcase, Calendar,
  TrendingUp, MessageSquare, Loader2
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

const statusConfig = {
  applied: { label: "Applied", color: "bg-blue-100 text-blue-700", icon: Briefcase },
  reviewed: { label: "Under Review", color: "bg-yellow-100 text-yellow-700", icon: Clock },
  shortlisted: { label: "Shortlisted", color: "bg-green-100 text-green-700", icon: CheckCircle2 },
  interview: { label: "Interview Invited", color: "bg-purple-100 text-purple-700", icon: Calendar },
  offered: { label: "Offer Received", color: "bg-emerald-100 text-emerald-700", icon: TrendingUp },
  rejected: { label: "Not Selected", color: "bg-gray-100 text-gray-600", icon: AlertCircle },
  withdrawn: { label: "Withdrawn", color: "bg-gray-100 text-gray-400", icon: AlertCircle },
};

export default function ApplicationCard({ application, job, onUpdate }) {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [interviewDialogOpen, setInterviewDialogOpen] = useState(false);
  const [counterTime, setCounterTime] = useState("");
  const [offerDialogOpen, setOfferDialogOpen] = useState(false);
  const [negotiationNotes, setNegotiationNotes] = useState("");

  const cfg = statusConfig[application.status] || statusConfig.applied;
  const StatusIcon = cfg.icon;

  const handleInterviewResponse = async (response, proposedTime = null) => {
    setLoading(true);
    try {
      const updateData = {
        interview_response: response,
      };
      if (proposedTime) {
        updateData.interview_counter_time = proposedTime;
      }
      await base44.entities.JobApplication.update(application.id, updateData);
      toast.success(`Interview ${response}!`);
      setInterviewDialogOpen(false);
      setCounterTime("");
      queryClient.invalidateQueries({ queryKey: ["myApplications"] });
      onUpdate?.();
    } catch (error) {
      toast.error("Failed to respond to interview");
    }
    setLoading(false);
  };

  const handleOfferResponse = async (response, notes = null) => {
    setLoading(true);
    try {
      const updateData = {
        offer_response: response,
      };
      if (notes) {
        updateData.offer_negotiation_notes = notes;
      }
      await base44.entities.JobApplication.update(application.id, updateData);
      toast.success(`Offer ${response}!`);
      setOfferDialogOpen(false);
      setNegotiationNotes("");
      queryClient.invalidateQueries({ queryKey: ["myApplications"] });
      onUpdate?.();
    } catch (error) {
      toast.error("Failed to respond to offer");
    }
    setLoading(false);
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <h3 className="font-semibold text-sm">{job?.title || "Unknown Role"}</h3>
              <Badge className={`text-xs ${cfg.color}`}>
                <StatusIcon className="w-3 h-3 mr-1" />
                {cfg.label}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">{job?.company || "Unknown Company"}</p>
            {job?.location && (
              <p className="text-xs text-muted-foreground">{job.location}</p>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Match Score */}
        {application.ai_match_score && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Capability Match</span>
              <span className="font-medium">{application.ai_match_score}%</span>
            </div>
            <Progress value={application.ai_match_score} className="h-1.5" />
            {application.ai_match_summary && (
              <p className="text-xs text-foreground mt-2 italic">"{application.ai_match_summary}"</p>
            )}
          </div>
        )}

        {/* Interview Section */}
        {application.status === "interview" && application.interview_proposed_time && (
          <div className="rounded-lg bg-purple-50 border border-purple-200 p-3 space-y-3">
            <div>
              <p className="text-xs font-semibold text-purple-700 mb-1 flex items-center gap-1">
                <Calendar className="w-3 h-3" /> Proposed Interview Time
              </p>
              <p className="text-sm font-medium text-purple-900">
                {new Date(application.interview_proposed_time).toLocaleString('en-US', {
                  weekday: 'long',
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                  timeZoneName: 'short'
                })}
              </p>
            </div>

            {application.interview_response === "counter_proposed" && application.interview_counter_time && (
              <div>
                <p className="text-xs font-semibold text-purple-700 mb-1">Your Counter Proposal</p>
                <p className="text-sm text-purple-900">
                  {new Date(application.interview_counter_time).toLocaleString()}
                </p>
              </div>
            )}

            {!application.interview_response || application.interview_response === "pending" ? (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="text-xs"
                  onClick={() => handleInterviewResponse("accepted")}
                  disabled={loading}
                >
                  {loading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                  Accept
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs"
                  onClick={() => handleInterviewResponse("declined")}
                  disabled={loading}
                >
                  Decline
                </Button>
                <Dialog open={interviewDialogOpen} onOpenChange={setInterviewDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="outline" className="text-xs gap-1">
                      <MessageSquare className="w-3 h-3" /> Counter Propose
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-[400px]">
                    <DialogHeader>
                      <DialogTitle>Propose Alternative Time</DialogTitle>
                      <DialogDescription>
                        Suggest a different interview time
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label htmlFor="counter-time">Your Proposed Time</Label>
                        <Input
                          id="counter-time"
                          type="datetime-local"
                          value={counterTime}
                          onChange={(e) => setCounterTime(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="flex gap-2 justify-end">
                      <Button variant="outline" onClick={() => setInterviewDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button
                        onClick={() => handleInterviewResponse("counter_proposed", counterTime)}
                        disabled={loading || !counterTime}
                      >
                        {loading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                        Send Proposal
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            ) : (
              <Badge variant="secondary" className="text-xs w-full text-center py-1 capitalize">
                {application.interview_response === "counter_proposed"
                  ? "Waiting for Response"
                  : `You ${application.interview_response} this interview`}
              </Badge>
            )}
          </div>
        )}

        {/* Offer Section */}
        {application.status === "offered" && application.offer_details && (
          <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="text-xs text-emerald-700 font-semibold">Position</p>
                <p className="text-sm font-medium text-emerald-900">{application.offer_details.title}</p>
              </div>
              <div>
                <p className="text-xs text-emerald-700 font-semibold">Compensation</p>
                <p className="text-sm font-medium text-emerald-900">
                  {application.offer_details.salary_currency} {application.offer_details.salary.toLocaleString()}
                </p>
              </div>
              {application.offer_details.start_date && (
                <div>
                  <p className="text-xs text-emerald-700 font-semibold">Start Date</p>
                  <p className="text-sm font-medium text-emerald-900">{application.offer_details.start_date}</p>
                </div>
              )}
              {application.offer_details.benefits && (
                <div>
                  <p className="text-xs text-emerald-700 font-semibold">Benefits</p>
                  <p className="text-sm font-medium text-emerald-900">{application.offer_details.benefits}</p>
                </div>
              )}
            </div>
            {application.offer_details.notes && (
              <p className="text-xs text-emerald-700 italic pt-2 border-t border-emerald-200">
                {application.offer_details.notes}
              </p>
            )}

            {application.offer_response === "negotiating" && application.offer_negotiation_notes && (
              <div className="bg-white rounded p-2 border border-emerald-200">
                <p className="text-xs font-semibold text-emerald-700 mb-1">Your Feedback</p>
                <p className="text-xs text-emerald-900">{application.offer_negotiation_notes}</p>
              </div>
            )}

            {!application.offer_response || application.offer_response === "pending" ? (
              <div className="flex gap-2 flex-wrap">
                <Button
                  size="sm"
                  className="text-xs bg-emerald-600 hover:bg-emerald-700"
                  onClick={() => handleOfferResponse("accepted")}
                  disabled={loading}
                >
                  {loading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                  Accept
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs"
                  onClick={() => handleOfferResponse("declined")}
                  disabled={loading}
                >
                  Decline
                </Button>
                <Dialog open={offerDialogOpen} onOpenChange={setOfferDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="outline" className="text-xs gap-1">
                      <MessageSquare className="w-3 h-3" /> Negotiate
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-[450px]">
                    <DialogHeader>
                      <DialogTitle>Negotiation Feedback</DialogTitle>
                      <DialogDescription>
                        Share your negotiation thoughts or counter-proposal
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label htmlFor="feedback">Your Feedback</Label>
                        <Textarea
                          id="feedback"
                          placeholder="e.g., Can we discuss salary? What's flexible?"
                          value={negotiationNotes}
                          onChange={(e) => setNegotiationNotes(e.target.value)}
                          className="min-h-[100px]"
                        />
                      </div>
                    </div>
                    <div className="flex gap-2 justify-end">
                      <Button variant="outline" onClick={() => setOfferDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button
                        onClick={() => handleOfferResponse("negotiating", negotiationNotes)}
                        disabled={loading || !negotiationNotes}
                      >
                        {loading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                        Send Feedback
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            ) : (
              <Badge variant="secondary" className="text-xs w-full text-center py-1 capitalize">
                {application.offer_response === "negotiating"
                  ? "Negotiation in Progress"
                  : `You ${application.offer_response} this offer`}
              </Badge>
            )}
          </div>
        )}

        {/* Rejection Notice */}
        {application.status === "rejected" && (
          <div className="rounded-lg bg-gray-50 border border-gray-200 p-3">
            <p className="text-xs text-gray-700">
              Thank you for your interest. We've decided to move forward with other candidates. We encourage you to apply for future positions.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}