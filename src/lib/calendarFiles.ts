/**
 * "Add to calendar" support: Google Calendar links and iCalendar (.ics) files,
 * which Apple Calendar, Outlook, and Google can all import or subscribe to.
 */
import { CAMPUS_TIME_ZONE, campusDateKey } from './campusTime.ts';
import type { CampusEvent } from './event.ts';

/** Calendar apps need an end time; assume an hour when the source gives none. */
const DEFAULT_DURATION_MS = 60 * 60_000;

/** "20261108T023000Z" */
function utcStamp(instant: Date): string {
  return instant.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/** "20261124" */
function compactDate(dateKey: string): string {
  return dateKey.replace(/-/g, '');
}

function nextDateKey(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
}

/** Start and end in the formats calendars expect. All-day ends are exclusive. */
function calendarSpan(event: CampusEvent): { start: string; end: string; allDay: boolean } {
  const start = new Date(event.start);
  if (event.allDay) {
    const lastDay = campusDateKey(event.end ? new Date(event.end) : start);
    return { start: compactDate(campusDateKey(start)), end: compactDate(nextDateKey(lastDay)), allDay: true };
  }
  const end = event.end ? new Date(event.end) : new Date(start.getTime() + DEFAULT_DURATION_MS);
  return { start: utcStamp(start), end: utcStamp(end), allDay: false };
}

function detailsText(event: CampusEvent): string {
  const moreInfo = event.url ? `More info: ${event.url}` : '';
  return [event.description, moreInfo].filter(Boolean).join('\n\n');
}

export function googleCalendarUrl(event: CampusEvent): string {
  const { start, end } = calendarSpan(event);
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${start}/${end}`,
    details: detailsText(event),
    location: event.location ?? '',
    ctz: CAMPUS_TIME_ZONE,
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}

/** Escape text for an iCalendar property value (RFC 5545 section 3.3.11). */
export function escapeIcsText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Split lines longer than 75 bytes, as RFC 5545 requires, without breaking a character. */
export function foldIcsLine(line: string): string {
  const encoder = new TextEncoder();
  const pieces: string[] = [];
  let current = '';
  let currentBytes = 0;
  for (const character of line) {
    const size = encoder.encode(character).length;
    // Continuation lines start with a space, which counts toward their 75.
    const limit = pieces.length === 0 ? 75 : 74;
    if (currentBytes + size > limit) {
      pieces.push(current);
      current = '';
      currentBytes = 0;
    }
    current += character;
    currentBytes += size;
  }
  pieces.push(current);
  return pieces.join('\r\n ');
}

function eventLines(event: CampusEvent, stamp: string): string[] {
  const { start, end, allDay } = calendarSpan(event);
  const lines = [
    'BEGIN:VEVENT',
    `UID:${event.id.replace(/[^a-zA-Z0-9:._-]/g, '')}@byu-events`,
    `DTSTAMP:${stamp}`,
    allDay ? `DTSTART;VALUE=DATE:${start}` : `DTSTART:${start}`,
    allDay ? `DTEND;VALUE=DATE:${end}` : `DTEND:${end}`,
    `SUMMARY:${escapeIcsText(event.title)}`,
  ];
  if (event.location) lines.push(`LOCATION:${escapeIcsText(event.location)}`);
  const details = detailsText(event);
  if (details) lines.push(`DESCRIPTION:${escapeIcsText(details)}`);
  if (event.url) lines.push(`URL:${event.url}`);
  lines.push('END:VEVENT');
  return lines;
}

export function toIcsCalendar(events: CampusEvent[], calendarName: string, now = new Date()): string {
  const stamp = utcStamp(now);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//byu-events//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcsText(calendarName)}`,
    `X-WR-TIMEZONE:${CAMPUS_TIME_ZONE}`,
    ...events.flatMap((event) => eventLines(event, stamp)),
    'END:VCALENDAR',
  ];
  return lines.map(foldIcsLine).join('\r\n') + '\r\n';
}
