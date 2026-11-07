import { createHash } from 'node:crypto';
import type { CampusEvent, CategoryId } from '../../src/lib/event.ts';

/** The span of time the pipeline collects events for. */
export interface FetchWindow {
  from: Date;
  to: Date;
}

/** One place events come from, such as a website, an API, or a calendar feed. */
export interface EventSource {
  id: string;
  name: string;
  homepage: string;
  fetchEvents(window: FetchWindow): Promise<CampusEvent[]>;
}

/** Fields every source must provide; the rest have sensible defaults. */
export type EventFields = Pick<CampusEvent, 'id' | 'title' | 'start' | 'category'> &
  Partial<Omit<CampusEvent, 'id' | 'title' | 'start' | 'category'>>;

export function createEvent(fields: EventFields): CampusEvent {
  return {
    end: null,
    allDay: false,
    location: null,
    description: '',
    url: null,
    imageUrl: null,
    organizer: null,
    ticketed: false,
    ticketUrl: null,
    fee: null,
    tags: [],
    sources: [],
    ...fields,
  };
}

/**
 * Brightspot (BYU's website CMS) gives every event a content id, and the same
 * id shows up in the calendar API and in each event page's .ics file. Using it
 * as our id lets the merge step match the same event across sources exactly.
 */
export function brightspotEventId(contentId: string, occurrence = 0): string {
  return occurrence === 0 ? `bs:${contentId}` : `bs:${contentId}:${occurrence}`;
}

/** For sources without their own ids: a short hash of what makes the event unique. */
export function hashedEventId(sourceId: string, ...parts: string[]): string {
  const digest = createHash('sha1').update(parts.join('|')).digest('hex').slice(0, 12);
  return `${sourceId}:${digest}`;
}

export function overlapsWindow(start: Date, end: Date | null, window: FetchWindow): boolean {
  return (end ?? start) >= window.from && start <= window.to;
}

export type { CategoryId };
