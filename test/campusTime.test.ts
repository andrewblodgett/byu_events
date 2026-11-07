import { describe, expect, it } from 'vitest';
import {
  campusDateKey,
  campusMidnight,
  campusWeekday,
  parseCampusWallTime,
} from '../src/lib/campusTime.ts';

describe('parseCampusWallTime', () => {
  it('reads winter times as MST (UTC-7)', () => {
    expect(parseCampusWallTime('2026-11-07 19:30:00')?.toISOString()).toBe('2026-11-08T02:30:00.000Z');
  });

  it('reads summer times as MDT (UTC-6)', () => {
    expect(parseCampusWallTime('2026-07-04 21:00:00')?.toISOString()).toBe('2026-07-05T03:00:00.000Z');
  });

  it('handles the day daylight saving ends', () => {
    // Nov 1, 2026: clocks fall back at 2 AM. Noon that day is already MST.
    expect(parseCampusWallTime('2026-11-01 12:00:00')?.toISOString()).toBe('2026-11-01T19:00:00.000Z');
  });

  it('accepts a T separator and a bare date', () => {
    expect(parseCampusWallTime('2026-11-07T08:00')?.toISOString()).toBe('2026-11-07T15:00:00.000Z');
    expect(parseCampusWallTime('2026-11-24')?.toISOString()).toBe('2026-11-24T07:00:00.000Z');
  });

  it('rejects anything else', () => {
    expect(parseCampusWallTime('11-07-2026')).toBeNull();
    expect(parseCampusWallTime('')).toBeNull();
  });
});

describe('campus dates', () => {
  it("uses Provo's date, not UTC's", () => {
    // 7 PM in Provo is already the next day in UTC.
    expect(campusDateKey(new Date('2026-11-08T02:00:00Z'))).toBe('2026-11-07');
  });

  it('finds midnight with an optional day offset across month ends', () => {
    expect(campusMidnight('2026-11-07').toISOString()).toBe('2026-11-07T07:00:00.000Z');
    expect(campusMidnight('2026-11-30', 1).toISOString()).toBe('2026-12-01T07:00:00.000Z');
  });

  it('gives the weekday in Provo', () => {
    expect(campusWeekday(new Date('2026-11-08T02:00:00Z'))).toBe(6); // Saturday night in Provo
  });
});
