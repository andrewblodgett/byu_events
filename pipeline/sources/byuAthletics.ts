/**
 * BYU Athletics home games from byucougars.com's schedule API, the same one
 * its "All Sports Schedule" page uses. calendar.byu.edu lists only some home
 * games; this lists every scheduled one. Away and neutral-site games aren't
 * on campus, so they're left out.
 */
import type { CampusEvent } from '../../src/lib/event.ts';
import { fetchJson } from '../http.ts';
import { createEvent, overlapsWindow, type EventSource } from './types.ts';

const API_URL = 'https://byucougars.com/website-api/schedule-events';
const PAGE_SIZE = 100;
const MAX_PAGES = 20;

export interface RawGame {
  id: number;
  /** UTC, e.g. "2026-11-07T21:00:00.000000Z". */
  datetime: string;
  datetime_end: string | null;
  is_all_day: boolean;
  /** True when the time hasn't been set yet. */
  tba: boolean | null;
  venue_type: 'home' | 'away' | 'neutral';
  venue: string | null;
  opponent_name: string | null;
  status: string;
  schedule?: { sport?: { name: string; slug: string } };
}

interface Page {
  data: RawGame[];
  meta: { last_page: number };
}

export function normalizeGame(raw: RawGame): CampusEvent | null {
  const sport = raw.schedule?.sport;
  if (raw.venue_type !== 'home' || !sport || /cancel|postpone/i.test(raw.status)) return null;
  const start = new Date(raw.datetime);
  if (Number.isNaN(start.getTime())) return null;
  const end = raw.datetime_end ? new Date(raw.datetime_end) : null;

  return createEvent({
    id: `byu-athletics:${raw.id}`,
    // Same wording as calendar.byu.edu, so the two copies of a game merge.
    title: raw.opponent_name ? `${sport.name} vs. ${raw.opponent_name}` : sport.name,
    start: start.toISOString(),
    end: end && end > start ? end.toISOString() : null,
    // A game whose time is still TBA shows as all day on its date.
    allDay: raw.is_all_day || raw.tba === true,
    location: raw.venue,
    url: `https://byucougars.com/sports/${sport.slug}/schedule`,
    category: 'athletics',
    organizer: 'BYU Athletics',
    sources: ['byu-athletics'],
  });
}

export function byuAthleticsSource(): EventSource {
  return {
    id: 'byu-athletics',
    name: 'BYU Athletics',
    homepage: 'https://byucougars.com/all-sports-schedule',
    async fetchEvents(window) {
      const games: RawGame[] = [];
      for (let page = 1; page <= MAX_PAGES; page++) {
        const params = new URLSearchParams({
          'filter[upcoming]': 'true',
          sort: 'datetime',
          include: 'schedule.sport',
          per_page: String(PAGE_SIZE),
          page: String(page),
        });
        const response = await fetchJson<Page>(`${API_URL}?${params}`);
        games.push(...response.data);
        if (page >= response.meta.last_page) break;
      }
      return games
        .map(normalizeGame)
        .filter((event): event is CampusEvent => event !== null)
        .filter((event) => overlapsWindow(new Date(event.start), event.end ? new Date(event.end) : null, window));
    },
  };
}
