import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseIcs } from '../pipeline/icsParser.ts';
import { extractEventLinks, readEventPage } from '../pipeline/sources/brightspotSite.ts';
import { normalizeCalendarEvent, type RawCalendarEvent } from '../pipeline/sources/byuCalendarApi.ts';
import { normalizeClubEvent, parseClubsXml } from '../pipeline/sources/byuClubs.ts';

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

describe('BYU Calendar API', () => {
  const raws = JSON.parse(fixture('calendar-api.json')) as RawCalendarEvent[];
  const normalize = (title: string) => {
    const raw = raws.find((candidate) => candidate.Title.startsWith(title));
    return normalizeCalendarEvent(raw!, { sourceId: 'byu-calendar', fallbackCategory: 'other' })!;
  };

  it('converts Provo wall times and strips HTML from descriptions', () => {
    const event = normalize('Fall Freeze');
    expect(event.id).toBe('bs:000001a1-a822-d7b5-a5ed-bf6ab8190001');
    expect(event.start).toBe('2026-11-07T03:00:00.000Z');
    expect(event.end).toBe('2026-11-07T07:00:00.000Z');
    expect(event.category).toBe('student-life');
    expect(event.description).not.toMatch(/<br>/);
    expect(event.description).toContain('Shuttles will be provided');
  });

  it('uses TicketsExist for tickets, since IsFree is always "true"', () => {
    const game = normalize("Women's Basketball");
    expect(game.ticketed).toBe(true);
    expect(game.ticketUrl).toMatch(/^https:\/\//);
    expect(game.category).toBe('athletics');
  });

  it('files registrar entries without a category as academic dates', () => {
    const exam = normalize('Final Exam Day');
    expect(exam.category).toBe('academic');
    expect(exam.allDay).toBe(true);
    expect(exam.url).toBe('https://academiccalendar.byu.edu/final-exam-day-2026-12-14');
  });

  it('takes the organizer from DeptNames', () => {
    expect(normalize('Ask Me Anything').organizer).toBe('Kennedy Center for Intl Studies');
  });
});

describe('BYU Clubs feed', () => {
  const events = parseClubsXml(fixture('clubs.xml')).map(normalizeClubEvent);

  it('reads the nested club name as the organizer', () => {
    expect(events[0]?.title).toBe('Harvest Hop');
    expect(events[0]?.organizer).toBe('Vintage Swing Dance Club');
    expect(events[0]?.category).toBe('clubs');
  });

  it('keeps fees as numbers', () => {
    const paid = events.find((event) => event?.fee !== null);
    expect(paid?.fee).toBeGreaterThan(0);
  });

  it('keeps UTC start times as given', () => {
    const clubsNight = events.find((event) => event?.title === 'Clubs Night!');
    expect(clubsNight?.start).toBe('2026-11-11T02:00:00.000Z');
  });
});

describe('Brightspot department sites', () => {
  it('finds dated event links and drops old ones', () => {
    const links = extractEventLinks(fixture('brightspot-listing.html'), '2026-11-01');
    expect(links).toEqual([
      'https://cs.byu.edu/2026-skillathon-2026-11-07',
      'https://cs.byu.edu/weekly-seminar-eric-zeng-2026-11-13',
    ]);
  });

  it("reads an event page's content id, description, and image", () => {
    const page = readEventPage(fixture('brightspot-event.html'));
    expect(page?.contentId).toBe('000001a1-b29d-d47b-a1ad-fabdab490000');
    expect(page?.description).toMatch(/^Abstract\n/);
    expect(page?.imageUrl).toMatch(/^https:\/\/brightspotcdn\.byu\.edu\//);
  });

  it('returns null for pages that are not events', () => {
    expect(readEventPage('<html><body>Not an event</body></html>')).toBeNull();
  });
});

describe('iCalendar parsing', () => {
  const november = { from: new Date('2026-11-01T06:00:00Z'), to: new Date('2026-12-31T07:00:00Z') };

  it('reads a time zone the file never defines as Provo time', () => {
    const [seminar] = parseIcs(fixture('brightspot-event.ics'), november);
    expect(seminar?.title).toBe('Weekly Seminar - Eric Zeng');
    expect(seminar?.start.toISOString()).toBe('2026-11-13T18:00:00.000Z');
    expect(seminar?.location).toBe('1170 TMCB');
  });

  it('expands repeats, skips excluded and cancelled dates, and applies edits', () => {
    const occurrences = parseIcs(fixture('recurring.ics'), november);
    const shows = occurrences.filter((occurrence) => occurrence.uid === 'creature-feature@google.com');
    expect(shows.map((show) => show.start.toISOString())).toEqual([
      '2026-11-02T18:00:00.000Z',
      '2026-11-04T18:00:00.000Z',
      '2026-11-09T21:00:00.000Z', // Moved to 2 PM and renamed.
      '2026-11-16T18:00:00.000Z',
      '2026-11-18T18:00:00.000Z',
    ]);
    expect(shows[2]?.title).toBe('Creature Feature - Polar Bear');
    expect(occurrences.some((occurrence) => occurrence.title === 'Cancelled Talk')).toBe(false);
  });

  it('places all-day events at midnight in Provo', () => {
    const holiday = parseIcs(fixture('recurring.ics'), november).find((occurrence) => occurrence.allDay);
    expect(holiday?.start.toISOString()).toBe('2026-11-26T07:00:00.000Z');
  });

  it('leaves out events outside the window', () => {
    const december = { from: new Date('2026-12-01T07:00:00Z'), to: new Date('2026-12-31T07:00:00Z') };
    expect(parseIcs(fixture('recurring.ics'), december)).toEqual([]);
  });
});
