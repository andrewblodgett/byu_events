import { CAMPUS_TIME_ZONE, campusDateKey, campusMidnight } from './campusTime.ts';
import type { CampusEvent } from './event.ts';

const timeFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: CAMPUS_TIME_ZONE,
  hour: 'numeric',
  minute: '2-digit',
});

const dayFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: CAMPUS_TIME_ZONE,
  weekday: 'long',
  month: 'long',
  day: 'numeric',
});

/** "7:30 PM" */
export function formatTime(iso: string): string {
  return timeFormatter.format(new Date(iso));
}

/** "7:30 – 9:30 PM", "11:00 AM – 1:00 PM", "7:30 PM", or "All day". */
export function formatTimeRange(event: CampusEvent): string {
  if (event.allDay) return 'All day';
  const start = formatTime(event.start);
  if (!event.end || campusDateKey(new Date(event.end)) !== campusDateKey(new Date(event.start))) return start;
  const end = formatTime(event.end);
  // Intl puts a narrow no-break space before AM/PM, which \s matches.
  const [startClock, startPeriod] = start.split(/\s/);
  const [, endPeriod] = end.split(/\s/);
  return startPeriod === endPeriod ? `${startClock} – ${end}` : `${start} – ${end}`;
}

/** "Today", "Tomorrow", or "Saturday, November 14", plus the full date for today and tomorrow. */
export function formatDayHeading(dateKey: string, now: Date): { label: string; date: string } {
  const today = campusDateKey(now);
  const date = dayFormatter.format(campusMidnight(dateKey));
  if (dateKey === today) return { label: 'Today', date };
  if (dateKey === campusDateKey(campusMidnight(today, 1))) return { label: 'Tomorrow', date };
  return { label: date, date: '' };
}

/** "5 minutes ago", "3 hours ago", "2 days ago" */
export function formatAge(iso: string, now: Date): string {
  const minutes = Math.max(0, Math.round((now.getTime() - Date.parse(iso)) / 60_000));
  if (minutes < 60) return minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? '1 day ago' : `${days} days ago`;
}

export function formatFee(fee: number): string {
  return Number.isInteger(fee) ? `$${fee}` : `$${fee.toFixed(2)}`;
}
