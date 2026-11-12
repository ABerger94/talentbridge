import React from "react";
import { Button } from "@/components/ui/button";
import { CalendarPlus, Download } from "lucide-react";
import { interviewEvent, googleCalendarUrl, downloadIcs } from "@/lib/calendar";

// For a confirmed interview: Google Calendar link + .ics download (Apple,
// Outlook, anything else).
export default function AddToCalendar({ application, job }) {
  if (!application?.interview_proposed_time) return null;
  const event = interviewEvent(application, job);
  return (
    <div className="flex flex-wrap gap-2">
      <a href={googleCalendarUrl(event)} target="_blank" rel="noreferrer noopener">
        <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5">
          <CalendarPlus className="w-3.5 h-3.5" /> Google Calendar
        </Button>
      </a>
      <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={() => downloadIcs(event)}>
        <Download className="w-3.5 h-3.5" /> Calendar file (.ics)
      </Button>
    </div>
  );
}
