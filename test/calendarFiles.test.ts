import { describe, expect, it } from 'vitest';
import { createEvent } from '../pipeline/sources/types.ts';
import { escapeIcsText, foldIcsLine, googleCalendarUrl, toIcsCalendar } from '../src/lib/calendarFiles.ts';

const lecture = createEvent({
  id: 'bs:000001a1-b29d',
  title: 'Weekly Seminar, with Q&A',
  start: '2026-11-13T18:00:00.000Z',
  end: '2026-11-13T19:00:00.000Z',
  location: '1170 TMCB',
  description: 'Line one\nLine two',
  url: 'https://cs.byu.edu/weekly-seminar',
  category: 'lectures',
});

const examDay = createEvent({
  id: 'bs:exam',
  title: 'Final Exam Day',
  start: '2026-12-14T07:00:00.000Z',
  end: '2026-12-15T06:59:59.000Z',
  allDay: true,
  category: 'academic',
});

describe('googleCalendarUrl', () => {
  it('uses UTC stamps for timed events', () => {
    const params = new URL(googleCalendarUrl(lecture)).searchParams;
    expect(params.get('dates')).toBe('20261113T180000Z/20261113T190000Z');
    expect(params.get('details')).toContain('More info: https://cs.byu.edu/weekly-seminar');
  });

  it('uses dates with an exclusive end for all-day events', () => {
    const params = new URL(googleCalendarUrl(examDay)).searchParams;
    expect(params.get('dates')).toBe('20261214/20261215');
  });

  it('assumes an hour when there is no end time', () => {
    const params = new URL(googleCalendarUrl({ ...lecture, end: null })).searchParams;
    expect(params.get('dates')).toBe('20261113T180000Z/20261113T190000Z');
  });
});

describe('iCalendar output', () => {
  it('escapes special characters', () => {
    expect(escapeIcsText('a, b; c\\d\ne')).toBe('a\\, b\\; c\\\\d\\ne');
  });

  it('folds long lines at 75 bytes without splitting characters', () => {
    const folded = foldIcsLine(`SUMMARY:${'é'.repeat(60)}`);
    for (const line of folded.split('\r\n')) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    }
    expect(folded.replace(/\r\n /g, '')).toBe(`SUMMARY:${'é'.repeat(60)}`);
  });

  it('writes a complete calendar', () => {
    const ics = toIcsCalendar([lecture, examDay], 'Test', new Date('2026-11-07T00:00:00Z'));
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics).toContain('SUMMARY:Weekly Seminar\\, with Q&A');
    expect(ics).toContain('DTSTART:20261113T180000Z');
    expect(ics).toContain('DTSTART;VALUE=DATE:20261214');
    expect(ics).toContain('DTEND;VALUE=DATE:20261215');
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });
});
