import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Calendar, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function InterviewScheduler({ application, job, onScheduled, triggerLabel = "Schedule Interview" }) {
  const [open, setOpen] = useState(false);
  const [datetime, setDatetime] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSchedule = async () => {
    if (!datetime) {
      toast.error("Please select an interview time");
      return;
    }

    setLoading(true);
    try {
      await base44.functions.invoke("sendInterviewInvitation", {
        application_id: application.id,
        job_id: job.id,
        // datetime-local has no time zone; convert in the browser so the
        // server stores the moment the employer actually picked.
        proposed_time: new Date(datetime).toISOString(),
      });
      toast.success("Interview invitation sent!");
      setOpen(false);
      setDatetime("");
      onScheduled?.();  
    } catch (error) {
      toast.error(error?.message || "Failed to schedule interview");
    }
    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1.5 text-xs">
          <Calendar className="w-3.5 h-3.5" /> {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Schedule Interview</DialogTitle>
          <DialogDescription>
            Propose an interview time for {application.applicant_name}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="interview-time">Interview Date & Time</Label>
            <Input
              id="interview-time"
              type="datetime-local"
              value={datetime}
              onChange={(e) => setDatetime(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Candidate can accept or propose alternative time
            </p>
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSchedule} disabled={loading}>
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
            Send Invitation
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}