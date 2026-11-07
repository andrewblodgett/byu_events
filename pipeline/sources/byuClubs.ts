/**
 * BYUSA club events from clubs.byu.edu, which serves them as XML at /rest/events.
 */
import { XMLParser } from 'fast-xml-parser';
import type { CampusEvent } from '../../src/lib/event.ts';
import { fetchText } from '../http.ts';
import { cleanInlineText, htmlToText, nonEmpty, truncateDescription } from '../text.ts';
import { createEvent, hashedEventId, overlapsWindow, type EventSource } from './types.ts';

const FEED_URL = 'https://clubs.byu.edu/rest/events';
const SOURCE_ID = 'byu-clubs';

export interface RawClubEvent {
  Title?: string;
  Description?: string;
  /** UTC, e.g. "2026-11-11T02:00:00.000Z". */
  StartDateTime?: string;
  EndDateTime?: string;
  Location?: string;
  HasFee?: string;
  Fee?: string;
  /** Empty for BYUSA-wide events, otherwise <Club><Name>...</Name></Club>. */
  Club?: string | { Name?: string };
}

export function parseClubsXml(xml: string): RawClubEvent[] {
  const parser = new XMLParser({
    parseTagValue: false, // Keep every value a string, e.g. Fee "5".
    isArray: (tagName) => tagName === 'Event',
  });
  const document = parser.parse(xml) as { Events?: { Event?: RawClubEvent[] } };
  return document.Events?.Event ?? [];
}

export function normalizeClubEvent(raw: RawClubEvent): CampusEvent | null {
  const title = cleanInlineText(raw.Title ?? '');
  const start = raw.StartDateTime ? new Date(raw.StartDateTime) : null;
  if (!title || !start || Number.isNaN(start.getTime())) return null;
  const end = raw.EndDateTime ? new Date(raw.EndDateTime) : null;
  const fee = raw.HasFee === 'true' ? Number(raw.Fee) : NaN;

  return createEvent({
    id: hashedEventId(SOURCE_ID, title, start.toISOString(), raw.Location ?? ''),
    title,
    start: start.toISOString(),
    end: end && end > start ? end.toISOString() : null,
    location: nonEmpty(cleanInlineText(raw.Location ?? '')),
    description: truncateDescription(htmlToText(raw.Description ?? '')),
    category: 'clubs',
    organizer: nonEmpty(typeof raw.Club === 'object' ? raw.Club.Name : raw.Club) ?? 'BYUSA Clubs',
    fee: Number.isFinite(fee) && fee > 0 ? fee : null,
    sources: [SOURCE_ID],
  });
}

export function byuClubsSource(): EventSource {
  return {
    id: SOURCE_ID,
    name: 'BYUSA Clubs',
    homepage: 'https://clubs.byu.edu/',
    async fetchEvents(window) {
      return parseClubsXml(await fetchText(FEED_URL))
        .map(normalizeClubEvent)
        .filter((event): event is CampusEvent => event !== null)
        .filter((event) => overlapsWindow(new Date(event.start), event.end ? new Date(event.end) : null, window));
    },
  };
}
