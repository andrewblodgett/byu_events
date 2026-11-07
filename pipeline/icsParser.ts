/**
 * Read events out of an iCalendar (.ics) file, expanding repeating events
 * into one occurrence each within the fetch window.
 */
import ICAL from 'ical.js';
import { fromCampusWallTime } from '../src/lib/campusTime.ts';
import type { FetchWindow } from './sources/types.ts';

export interface IcsOccurrence {
  uid: string;
  title: string;
  start: Date;
  end: Date | null;
  allDay: boolean;
  location: string | null;
  description: string;
  url: string | null;
}

/** Stops runaway expansion of e.g. a daily event that started years ago. */
const MAX_ITERATIONS_PER_SERIES = 20_000;

function toInstant(time: ICAL.Time): Date {
  // ical.js reads a time it can't place (all-day dates, times with no zone,
  // or a TZID the file never defines) as the computer's local time. The
  // build server runs on UTC, so read those as Provo wall time instead.
  const unplaced = time.isDate || time.zone === ICAL.Timezone.localTimezone;
  if (unplaced) {
    const hour = time.isDate ? 0 : time.hour;
    const minute = time.isDate ? 0 : time.minute;
    const second = time.isDate ? 0 : time.second;
    return fromCampusWallTime({ year: time.year, month: time.month, day: time.day, hour, minute, second });
  }
  return time.toJSDate();
}

function textProperty(event: ICAL.Event, name: string): string | null {
  const value = event.component.getFirstPropertyValue(name);
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function isCancelled(event: ICAL.Event): boolean {
  return textProperty(event, 'status')?.toUpperCase() === 'CANCELLED';
}

function toOccurrence(event: ICAL.Event, startTime: ICAL.Time, endTime: ICAL.Time | null): IcsOccurrence {
  const start = toInstant(startTime);
  const end = endTime ? toInstant(endTime) : null;
  return {
    uid: event.uid,
    title: event.summary?.trim() ?? '',
    start,
    end: end && end > start ? end : null,
    allDay: startTime.isDate,
    location: event.location?.trim() || null,
    description: event.description?.trim() ?? '',
    url: textProperty(event, 'url'),
  };
}

function* expandOccurrences(event: ICAL.Event, window: FetchWindow): Generator<IcsOccurrence> {
  if (!event.isRecurring()) {
    if (!isCancelled(event)) yield toOccurrence(event, event.startDate, event.endDate ?? null);
    return;
  }
  const iterator = event.iterator();
  for (let i = 0; i < MAX_ITERATIONS_PER_SERIES; i++) {
    const next = iterator.next();
    if (!next) return;
    const details = event.getOccurrenceDetails(next);
    const occurrenceStart = toInstant(details.startDate);
    if (occurrenceStart > window.to) return;
    if (occurrenceStart < window.from && toInstant(details.endDate) < window.from) continue;
    // details.item is the exception event when this occurrence was edited.
    if (isCancelled(details.item)) continue;
    yield toOccurrence(details.item, details.startDate, details.endDate);
  }
}

export function parseIcs(icsText: string, window: FetchWindow): IcsOccurrence[] {
  const calendar = new ICAL.Component(ICAL.parse(icsText));

  for (const timezone of calendar.getAllSubcomponents('vtimezone')) {
    ICAL.TimezoneService.register(timezone);
  }

  const events = calendar.getAllSubcomponents('vevent').map((component) => new ICAL.Event(component));
  const seriesByUid = new Map(events.filter((event) => !event.isRecurrenceException()).map((event) => [event.uid, event]));
  for (const exception of events.filter((event) => event.isRecurrenceException())) {
    seriesByUid.get(exception.uid)?.relateException(exception);
  }

  const occurrences: IcsOccurrence[] = [];
  for (const event of events) {
    if (event.isRecurrenceException()) continue; // Reached through its series.
    for (const occurrence of expandOccurrences(event, window)) {
      const endsAfterWindowStart = (occurrence.end ?? occurrence.start) >= window.from;
      if (endsAfterWindowStart && occurrence.start <= window.to) occurrences.push(occurrence);
    }
  }
  return occurrences;
}
