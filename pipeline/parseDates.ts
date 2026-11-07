/**
 * Helpers for pages that write dates the way people do: "Wed, Nov 18",
 * "Nov. 11", "4 pm", "5:35PM". Times are Provo wall time.
 */
import { fromCampusWallTime, toCampusWallTime } from '../src/lib/campusTime.ts';

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** 1-12 for "Nov", "Nov.", or "November"; null otherwise. */
export function monthNumber(name: string): number | null {
  const index = MONTHS.indexOf(name.trim().slice(0, 3).toLowerCase());
  return index === -1 ? null : index + 1;
}

/**
 * The year that puts month/day closest to `now`. Pages listing upcoming
 * events leave the year off; in December, "Jan 8" means next year.
 */
export function inferYear(month: number, day: number, now: Date): number {
  const { year } = toCampusWallTime(now);
  const distance = (candidate: number) => Math.abs(Date.UTC(candidate, month - 1, day) - now.getTime());
  return [year - 1, year, year + 1].reduce((best, candidate) => (distance(candidate) < distance(best) ? candidate : best));
}

/** Hours and minutes from "4 pm", "3:30 p.m.", or "5:35PM"; null otherwise. */
export function parseClockTime(text: string): { hour: number; minute: number } | null {
  const match = /(\d{1,2})(?::(\d{2}))?\s*([ap])\.?\s*m\.?/i.exec(text);
  if (!match) return null;
  const [, hourText, minuteText = '0', period] = match;
  const hour12 = Number(hourText) % 12;
  return { hour: period!.toLowerCase() === 'p' ? hour12 + 12 : hour12, minute: Number(minuteText) };
}

/** The instant for a month name, day, and clock time in Provo, with the year inferred. */
export function campusInstant(monthName: string, day: number, clock: string, now: Date): Date | null {
  const month = monthNumber(monthName);
  const time = parseClockTime(clock);
  if (!month || !time) return null;
  return fromCampusWallTime({ year: inferYear(month, day, now), month, day, ...time, second: 0 });
}
