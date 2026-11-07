import { describe, expect, it } from 'vitest';
import { isSameEvent, mergeEvents, titlesMatch } from '../pipeline/merge.ts';
import { createEvent, type EventFields } from '../pipeline/sources/types.ts';
import { deriveTags } from '../pipeline/tags.ts';

const event = (fields: Partial<EventFields> & Pick<EventFields, 'id' | 'title'>) =>
  createEvent({ start: '2026-11-11T02:00:00.000Z', category: 'other', ...fields });

describe('titlesMatch', () => {
  it('ignores punctuation, case, and filler words', () => {
    expect(titlesMatch('Clubs Night', 'Clubs Night!')).toBe(true);
    expect(titlesMatch('Biannual BYU Water Polo Charity Game', 'Biannual Water Polo Charity Game - Water Polo Club')).toBe(true);
  });

  it('does not match events that only share a common word', () => {
    expect(titlesMatch('Care Week Workshop', 'Hip Hop Workshop - Hip Hop Club')).toBe(false);
    expect(titlesMatch('Weekly Seminar - Eric Zeng', 'Weekly Seminar - Jane Doe')).toBe(false);
  });
});

describe('isSameEvent', () => {
  it('matches by id regardless of anything else', () => {
    expect(isSameEvent(event({ id: 'bs:1', title: 'A' }), event({ id: 'bs:1', title: 'B' }))).toBe(true);
  });

  it('trusts a strong title match even when the rooms disagree', () => {
    const a = event({ id: 'x', title: 'Ask Me Anything about Foreign Service', location: '257 HRCB' });
    const b = event({ id: 'y', title: 'Ask Me Anything about Foreign Service', location: '238 HRCB' });
    expect(isSameEvent(a, b)).toBe(true);
  });

  it('requires the same place for one-word titles', () => {
    const cs = event({ id: 'x', title: 'Colloquium', location: '1170 TMCB' });
    const physics = event({ id: 'y', title: 'Colloquium', location: 'C215 ESC' });
    expect(isSameEvent(cs, physics)).toBe(false);
  });

  it('keeps events apart when they start more than 15 minutes apart', () => {
    const matinee = event({ id: 'x', title: 'Robyn Hood', start: '2026-11-07T21:00:00.000Z' });
    const evening = event({ id: 'y', title: 'Robyn Hood', start: '2026-11-08T02:30:00.000Z' });
    expect(isSameEvent(matinee, evening)).toBe(false);
  });
});

describe('mergeEvents', () => {
  it('keeps the first source and fills its gaps from later ones', () => {
    const fromCalendar = event({ id: 'bs:1', title: 'Clubs Night', location: 'WSC', sources: ['byu-calendar'] });
    const fromClubs = event({
      id: 'byu-clubs:abc',
      title: 'Clubs Night!',
      description: 'Every Tuesday in the WSC.',
      organizer: 'BYUSA Clubs',
      sources: ['byu-clubs'],
    });
    const [merged, ...rest] = mergeEvents([fromCalendar, fromClubs]);
    expect(rest).toEqual([]);
    expect(merged?.title).toBe('Clubs Night');
    expect(merged?.location).toBe('WSC');
    expect(merged?.description).toBe('Every Tuesday in the WSC.');
    expect(merged?.sources).toEqual(['byu-calendar', 'byu-clubs']);
  });

  it('sorts by start time', () => {
    const later = event({ id: 'a', title: 'Later', start: '2026-11-12T00:00:00.000Z' });
    const sooner = event({ id: 'b', title: 'Sooner', start: '2026-11-10T00:00:00.000Z' });
    expect(mergeEvents([later, sooner]).map((merged) => merged.title)).toEqual(['Sooner', 'Later']);
  });
});

describe('deriveTags', () => {
  it('spots free food', () => {
    expect(deriveTags(event({ id: 'a', title: 'Study Night', description: 'Pizza provided!' }))).toEqual(['free-food']);
    expect(deriveTags(event({ id: 'b', title: 'CSA Snack & Study' }))).toEqual(['free-food']);
  });

  it('skips ticketed events and events without food', () => {
    expect(deriveTags(event({ id: 'a', title: 'Gala', description: 'Refreshments', ticketed: true }))).toEqual([]);
    expect(deriveTags(event({ id: 'b', title: 'Lecture on Pizarro' }))).toEqual([]);
  });
});
