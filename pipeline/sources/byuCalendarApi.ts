/**
 * The BYU Calendar API (https://calendar.byu.edu/byu-calendar-api-documentation).
 *
 * calendar.byu.edu serves the main campus calendar. Some department sites
 * (math.byu.edu, for example) serve the same API scoped to their own site,
 * which includes department events that never appear on calendar.byu.edu.
 */
import { campusDateKey, parseCampusWallTime } from '../../src/lib/campusTime.ts';
import { fetchJson } from '../http.ts';
import { isMainCalendarUrl, knownSiteFor } from '../knownSites.ts';
import { cleanInlineText, htmlToText, nonEmpty, truncateDescription } from '../text.ts';
import {
  brightspotEventId,
  createEvent,
  overlapsWindow,
  type CategoryId,
  type EventSource,
  type FetchWindow,
} from './types.ts';
import type { CampusEvent } from '../../src/lib/event.ts';

/** The fields we use from the API. Every value is a string, even booleans. */
export interface RawCalendarEvent {
  EventId: string;
  Title: string;
  StartDateTime: string;
  EndDateTime?: string;
  AllDay?: string;
  CategoryName?: string;
  DeptNames?: string;
  Description?: string;
  ShortDescription?: string;
  LocationName?: string;
  field_event_location?: string;
  FullUrl?: string;
  MoreInformationUrl?: string;
  ImgUrl?: string;
  /** " Yes" or " No", with a leading space. The only reliable price signal: IsFree and LowPrice are always "true" and "0.0". */
  TicketsExist?: string;
  TicketsUrl?: string;
  PriceDescription?: string;
}

const PAGE_SIZE = 500;
const MAX_PAGES = 10;

const CATEGORY_BY_BYU_NAME: Record<string, CategoryId> = {
  'Arts & Entertainment': 'arts',
  'School of Music': 'arts',
  'BRAVO! Events': 'arts',
  Athletics: 'athletics',
  Education: 'lectures',
  Conferences: 'lectures',
  'Major Conferences': 'lectures',
  'Devotionals & Forums': 'devotionals',
  'Student Life': 'student-life',
  'New Student Orientation': 'student-life',
  'Health & Wellness': 'wellness',
  Other: 'other',
};

/** DeptNames entries that describe how an event is listed, not who hosts it. */
const NON_ORGANIZER_DEPT_NAMES = /^(suggested\b|ticketed events$|streaming$|academic calendar$)/i;

/** Departments repost registrar dates ("Thanksgiving- No Classes") with no category. */
const ACADEMIC_DATE_TITLE =
  /no classes|withdraw deadline|add.?drop|last day of .*class|first day of .*class|final exams?|reading day|holiday|^christmas( eve| day)?$|^new year|^thanksgiving/i;

function isAcademicDate(raw: RawCalendarEvent): boolean {
  const deptNames = raw.DeptNames ?? '';
  if (/academic calendar|student financial deadlines/i.test(deptNames)) return true;
  if (raw.AllDay === 'true' && ACADEMIC_DATE_TITLE.test(raw.Title)) return true;
  // Registrar entries also come without a CategoryName. Department events
  // sometimes do too, so only count it when the page isn't a department's.
  return !raw.CategoryName && !knownSiteFor(raw.FullUrl);
}

function categoryFor(raw: RawCalendarEvent, fallback: CategoryId): CategoryId {
  if (isAcademicDate(raw)) return 'academic';
  return CATEGORY_BY_BYU_NAME[raw.CategoryName ?? ''] ?? knownSiteFor(raw.FullUrl)?.category ?? fallback;
}

function organizerFor(raw: RawCalendarEvent): string | null {
  const names = (raw.DeptNames ?? '')
    .split(',')
    .map((name) => name.trim())
    .filter((name) => name && !NON_ORGANIZER_DEPT_NAMES.test(name));
  return names[0] ?? null;
}

function urlOrNull(text: string | undefined): string | null {
  const trimmed = text?.trim();
  return trimmed && /^https?:\/\//.test(trimmed) ? trimmed : null;
}

export function normalizeCalendarEvent(
  raw: RawCalendarEvent,
  options: { sourceId: string; fallbackCategory: CategoryId; organizer?: string },
): CampusEvent | null {
  const start = parseCampusWallTime(raw.StartDateTime);
  if (!start) return null;
  const parsedEnd = raw.EndDateTime ? parseCampusWallTime(raw.EndDateTime) : null;
  const end = parsedEnd && parsedEnd > start ? parsedEnd : null;
  const ticketed = raw.TicketsExist?.trim().toLowerCase() === 'yes';

  return createEvent({
    id: brightspotEventId(raw.EventId),
    title: cleanInlineText(raw.Title),
    start: start.toISOString(),
    end: end?.toISOString() ?? null,
    allDay: raw.AllDay === 'true',
    location: nonEmpty(cleanInlineText(raw.LocationName || raw.field_event_location || '')),
    description: truncateDescription(htmlToText(raw.Description || raw.ShortDescription || '')),
    url: urlOrNull(raw.FullUrl) ?? urlOrNull(raw.MoreInformationUrl),
    imageUrl: urlOrNull(raw.ImgUrl),
    category: categoryFor(raw, options.fallbackCategory),
    // A department's DeptNames are often internal tags ("Math 191",
    // "Seminar"), so the site's own name is the better organizer.
    organizer: options.organizer ?? knownSiteFor(raw.FullUrl)?.name ?? organizerFor(raw),
    ticketed,
    ticketUrl: ticketed ? (urlOrNull(raw.TicketsUrl) ?? urlOrNull(raw.PriceDescription)) : null,
    sources: [options.sourceId],
  });
}

export interface CalendarApiOptions {
  id: string;
  name: string;
  /** Site root, e.g. "https://calendar.byu.edu". */
  siteUrl: string;
  /** Category for events whose BYU category we don't recognize. */
  fallbackCategory?: CategoryId;
  /** Use this as every event's organizer (for department sites). */
  organizer?: string;
  /**
   * Department copies of the API also return every main-calendar event.
   * Set this to keep only the events whose page is on this site.
   */
  ownEventsOnly?: boolean;
  /**
   * Some copies (Graduate Studies, Life Sciences) gather events from many
   * department sites. Set this to drop the ones the main calendar already
   * lists, so the source's event count shows what it adds.
   */
  skipMainCalendarEvents?: boolean;
}


function isOnSite(raw: RawCalendarEvent, siteUrl: string): boolean {
  try {
    return new URL(raw.FullUrl ?? '').host === new URL(siteUrl).host;
  } catch {
    return false;
  }
}

export function byuCalendarApiSource(options: CalendarApiOptions): EventSource {
  async function fetchPage(window: FetchWindow, offset: number): Promise<RawCalendarEvent[]> {
    const params = new URLSearchParams({
      categories: 'all',
      // The API ignores the date range unless both ends are given.
      'event[min][date]': campusDateKey(window.from),
      'event[max][date]': campusDateKey(window.to),
      limit: String(PAGE_SIZE),
      offset: String(offset),
    });
    return fetchJson<RawCalendarEvent[]>(`${options.siteUrl}/api/Events.json?${params}`);
  }

  return {
    id: options.id,
    name: options.name,
    homepage: options.siteUrl,
    async fetchEvents(window) {
      const raws: RawCalendarEvent[] = [];
      for (let page = 0; page < MAX_PAGES; page++) {
        const batch = await fetchPage(window, page * PAGE_SIZE);
        raws.push(...batch);
        if (batch.length < PAGE_SIZE) break;
      }
      return raws
        .filter((raw) => !options.ownEventsOnly || isOnSite(raw, options.siteUrl))
        .filter((raw) => !options.skipMainCalendarEvents || !isMainCalendarUrl(raw.FullUrl))
        .map((raw) =>
          normalizeCalendarEvent(raw, {
            sourceId: options.id,
            fallbackCategory: options.fallbackCategory ?? 'other',
            organizer: options.organizer,
          }),
        )
        .filter((event): event is CampusEvent => event !== null)
        .filter((event) =>
          overlapsWindow(new Date(event.start), event.end ? new Date(event.end) : null, window),
        );
    },
  };
}
