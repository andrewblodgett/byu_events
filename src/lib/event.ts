/**
 * The shape of one event, shared by the data pipeline (which writes
 * events.json) and the web page (which reads it).
 */

export const CATEGORIES = [
  { id: 'arts', label: 'Arts & Performances' },
  { id: 'athletics', label: 'Athletics' },
  { id: 'lectures', label: 'Lectures & Seminars' },
  { id: 'devotionals', label: 'Devotionals & Forums' },
  { id: 'student-life', label: 'Student Life' },
  { id: 'clubs', label: 'Clubs' },
  { id: 'museums', label: 'Museums & Exhibits' },
  { id: 'wellness', label: 'Health & Wellness' },
  { id: 'academic', label: 'Academic Dates' },
  { id: 'other', label: 'Other' },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]['id'];

export function categoryLabel(id: CategoryId): string {
  return CATEGORIES.find((category) => category.id === id)?.label ?? 'Other';
}

/** Tags the pipeline derives from an event's text. */
export type DerivedTag = 'free-food';

export interface CampusEvent {
  /** Stable across pipeline runs, so starred events survive rebuilds. */
  id: string;
  title: string;
  /** UTC ISO 8601 instant. For all-day events, midnight in Provo. */
  start: string;
  /** UTC ISO 8601 instant, or null when the source gives no end time. */
  end: string | null;
  allDay: boolean;
  location: string | null;
  /** Plain text, no HTML. */
  description: string;
  /** Page with more information about the event. */
  url: string | null;
  imageUrl: string | null;
  category: CategoryId;
  /** Department, club, or office hosting the event, when known. */
  organizer: string | null;
  /** True when the source says the event needs tickets. */
  ticketed: boolean;
  ticketUrl: string | null;
  /** Admission fee in dollars, when the source states one. */
  fee: number | null;
  tags: DerivedTag[];
  /** Ids of every source this event was found in. */
  sources: string[];
}

export type SourceStatus = 'ok' | 'failed' | 'stale';

export interface SourceReport {
  id: string;
  name: string;
  homepage: string;
  /** ok: fetched this run. stale: fetch failed, reused last run's events. failed: nothing available. */
  status: SourceStatus;
  eventCount: number;
  error?: string;
}

/** The whole events.json file. */
export interface EventsFile {
  generatedAt: string;
  sources: SourceReport[];
  events: CampusEvent[];
}
