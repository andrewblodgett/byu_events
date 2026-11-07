import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isSameEvent, titleTokens } from '../pipeline/merge.ts';
import { campusInstant, inferYear, parseClockTime } from '../pipeline/parseDates.ts';
import { readEventPage, timesFromPage } from '../pipeline/sources/brightspotSite.ts';
import { normalizeGame, type RawGame } from '../pipeline/sources/byuAthletics.ts';
import { normalizeCalendarEvent, type RawCalendarEvent } from '../pipeline/sources/byuCalendarApi.ts';
import { readScreenings, titleCase } from '../pipeline/sources/internationalCinema.ts';
import { readColloquia } from '../pipeline/sources/physicsColloquia.ts';
import { createEvent, type EventFields } from '../pipeline/sources/types.ts';

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
// Friday, November 6, 2026, 8 PM in Provo: when the fixtures were saved.
const SAVED_AT = new Date('2026-11-07T03:00:00Z');

describe('dates without a year', () => {
  it('reads clock times in several styles', () => {
    expect(parseClockTime('4 pm')).toEqual({ hour: 16, minute: 0 });
    expect(parseClockTime('5:35PM')).toEqual({ hour: 17, minute: 35 });
    expect(parseClockTime('12:25 p.m.')).toEqual({ hour: 12, minute: 25 });
    expect(parseClockTime('12:00 AM')).toEqual({ hour: 0, minute: 0 });
    expect(parseClockTime('TBD')).toBeNull();
  });

  it('picks the year closest to now', () => {
    expect(inferYear(11, 18, SAVED_AT)).toBe(2026);
    expect(inferYear(1, 8, new Date('2026-12-20T12:00:00Z'))).toBe(2027);
  });

  it('builds a Provo instant', () => {
    expect(campusInstant('Nov.', 11, '5:00PM', SAVED_AT)?.toISOString()).toBe('2026-11-12T00:00:00.000Z');
  });
});

describe('BYU Athletics', () => {
  const game = (fields: Partial<RawGame>): RawGame => ({
    id: 1,
    datetime: '2026-11-07T21:00:00.000000Z',
    datetime_end: null,
    is_all_day: false,
    tba: null,
    venue_type: 'home',
    venue: 'Marriott Center',
    opponent_name: 'Montana',
    status: 'as_scheduled',
    schedule: { sport: { name: "Women's Basketball", slug: 'womens-basketball' } },
    ...fields,
  });

  it('turns a home game into an event worded like the main calendar', () => {
    const event = normalizeGame(game({}));
    expect(event?.title).toBe("Women's Basketball vs. Montana");
    expect(event?.location).toBe('Marriott Center');
    expect(event?.url).toBe('https://byucougars.com/sports/womens-basketball/schedule');
    expect(event?.category).toBe('athletics');
  });

  it('leaves out away and neutral-site games', () => {
    expect(normalizeGame(game({ venue_type: 'away' }))).toBeNull();
    expect(normalizeGame(game({ venue_type: 'neutral' }))).toBeNull();
  });

  it('shows games with a TBA time as all day', () => {
    expect(normalizeGame(game({ tba: true }))?.allDay).toBe(true);
  });
});

describe('International Cinema', () => {
  const screenings = readScreenings(fixture('international-cinema.html'), SAVED_AT);
  const at = (title: string) => screenings.filter((s) => s.title === title).map((s) => s.start.toISOString());

  it('title-cases all-caps film titles', () => {
    expect(titleCase('THE VOICE OF HIND RAJAB')).toBe('The Voice of Hind Rajab');
  });

  it("reads this week's films with their details", () => {
    expect(at('Ikiru (1952)')).toContain('2026-11-08T00:05:00.000Z'); // Sat, Nov 7, 5:05 PM
    const ikiru = screenings.find((s) => s.title === 'Ikiru (1952)');
    expect(ikiru?.description).toContain('Directed by Akira Kurosawa');
  });

  it("reads next week's day-by-day showtimes", () => {
    expect(at('Wings (1966)')).toContain('2026-11-15T05:00:00.000Z'); // Sat, Nov 14, 10:00 PM
  });

  it('marks lectures and lists each showing once', () => {
    expect(screenings.filter((s) => s.isLecture)).toHaveLength(2);
    const keys = screenings.map((s) => `${s.title}|${s.start.toISOString()}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(screenings).toHaveLength(32);
  });
});

describe('Physics colloquia', () => {
  const talks = readColloquia(fixture('physics-colloquia.html'), SAVED_AT);

  it('reads every upcoming talk', () => {
    expect(talks.map((talk) => talk.title)).toEqual([
      'Physics Colloquium: Dennis Parker',
      'Physics Colloquium: Krzysztof Gofryk',
      'Physics Colloquium: Ed Galindo',
      'Physics Colloquium: Adam Burgasser',
    ]);
  });

  it('reads time, room, title, and affiliation', () => {
    const [parker] = talks;
    expect(parker?.start).toBe('2026-11-11T23:00:00.000Z'); // 4 PM
    expect(parker?.location).toBe('C215 ESC');
    expect(parker?.description).toMatch(/^Applications of physics in medical imaging/);
    expect(parker?.description).toContain('Dennis Parker, University of Utah');
  });
});

describe('Brightspot pages without an .ics link', () => {
  it('reads the title, time text, and location from the page', () => {
    const page = readEventPage(fixture('brightspot-event-no-ics.html'));
    expect(page?.contentId).toBeNull();
    expect(page?.title).toBe("Fall 2026 Men's Rugby @ Western Washington University");
    expect(page?.timeText).toBe('TBD');
    expect(page?.location).toBe('Bellingham, WA');
  });

  it('takes the date from the URL and the time from the page', () => {
    const url = 'https://extramuralsports.byu.edu/mens-rugby/rugby-vs-utah-state-2026-11-21';
    expect(timesFromPage(url, 'TBD')).toEqual({ start: new Date('2026-11-21T07:00:00.000Z'), end: null, allDay: true });
    const evening = timesFromPage(url, '7:00 - 9:00 PM');
    expect(evening?.start.toISOString()).toBe('2026-11-22T02:00:00.000Z');
    expect(evening?.end?.toISOString()).toBe('2026-11-22T04:00:00.000Z');
  });
});

describe('events from other sites through an API copy', () => {
  const humanitiesEvent: RawCalendarEvent = {
    EventId: 'abc',
    Title: 'English Reading Series: Jim Richards',
    StartDateTime: '2026-11-12 19:00:00',
    AllDay: 'false',
    FullUrl: 'https://hum.byu.edu/english-reading-series-jim-richards-2026-11-12',
  };
  const normalize = (raw: RawCalendarEvent) =>
    normalizeCalendarEvent(raw, { sourceId: 'gradstudies', fallbackCategory: 'other' })!;

  it("names the organizer and category from the event page's site", () => {
    const event = normalize(humanitiesEvent);
    expect(event.organizer).toBe('College of Humanities');
    expect(event.category).toBe('lectures');
  });

  it('recognizes reposted registrar dates', () => {
    const repost = { ...humanitiesEvent, Title: 'Thanksgiving- No Classes', AllDay: 'true' };
    expect(normalize(repost).category).toBe('academic');
  });
});

describe('merging one venue’s two calendars', () => {
  const event = (fields: Partial<EventFields> & Pick<EventFields, 'id' | 'title'>) =>
    createEvent({ start: '2026-11-14T18:00:00.000Z', category: 'museums', ...fields });

  it('treats plurals as the same word and ignores stray letters', () => {
    expect(titleTokens("Men's Forests")).toEqual(new Set(['men', 'forest']));
    expect(titleTokens('Glass Class')).toEqual(new Set(['glass', 'class']));
  });

  it('merges differently worded programs at the same minute and place', () => {
    const google = event({ id: 'g', title: 'Biomes at the Bean - Savannas', location: 'Monte L. Bean Life Science Museum' });
    const cms = event({ id: 'c', title: 'Biome Program: Savanna', location: 'Bean Museum' });
    expect(isSameEvent(google, cms)).toBe(true);
  });

  it('keeps them apart without a location, a shared place, or two shared words', () => {
    const google = event({ id: 'g', title: 'Biomes at the Bean - Savannas', location: 'Bean Museum' });
    expect(isSameEvent(google, event({ id: 'c', title: 'Biome Program: Savanna', location: null }))).toBe(false);
    expect(isSameEvent(google, event({ id: 'c', title: 'Biome Program: Savanna', location: '3228 WSC' }))).toBe(false);
    const workshopA = event({ id: 'a', title: 'Care Week Workshop', location: 'WSC' });
    const workshopB = event({ id: 'b', title: 'Hip Hop Workshop - Hip Hop Club', location: 'WSC' });
    expect(isSameEvent(workshopA, workshopB)).toBe(false);
  });
});
