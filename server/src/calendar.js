'use strict';
// Interview times: shown in the employer's time zone (named, plus UTC) in
// emails, and as calendar invites (.ics, which calendars convert to each
// reader's own zone) and "Add to Google Calendar" links.
// src/lib/calendar.js is the browser twin; keep the two in step.

const DEFAULT_DURATION_MIN = 45;

function validZone(tz) {
  if (!tz || typeof tz !== 'string') return null;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return tz;
  } catch {
    return null;
  }
}

// "Tuesday, November 18, 2026 at 2:00 PM EST (7:00 PM UTC)"
function timeText(date, tz) {
  const d = new Date(date);
  const zone = validZone(tz);
  const fmt = (timeZone) => d.toLocaleString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone, timeZoneName: 'short',
  });
  if (!zone || zone === 'UTC') return fmt('UTC');
  const utc = d.toLocaleString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'UTC', timeZoneName: 'short' });
  return `${fmt(zone)} (${utc})`;
}

const icsDate = (d) => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const icsText = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

// Lines longer than 75 octets are folded (RFC 5545 §3.1).
function fold(line) {
  const out = [];
  let rest = Buffer.from(line, 'utf8');
  let first = true;
  while (rest.length > (first ? 75 : 74)) {
    let cut = first ? 75 : 74;
    while (cut > 0 && (rest[cut] & 0xc0) === 0x80) cut -= 1; // don't split a UTF-8 character
    out.push((first ? '' : ' ') + rest.subarray(0, cut).toString('utf8'));
    rest = rest.subarray(cut);
    first = false;
  }
  out.push((first ? '' : ' ') + rest.toString('utf8'));
  return out.join('\r\n');
}

function interviewEvent(application, job) {
  const start = new Date(application.interview_proposed_time);
  const minutes = Number(application.interview_duration_minutes) || DEFAULT_DURATION_MIN;
  const end = new Date(start.getTime() + minutes * 60 * 1000);
  const company = job?.company || 'the employer';
  const where = String(application.interview_location || '').trim();
  return {
    uid: `interview-${application.id}@talentbridge`,
    start,
    end,
    title: `Interview: ${job?.title || 'role'}${job?.company ? ` at ${job.company}` : ''}`,
    location: where,
    description: [
      `Interview for ${job?.title || 'the role'} with ${company}${application.applicant_name ? ` (candidate: ${application.applicant_name})` : ''}.`,
      where ? `Where: ${where}` : '',
      'Arranged on TalentBridge. Message each other from the application.',
    ].filter(Boolean).join('\n'),
  };
}

function ics(event, { sequence = 0 } = {}) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//TalentBridge//Interviews//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${event.uid}`,
    `SEQUENCE:${sequence}`,
    `DTSTAMP:${icsDate(new Date())}`,
    `DTSTART:${icsDate(event.start)}`,
    `DTEND:${icsDate(event.end)}`,
    `SUMMARY:${icsText(event.title)}`,
    `DESCRIPTION:${icsText(event.description)}`,
    ...(event.location ? [`LOCATION:${icsText(event.location)}`] : []),
    'BEGIN:VALARM',
    'TRIGGER:-PT30M',
    'ACTION:DISPLAY',
    'DESCRIPTION:Interview in 30 minutes',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return `${lines.map(fold).join('\r\n')}\r\n`;
}

function googleCalendarUrl(event) {
  const p = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${icsDate(event.start)}/${icsDate(event.end)}`,
    details: event.description,
    ...(event.location ? { location: event.location } : {}),
  });
  return `https://calendar.google.com/calendar/render?${p}`;
}

// Attachment + text line for a confirmed-interview email.
function inviteParts(application, job) {
  const event = interviewEvent(application, job);
  return {
    attachments: [{ filename: 'interview.ics', content: ics(event), contentType: 'text/calendar; charset=utf-8; method=PUBLISH' }],
    calendarLine: `Add it to your calendar with the attached invite, or in Google Calendar: ${googleCalendarUrl(event)}`,
  };
}

module.exports = { timeText, validZone, interviewEvent, ics, googleCalendarUrl, inviteParts, fold, DEFAULT_DURATION_MIN };
