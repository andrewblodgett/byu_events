/**
 * Any public iCalendar feed: Google Calendar, Outlook, LibCal, and so on.
 * Many departments keep their calendar in one of these instead of the CMS.
 */
import { fetchText } from '../http.ts';
import { parseIcs } from '../icsParser.ts';
import { cleanInlineText, htmlToText, nonEmpty, truncateDescription } from '../text.ts';
import { createEvent, hashedEventId, type CategoryId, type EventSource } from './types.ts';

export interface IcsFeedOptions {
  id: string;
  name: string;
  homepage: string;
  feedUrl: string;
  category: CategoryId;
  organizer?: string;
  /** Used when an event has no location of its own. */
  defaultLocation?: string;
  /** Drop events whose title matches, e.g. "Closed" entries on an hours calendar. */
  skipTitles?: RegExp;
  /**
   * Only keep events this many days out. For feeds of daily recurring
   * programs, which would otherwise add hundreds of copies of each one.
   */
  daysAhead?: number;
}

export function icsFeedSource(options: IcsFeedOptions): EventSource {
  return {
    id: options.id,
    name: options.name,
    homepage: options.homepage,
    async fetchEvents(fullWindow) {
      const window = options.daysAhead
        ? { from: fullWindow.from, to: new Date(fullWindow.from.getTime() + options.daysAhead * 86_400_000) }
        : fullWindow;
      const occurrences = parseIcs(await fetchText(options.feedUrl), window);
      return occurrences
        .filter((occurrence) => occurrence.title && !options.skipTitles?.test(occurrence.title))
        .map((occurrence) =>
          createEvent({
            // A repeating event shares one UID, so the start time tells occurrences apart.
            id: hashedEventId(options.id, occurrence.uid, occurrence.start.toISOString()),
            title: cleanInlineText(occurrence.title),
            start: occurrence.start.toISOString(),
            end: occurrence.end?.toISOString() ?? null,
            allDay: occurrence.allDay,
            location: nonEmpty(occurrence.location) ?? options.defaultLocation ?? null,
            // Google and Outlook descriptions often contain HTML.
            description: truncateDescription(htmlToText(occurrence.description)),
            url: occurrence.url,
            category: options.category,
            organizer: options.organizer ?? options.name,
            sources: [options.id],
          }),
        );
    },
  };
}
