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
  const [duration, setDuration] = useState(String(application.interview_duration_minutes || 45));
  const [location, setLocation] = useState(application.interview_location || "");
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
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
        // Emails show the time in this zone (and UTC); calendars convert.
        timezone: zone,
        duration_minutes: Number(duration),
        location: location.trim(),
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
              Your time zone: {zone}. The candidate sees it in theirs and can accept or suggest another time.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="interview-duration">Length</Label>
            <select
              id="interview-duration"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            >
              {[15, 30, 45, 60, 90, 120].map((m) => <option key={m} value={m}>{m} minutes</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="interview-location">Where (optional)</Label>
            <Input
              id="interview-location"
              placeholder="Video link, phone number, or address"
              value={location}
              maxLength={300}
              onChange={(e) => setLocation(e.target.value)}
            />
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