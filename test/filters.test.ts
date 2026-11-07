import { describe, expect, it } from 'vitest';
import { createEvent, type EventFields } from '../pipeline/sources/types.ts';
import { DEFAULT_FILTERS, groupByDay, matchesFilters, timeSpanFor, type Filters } from '../src/lib/filters.ts';
import { formatDayHeading, formatTimeRange } from '../src/lib/format.ts';
import { filtersFromSearch, filtersToSearch } from '../src/lib/urlState.ts';

// Wednesday, November 11, 2026, 10:00 AM in Provo.
const NOW = new Date('2026-11-11T17:00:00Z');

const event = (fields: Partial<EventFields> & Pick<EventFields, 'id' | 'title' | 'start'>) =>
  createEvent({ category: 'lectures', ...fields });

const shows = (filters: Partial<Filters>, ...events: ReturnType<typeof event>[]) =>
  events.filter((candidate) => matchesFilters(candidate, { ...DEFAULT_FILTERS, ...filters }, NOW, () => false)).map((e) => e.id);

describe('timeSpanFor', () => {
  it('starts tonight at 5 PM Provo time', () => {
    const span = timeSpanFor('tonight', NOW);
    expect(span.from.toISOString()).toBe('2026-11-12T00:00:00.000Z');
    expect(span.to.toISOString()).toBe('2026-11-12T07:00:00.000Z');
  });

  it('covers Friday 5 PM through Sunday from midweek', () => {
    const span = timeSpanFor('weekend', NOW);
    expect(span.from.toISOString()).toBe('2026-11-14T00:00:00.000Z'); // Fri Nov 13, 5 PM
    expect(span.to.toISOString()).toBe('2026-11-16T07:00:00.000Z'); // Mon Nov 16, midnight
  });

  it('starts the weekend now when it is already Saturday', () => {
    const saturday = new Date('2026-11-14T18:00:00Z');
    const span = timeSpanFor('weekend', saturday);
    expect(span.from).toEqual(saturday);
    expect(span.to.toISOString()).toBe('2026-11-16T07:00:00.000Z');
  });
});

describe('matchesFilters', () => {
  const morningTalk = event({ id: 'morning', title: 'Morning Talk', start: '2026-11-11T16:00:00Z', end: '2026-11-11T16:50:00Z' });
  const noonLecture = event({ id: 'noon', title: 'Noon Lecture', start: '2026-11-11T19:00:00Z', location: 'HRCB' });
  const concert = event({ id: 'concert', title: 'Jazz Concert', start: '2026-11-12T02:30:00Z', category: 'arts', ticketed: true });
  const deadline = event({ id: 'deadline', title: 'Withdraw Deadline', start: '2026-11-11T07:00:00Z', allDay: true, category: 'academic' });
  const pizza = event({ id: 'pizza', title: 'Club Social', start: '2026-11-11T19:00:00Z', category: 'clubs', tags: ['free-food'] });
  const all = [morningTalk, noonLecture, concert, deadline, pizza];

  it('hides events that already ended and academic dates by default', () => {
    expect(shows({}, ...all)).toEqual(['noon', 'concert', 'pizza']);
  });

  it('shows academic dates when asked', () => {
    expect(shows({ showAcademic: true }, ...all)).toContain('deadline');
  });

  it('filters by time, category, tickets, and food', () => {
    expect(shows({ when: 'tonight' }, ...all)).toEqual(['concert']);
    expect(shows({ categories: ['clubs', 'arts'] }, ...all)).toEqual(['concert', 'pizza']);
    expect(shows({ noTickets: true }, ...all)).toEqual(['noon', 'pizza']);
    expect(shows({ freeFood: true }, ...all)).toEqual(['pizza']);
  });

  it('matches every search word anywhere in the event, ignoring accents and case', () => {
    expect(shows({ query: 'hrcb lecture' }, ...all)).toEqual(['noon']);
    expect(shows({ query: 'CONCÉRT' }, ...all)).toEqual(['concert']);
    expect(shows({ query: 'lecture pizza' }, ...all)).toEqual([]);
  });
});

describe('groupByDay', () => {
  it('groups by Provo date and folds same-day repeats into one row', () => {
    const groups = groupByDay(
      [
        event({ id: 'a', title: 'Creature Feature', start: '2026-11-11T18:00:00Z', location: 'Bean Museum' }),
        event({ id: 'b', title: 'Creature Feature', start: '2026-11-11T20:00:00Z', location: 'Bean Museum' }),
        event({ id: 'c', title: 'Late Show', start: '2026-11-12T05:00:00Z' }), // 10 PM on the 11th in Provo
        event({ id: 'd', title: 'Thursday Talk', start: '2026-11-12T18:00:00Z' }),
      ],
      NOW,
    );
    expect(groups.map((group) => group.dateKey)).toEqual(['2026-11-11', '2026-11-12']);
    expect(groups[0]?.rows.map((row) => row.occurrences.map((o) => o.id))).toEqual([['a', 'b'], ['c']]);
    expect(groups[0]?.eventCount).toBe(3);
  });

  it('puts events that started earlier but are still running under today', () => {
    const exhibit = event({ id: 'x', title: 'Exhibit', start: '2026-11-01T17:00:00Z', end: '2026-12-01T00:00:00Z' });
    expect(groupByDay([exhibit], NOW)[0]?.dateKey).toBe('2026-11-11');
  });
});

describe('formatting', () => {
  it('shares AM/PM in a time range when both ends have the same one', () => {
    const range = formatTimeRange(event({ id: 'a', title: 'A', start: '2026-11-12T02:30:00Z', end: '2026-11-12T04:30:00Z' }));
    expect(range.replace(/\s/g, ' ')).toBe('7:30 – 9:30 PM');
  });

  it('names today and tomorrow', () => {
    expect(formatDayHeading('2026-11-11', NOW).label).toBe('Today');
    expect(formatDayHeading('2026-11-12', NOW).label).toBe('Tomorrow');
    expect(formatDayHeading('2026-11-14', NOW).label).toBe('Saturday, November 14');
  });
});

describe('URL state', () => {
  it('round-trips filters through the query string', () => {
    const filters: Filters = { ...DEFAULT_FILTERS, query: 'jazz', when: 'weekend', categories: ['arts'], freeFood: true };
    const search = filtersToSearch(filters);
    expect(search).toBe('?q=jazz&when=weekend&cat=arts&food');
    expect(filtersFromSearch(search)).toEqual(filters);
  });

  it('ignores values it does not recognize', () => {
    expect(filtersFromSearch('?when=someday&cat=arts,nonsense')).toEqual({ ...DEFAULT_FILTERS, categories: ['arts'] });
  });
});
