/**
 * Deciding which events to show and how to group them. Everything here is a
 * pure function of the events, the filters, and the current time, so it can
 * be tested without a browser.
 */
import { campusDateKey, campusMidnight, campusWeekday, fromCampusWallTime } from './campusTime.ts';
import { categoryLabel, type CampusEvent, type CategoryId } from './event.ts';

export const WHEN_OPTIONS = [
  { id: 'all', label: 'Upcoming' },
  { id: 'today', label: 'Today' },
  { id: 'tonight', label: 'Tonight' },
  { id: 'tomorrow', label: 'Tomorrow' },
  { id: 'weekend', label: 'This weekend' },
  { id: 'week', label: 'Next 7 days' },
] as const;

export type When = (typeof WHEN_OPTIONS)[number]['id'];

export interface Filters {
  query: string;
  when: When;
  /** Empty means every category. Academic dates are controlled by `showAcademic`. */
  categories: CategoryId[];
  noTickets: boolean;
  freeFood: boolean;
  starredOnly: boolean;
  showAcademic: boolean;
}

export const DEFAULT_FILTERS: Filters = {
  query: '',
  when: 'all',
  categories: [],
  noTickets: false,
  freeFood: false,
  starredOnly: false,
  showAcademic: false,
};

/** How long we assume an event lasts when the source gives no end time. */
const ASSUMED_DURATION_MS = 60 * 60_000;

export interface TimeSpan {
  from: Date;
  to: Date;
}

function atCampusHour(dateKey: string, hour: number): Date {
  const [year, month, day] = dateKey.split('-').map(Number) as [number, number, number];
  return fromCampusWallTime({ year, month, day, hour, minute: 0, second: 0 });
}

/** The span of time a "when" option covers, in Provo time. */
export function timeSpanFor(when: When, now: Date): TimeSpan {
  const today = campusDateKey(now);
  const tomorrowMidnight = campusMidnight(today, 1);
  switch (when) {
    case 'today':
      return { from: now, to: tomorrowMidnight };
    case 'tonight':
      return { from: new Date(Math.max(now.getTime(), atCampusHour(today, 17).getTime())), to: tomorrowMidnight };
    case 'tomorrow':
      return { from: tomorrowMidnight, to: campusMidnight(today, 2) };
    case 'weekend': {
      // Friday 5 PM through Sunday night. On the weekend itself, from now.
      const weekday = campusWeekday(now);
      const daysUntilFriday = (5 - weekday + 7) % 7;
      const isWeekend = weekday === 0 || weekday === 6;
      const fridayEvening = atCampusHour(campusDateKey(campusMidnight(today, daysUntilFriday)), 17);
      const daysUntilMonday = (8 - weekday) % 7 || 7;
      const from = isWeekend ? now : new Date(Math.max(now.getTime(), fridayEvening.getTime()));
      return { from, to: campusMidnight(today, daysUntilMonday) };
    }
    case 'week':
      return { from: now, to: new Date(now.getTime() + 7 * 86_400_000) };
    case 'all':
      return { from: now, to: new Date(8.64e15) };
  }
}

export function effectiveEnd(event: CampusEvent): Date {
  if (event.end) return new Date(event.end);
  const start = new Date(event.start);
  // All-day events with no end last until midnight.
  return event.allDay ? campusMidnight(campusDateKey(start), 1) : new Date(start.getTime() + ASSUMED_DURATION_MS);
}

function overlaps(event: CampusEvent, span: TimeSpan): boolean {
  return new Date(event.start) < span.to && effectiveEnd(event) > span.from;
}

function normalizeForSearch(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

export function searchText(event: CampusEvent): string {
  return normalizeForSearch(
    [event.title, event.description, event.location, event.organizer, categoryLabel(event.category)].join('\n'),
  );
}

/** Every word in the query must appear somewhere in the event. */
export function matchesQuery(event: CampusEvent, query: string): boolean {
  const words = normalizeForSearch(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = searchText(event);
  return words.every((word) => haystack.includes(word));
}

export function matchesFilters(
  event: CampusEvent,
  filters: Filters,
  now: Date,
  isStarred: (id: string) => boolean,
): boolean {
  if (!overlaps(event, timeSpanFor(filters.when, now))) return false;
  if (event.category === 'academic') {
    if (!filters.showAcademic) return false;
  } else if (filters.categories.length > 0 && !filters.categories.includes(event.category)) {
    return false;
  }
  if (filters.noTickets && (event.ticketed || event.fee !== null)) return false;
  if (filters.freeFood && !event.tags.includes('free-food')) return false;
  if (filters.starredOnly && !isStarred(event.id)) return false;
  return matchesQuery(event, filters.query);
}

/** One row in the list: an event, or several showings of it on the same day. */
export interface EventRow {
  key: string;
  occurrences: CampusEvent[];
}

export interface DayGroup {
  dateKey: string;
  rows: EventRow[];
  eventCount: number;
}

function repeatKey(event: CampusEvent): string {
  return `${event.title.toLowerCase()}|${(event.location ?? '').toLowerCase()}`;
}

/**
 * Group events by the Provo date they fall on. An event that started before
 * `now` and is still going shows up under today. Showings of the same event
 * at the same place on the same day (a museum show at 11, 1, and 3) share a
 * row.
 */
export function groupByDay(events: CampusEvent[], now: Date): DayGroup[] {
  const sorted = [...events].sort(
    (a, b) => Number(b.allDay) - Number(a.allDay) || a.start.localeCompare(b.start) || a.title.localeCompare(b.title),
  );
  const groups = new Map<string, Map<string, EventRow>>();
  for (const event of sorted) {
    const shownAt = new Date(Math.max(new Date(event.start).getTime(), now.getTime()));
    const dateKey = campusDateKey(shownAt);
    const rows = groups.get(dateKey) ?? new Map<string, EventRow>();
    groups.set(dateKey, rows);
    const key = repeatKey(event);
    const row = rows.get(key);
    if (row) row.occurrences.push(event);
    else rows.set(key, { key: `${dateKey}|${event.id}`, occurrences: [event] });
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dateKey, rows]) => ({
      dateKey,
      rows: [...rows.values()],
      eventCount: [...rows.values()].reduce((total, row) => total + row.occurrences.length, 0),
    }));
}

/** True when the event has already started but hasn't ended. */
export function isHappeningNow(event: CampusEvent, now: Date): boolean {
  return new Date(event.start) <= now && effectiveEnd(event) > now && !event.allDay;
}

