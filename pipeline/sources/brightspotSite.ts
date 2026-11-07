/**
 * Department and office websites built on Brightspot, BYU's website CMS.
 *
 * Most of them list upcoming events on a page like cs.byu.edu/events, and many
 * of those events never reach calendar.byu.edu. Every Brightspot event URL
 * ends in its date ("...-2026-11-13"), and every event page links an .ics
 * file ("/_event.ics?e=<content id>"). So we:
 *   1. collect dated event links from the site's listing pages,
 *   2. read each event page for its content id, description, and image,
 *   3. read the event's .ics file for exact times and location.
 */
import { parse } from 'node-html-parser';
import { campusDateKey } from '../../src/lib/campusTime.ts';
import type { CampusEvent } from '../../src/lib/event.ts';
import { fetchText, mapWithConcurrency } from '../http.ts';
import { parseIcs } from '../icsParser.ts';
import { cleanInlineText, htmlToText, nonEmpty, truncateDescription } from '../text.ts';
import { brightspotEventId, createEvent, type CategoryId, type EventSource, type FetchWindow } from './types.ts';

const PAGE_CONCURRENCY = 4;

/** A BYU-hosted URL ending in -YYYY-MM-DD, optionally followed by a query or slash. */
const DATED_EVENT_LINK = /href="(https:\/\/[a-z0-9.-]+\.byu\.edu\/[^"?#]*?-(\d{4}-\d{2}-\d{2}))\/?(?:[?#][^"]*)?"/gi;
const ICS_LINK = /_event\.ics\?e=([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;
const ICS_UID_OCCURRENCE = /field_event_date\.(\d+)@/;

/** Event page links on a listing page, dropping events dated before `earliestDate`. */
export function extractEventLinks(listingHtml: string, earliestDate: string): string[] {
  const links = new Set<string>();
  for (const match of listingHtml.matchAll(DATED_EVENT_LINK)) {
    const [, url, date] = match;
    if (url && date && date >= earliestDate) links.add(url);
  }
  return [...links];
}

export interface EventPageDetails {
  contentId: string;
  description: string;
  imageUrl: string | null;
}

export function readEventPage(pageHtml: string): EventPageDetails | null {
  const contentId = ICS_LINK.exec(pageHtml)?.[1];
  if (!contentId) return null;
  const root = parse(pageHtml);
  // Many events have no body, only a one-line summary in the page's meta
  // tags. (EventPage-intro is the header block: title, date, and location.)
  const bodyText = htmlToText(root.querySelector('.EventPage-eventBody')?.innerHTML ?? '');
  const summary =
    root.querySelector('meta[property="og:description"]')?.getAttribute('content') ??
    root.querySelector('meta[name="description"]')?.getAttribute('content') ??
    '';
  return {
    contentId,
    description: truncateDescription(bodyText || cleanInlineText(summary)),
    imageUrl: nonEmpty(root.querySelector('meta[property="og:image"]')?.getAttribute('content')),
  };
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
}

export function brightspotSiteSource(options: BrightspotSiteOptions): EventSource {
  async function eventsFromPage(pageUrl: string, window: FetchWindow): Promise<CampusEvent[]> {
    const page = readEventPage(await fetchText(pageUrl));
    if (!page) return [];
    const icsUrl = `${new URL(pageUrl).origin}/_event.ics?e=${page.contentId}`;
    const occurrences = parseIcs(await fetchText(icsUrl), window);

    return occurrences.map((occurrence) => {
      const occurrenceIndex = Number(ICS_UID_OCCURRENCE.exec(occurrence.uid)?.[1] ?? 0);
      return createEvent({
        id: brightspotEventId(page.contentId, occurrenceIndex),
        title: occurrence.title,
        start: occurrence.start.toISOString(),
        end: occurrence.end?.toISOString() ?? null,
        allDay: occurrence.allDay,
        location: occurrence.location,
        description: page.description || truncateDescription(occurrence.description),
        url: occurrence.url ?? pageUrl,
        imageUrl: page.imageUrl,
        category: options.category,
        organizer: options.organizer ?? options.name,
        sources: [options.id],
      });
    });
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
