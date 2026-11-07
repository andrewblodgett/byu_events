/**
 * Department and office websites built on Brightspot, BYU's website CMS.
 *
 * Most of them list upcoming events on a page like cs.byu.edu/events, and many
 * of those events never reach calendar.byu.edu. Every Brightspot event URL
 * ends in its date ("...-2026-11-13"). So we:
 *   1. collect dated event links from the site's listing pages,
 *   2. read each event page for its title, description, image, and the
 *      content id in its "Add to Calendar" link ("/_event.ics?e=<id>"),
 *   3. read that .ics file for exact times and location.
 * Some sites turn off "Add to Calendar"; then the times and location come
 * from the page's text instead.
 */
import { parse } from 'node-html-parser';
import { campusDateKey, campusMidnight, fromCampusWallTime } from '../../src/lib/campusTime.ts';
import type { CampusEvent } from '../../src/lib/event.ts';
import { fetchText, mapWithConcurrency } from '../http.ts';
import { parseIcs } from '../icsParser.ts';
import { isMainCalendarUrl } from '../knownSites.ts';
import { parseClockTime } from '../parseDates.ts';
import { cleanInlineText, htmlToText, nonEmpty, truncateDescription } from '../text.ts';
import {
  brightspotEventId,
  createEvent,
  hashedEventId,
  overlapsWindow,
  type CategoryId,
  type EventSource,
  type FetchWindow,
} from './types.ts';

const PAGE_CONCURRENCY = 4;

/** A BYU-hosted URL ending in -YYYY-MM-DD, optionally followed by a query or slash. */
const DATED_EVENT_LINK = /href="(https:\/\/[a-z0-9.-]+\.byu\.edu\/[^"?#]*?-(\d{4}-\d{2}-\d{2}))\/?(?:[?#][^"]*)?"/gi;
const URL_DATE = /-(\d{4}-\d{2}-\d{2})$/;
const ICS_LINK = /_event\.ics\?e=([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;
const ICS_UID_OCCURRENCE = /field_event_date\.(\d+)@/;

/**
 * Event page links on a listing page, dropping events dated before
 * `earliestDate` and main-calendar events (the calendar API covers those).
 */
export function extractEventLinks(listingHtml: string, earliestDate: string): string[] {
  const links = new Set<string>();
  for (const match of listingHtml.matchAll(DATED_EVENT_LINK)) {
    const [, url, date] = match;
    if (url && date && date >= earliestDate && !isMainCalendarUrl(url)) links.add(url);
  }
  return [...links];
}

export interface EventPageDetails {
  /** From the "Add to Calendar" link; null when the site turned that off. */
  contentId: string | null;
  title: string;
  /** "7:00 PM - 9:00 PM", "4:00 PM", or "TBD". */
  timeText: string;
  location: string | null;
  description: string;
  imageUrl: string | null;
}

/** Read an event page. Returns null for pages that aren't events. */
export function readEventPage(pageHtml: string): EventPageDetails | null {
  const root = parse(pageHtml);
  const title = nonEmpty(root.querySelector('.EventPage-headline')?.text);
  const contentId = ICS_LINK.exec(pageHtml)?.[1] ?? null;
  if (!title && !contentId) return null;

  // Many events have no body, only a one-line summary in the page's meta
  // tags. (EventPage-intro is the header block: title, date, and location.)
  const bodyText = htmlToText(root.querySelector('.EventPage-eventBody')?.innerHTML ?? '');
  const summary =
    root.querySelector('meta[property="og:description"]')?.getAttribute('content') ??
    root.querySelector('meta[name="description"]')?.getAttribute('content') ??
    '';
  return {
    contentId,
    title: cleanInlineText(title ?? ''),
    timeText: root.querySelector('.EventPage-eventDuration')?.text.trim() ?? '',
    location: nonEmpty(root.querySelector('.EventPage-eventLocation')?.text),
    description: truncateDescription(bodyText || cleanInlineText(summary)),
    imageUrl: nonEmpty(root.querySelector('meta[property="og:image"]')?.getAttribute('content')),
  };
}

/**
 * When and how long, from the date in the page's URL and its time text.
 * "7:00 - 9:00 PM" borrows PM for the start; "TBD" makes it all day.
 */
export function timesFromPage(pageUrl: string, timeText: string): { start: Date; end: Date | null; allDay: boolean } | null {
  const dateKey = URL_DATE.exec(pageUrl)?.[1];
  if (!dateKey) return null;
  const [startText = '', endText = ''] = timeText.split(/\s+[-–—]\s+|\s+to\s+/i);
  const endClock = parseClockTime(endText);
  const period = /[ap]\.?m/i.exec(endText)?.[0] ?? '';
  const startClock = parseClockTime(startText) ?? (endClock ? parseClockTime(`${startText} ${period}`) : null);
  if (!startClock) return { start: campusMidnight(dateKey), end: null, allDay: true };

  const [year, month, day] = dateKey.split('-').map(Number) as [number, number, number];
  const at = (clock: { hour: number; minute: number }) => fromCampusWallTime({ year, month, day, ...clock, second: 0 });
  const start = at(startClock);
  const end = endClock ? at(endClock) : null;
  return { start, end: end && end > start ? end : null, allDay: false };
}

export interface BrightspotSiteOptions {
  id: string;
  name: string;
  homepage: string;
  /** Pages that list the site's upcoming events. */
  listingUrls: string[];
  category: CategoryId;
  /** Shown as the host of every event; defaults to `name`. */
  organizer?: string;
  /** Drop events whose title matches, e.g. away games ("Rugby @ Utah State"). */
  skipTitles?: RegExp;
}

export function brightspotSiteSource(options: BrightspotSiteOptions): EventSource {
  const shared = (pageUrl: string, page: EventPageDetails) => ({
    description: page.description,
    url: pageUrl,
    imageUrl: page.imageUrl,
    category: options.category,
    organizer: options.organizer ?? options.name,
    sources: [options.id],
  });

  async function eventsFromIcs(pageUrl: string, page: EventPageDetails & { contentId: string }, window: FetchWindow) {
    const icsUrl = `${new URL(pageUrl).origin}/_event.ics?e=${page.contentId}`;
    return parseIcs(await fetchText(icsUrl), window).map((occurrence) =>
      createEvent({
        ...shared(pageUrl, page),
        id: brightspotEventId(page.contentId, Number(ICS_UID_OCCURRENCE.exec(occurrence.uid)?.[1] ?? 0)),
        title: occurrence.title || page.title,
        start: occurrence.start.toISOString(),
        end: occurrence.end?.toISOString() ?? null,
        allDay: occurrence.allDay,
        location: occurrence.location ?? page.location,
        description: page.description || truncateDescription(occurrence.description),
        url: occurrence.url ?? pageUrl,
      }),
    );
  }

  function eventFromPageText(pageUrl: string, page: EventPageDetails, window: FetchWindow): CampusEvent[] {
    const times = timesFromPage(pageUrl, page.timeText);
    if (!times || !overlapsWindow(times.start, times.end, window)) return [];
    return [
      createEvent({
        ...shared(pageUrl, page),
        id: hashedEventId(options.id, pageUrl),
        title: page.title,
        start: times.start.toISOString(),
        end: times.end?.toISOString() ?? null,
        allDay: times.allDay,
        location: page.location,
      }),
    ];
  }

  async function eventsFromPage(pageUrl: string, window: FetchWindow): Promise<CampusEvent[]> {
    const page = readEventPage(await fetchText(pageUrl));
    if (!page || options.skipTitles?.test(page.title)) return [];
    return page.contentId
      ? eventsFromIcs(pageUrl, { ...page, contentId: page.contentId }, window)
      : eventFromPageText(pageUrl, page, window);
  }

  return {
    id: options.id,
    name: options.name,
    homepage: options.homepage,
    async fetchEvents(window) {
      // A link's date is when the event starts. Multi-day events that started
      // up to a week ago may still be running, so keep a week of slack.
      const earliestLinkDate = campusDateKey(new Date(window.from.getTime() - 7 * 86_400_000));
      const links = new Set<string>();
      for (const listingUrl of options.listingUrls) {
        for (const link of extractEventLinks(await fetchText(listingUrl), earliestLinkDate)) links.add(link);
      }

      const perPage = await mapWithConcurrency([...links], PAGE_CONCURRENCY, async (link) => {
        try {
          return await eventsFromPage(link, window);
        } catch (error) {
          // One broken event page shouldn't sink the whole site.
          console.warn(`  [${options.id}] skipped ${link}: ${(error as Error).message}`);
          return [];
        }
      });
      return perPage.flat();
    },
  };
}
