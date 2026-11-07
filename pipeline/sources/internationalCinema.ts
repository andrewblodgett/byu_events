/**
 * International Cinema (ic.byu.edu) screens films on campus several times a
 * week. Its homepage is the only place with exact showtimes, in two formats:
 *
 *   PLAYING THIS WEEK                     Next Week's Showtimes
 *   IKIRU (1952)                          Thursday,
 *   Directed by Akira Kurosawa            Nov. 12
 *   Japanese, 143 min.                    Wings (1966, Russian)
 *   <description>                         5:00PM
 *   Thursday, Nov. 5 — 5:00PM
 *
 * We read the page as lines of text and walk through it, remembering the
 * current film (first format) or the current day (second format).
 */
import { parse } from 'node-html-parser';
import type { CampusEvent } from '../../src/lib/event.ts';
import { fetchText } from '../http.ts';
import { campusInstant } from '../parseDates.ts';
import { createEvent, hashedEventId, overlapsWindow, type EventSource } from './types.ts';

const HOMEPAGE = 'https://ic.byu.edu/';
const SOURCE_ID = 'international-cinema';
const LOCATION = '250 KMBL';

/** "IKIRU (1952)" or "THE VOICE OF HIND RAJAB (2025)*" */
const FILM_HEADING = /^([^a-z]+?)\s*\((\d{4})\)\*?$/;
/** "Thursday, Nov. 5 — 5:00PM" or "Wednesday, Nov. 4th—5:00PM Lecture" */
const SHOWTIME = /^[A-Za-z]+day,?\s+([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?\s*[—–-]+\s*(\d{1,2}:\d{2}\s*[AP]M)(\s*Lecture)?/i;
/** "Nov. 12", the second line of a next-week day heading. */
const MONTH_DAY = /^([A-Za-z]{3,9})\.?\s+(\d{1,2})$/;
/** "Wings (1966, Russian)" */
const FILM_LISTING = /^(.+?)\s*\((\d{4}),\s*([^)]+)\)$/;
const CLOCK = /^\d{1,2}:\d{2}\s*[AP]M$/i;

export interface Screening {
  title: string;
  start: Date;
  description: string;
  isLecture: boolean;
}

const SMALL_WORDS = new Set(['a', 'an', 'and', 'as', 'at', 'by', 'for', 'in', 'of', 'on', 'or', 'the', 'to']);

/** "THE VOICE OF HIND RAJAB" becomes "The Voice of Hind Rajab". */
export function titleCase(allCaps: string): string {
  return allCaps
    .toLowerCase()
    .split(' ')
    .map((word, index) => (index > 0 && SMALL_WORDS.has(word) ? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(' ');
}

function pageLines(html: string): string[] {
  const text = parse(html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|h\d)>/gi, '\n')).text;
  return text
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

export function readScreenings(html: string, now: Date): Screening[] {
  const screenings: Screening[] = [];
  // State for the "playing this week" format.
  let film: { title: string; details: string[] } | null = null;
  // State for the "next week" format.
  let day: { month: string; day: number } | null = null;
  let pendingTitle: string | null = null;
  let pendingIsLecture = false;
  let lastLine = '';

  for (const line of pageLines(html)) {
    const heading = FILM_HEADING.exec(line);
    const showtime = SHOWTIME.exec(line);
    const monthDay = /day,$/i.test(lastLine) ? MONTH_DAY.exec(line) : null;
    const listing = FILM_LISTING.exec(line);

    if (heading) {
      film = { title: `${titleCase(heading[1]!)} (${heading[2]})`, details: [] };
      day = null;
    } else if (showtime && film) {
      const [, month, date, clock, lecture] = showtime;
      const start = campusInstant(month!, Number(date), clock!, now);
      const isLecture = Boolean(lecture);
      if (start) {
        screenings.push({
          title: isLecture ? `Lecture before ${film.title}` : film.title,
          start,
          description: film.details.join('\n'),
          isLecture,
        });
      }
    } else if (monthDay) {
      day = { month: monthDay[1]!, day: Number(monthDay[2]) };
      film = null;
    } else if (day && line === 'Lecture') {
      pendingIsLecture = true;
      pendingTitle = null;
    } else if (day && pendingIsLecture && !pendingTitle) {
      pendingTitle = `Lecture: ${line.replace(/^["“]|["”]$/g, '')}`;
    } else if (day && listing) {
      pendingTitle = `${listing[1]} (${listing[2]})`;
      pendingIsLecture = false;
    } else if (day && pendingTitle && CLOCK.test(line)) {
      const start = campusInstant(day.month, day.day, line, now);
      if (start) screenings.push({ title: pendingTitle, start, description: '', isLecture: pendingIsLecture });
      pendingTitle = null;
      pendingIsLecture = false;
    } else if (film && film.details.length < 6 && !/^-+$/.test(line)) {
      film.details.push(line);
    }
    lastLine = line;
  }
  // The page repeats its schedule for its desktop and mobile layouts.
  const unique = new Map(screenings.map((screening) => [`${screening.title}|${screening.start.toISOString()}`, screening]));
  return [...unique.values()];
}

export function internationalCinemaSource(): EventSource {
  return {
    id: SOURCE_ID,
    name: 'International Cinema',
    homepage: HOMEPAGE,
    async fetchEvents(window) {
      const screenings = readScreenings(await fetchText(HOMEPAGE), new Date());
      return screenings
        .filter((screening) => overlapsWindow(screening.start, null, window))
        .map(
          (screening): CampusEvent =>
            createEvent({
              id: hashedEventId(SOURCE_ID, screening.title, screening.start.toISOString()),
              title: screening.title,
              start: screening.start.toISOString(),
              location: LOCATION,
              description: screening.description,
              url: HOMEPAGE,
              category: screening.isLecture ? 'lectures' : 'arts',
              organizer: 'International Cinema',
              sources: [SOURCE_ID],
            }),
        );
    },
  };
}
