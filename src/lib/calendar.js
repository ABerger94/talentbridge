// Browser twin of server/src/calendar.js: calendar invites for confirmed
// interviews (.ics download and "Add to Google Calendar").
const DEFAULT_DURATION_MIN = 45;

const icsDate = (d) => new Date(d).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const icsText = (s) => String(s ?? "").replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

function fold(line) {
  // Fold at 74 characters (close enough to 75 octets for ASCII-heavy text).
  const out = [];
  for (let i = 0; i < line.length; i += 74) out.push((i ? " " : "") + line.slice(i, i + 74));
  return out.join("\r\n");
}

export function interviewEvent(application, job) {
  const start = new Date(application.interview_proposed_time);
  const minutes = Number(application.interview_duration_minutes) || DEFAULT_DURATION_MIN;
  const end = new Date(start.getTime() + minutes * 60 * 1000);
  const company = job?.company || "the employer";
  const where = String(application.interview_location || "").trim();
  return {
    uid: `interview-${application.id}@talentbridge`,
    start,
    end,
    title: `Interview: ${job?.title || "role"}${job?.company ? ` at ${job.company}` : ""}`,
    location: where,
    description: [
      `Interview for ${job?.title || "the role"} with ${company}${application.applicant_name ? ` (candidate: ${application.applicant_name})` : ""}.`,
      where ? `Where: ${where}` : "",
      "Arranged on TalentBridge. Message each other from the application.",
    ].filter(Boolean).join("\n"),
  };
}

export function icsString(event) {
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//TalentBridge//Interviews//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${event.uid}`,
    `DTSTAMP:${icsDate(new Date())}`,
    `DTSTART:${icsDate(event.start)}`,
    `DTEND:${icsDate(event.end)}`,
    `SUMMARY:${icsText(event.title)}`,
    `DESCRIPTION:${icsText(event.description)}`,
    ...(event.location ? [`LOCATION:${icsText(event.location)}`] : []),
    "BEGIN:VALARM", "TRIGGER:-PT30M", "ACTION:DISPLAY", "DESCRIPTION:Interview in 30 minutes", "END:VALARM",
    "END:VEVENT", "END:VCALENDAR",
  ];
  return `${lines.map(fold).join("\r\n")}\r\n`;
}

export function googleCalendarUrl(event) {
  const p = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${icsDate(event.start)}/${icsDate(event.end)}`,
    details: event.description,
    ...(event.location ? { location: event.location } : {}),
  });
  return `https://calendar.google.com/calendar/render?${p}`;
}

export function downloadIcs(event, filename = "interview.ics") {
  const blob = new Blob([icsString(event)], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// "Tue, Nov 18, 2:00 PM EST" in the viewer's own zone.
export function localTime(iso) {
  return new Date(iso).toLocaleString("en-US", {
    weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short",
  });
}
