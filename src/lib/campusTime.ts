/**
 * Every BYU event happens in Provo, so all dates are computed in Provo's
 * time zone no matter where the viewer (or the build server) is.
 */

export const CAMPUS_TIME_ZONE = 'America/Denver';

export interface WallTime {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const partsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: CAMPUS_TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  second: 'numeric',
});

/** The clock reading on a wall in Provo at the given instant. */
export function toCampusWallTime(instant: Date): WallTime {
  const parts = Object.fromEntries(
    partsFormatter.formatToParts(instant).map((part) => [part.type, part.value]),
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

function wallTimeAsIfUtc(wall: WallTime): number {
  return Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second);
}

/** How far Provo's clock is ahead of UTC at the given instant (negative, in ms). */
function campusOffsetMs(instant: Date): number {
  const wholeSeconds = Math.floor(instant.getTime() / 1000) * 1000;
  return wallTimeAsIfUtc(toCampusWallTime(instant)) - wholeSeconds;
}

/**
 * The instant at which a Provo clock reads `wall`.
 *
 * Guess using the offset at the naive UTC reading, then correct once in case
 * the guess landed on the other side of a daylight saving change.
 */
export function fromCampusWallTime(wall: WallTime): Date {
  const naive = wallTimeAsIfUtc(wall);
  const firstGuess = naive - campusOffsetMs(new Date(naive));
  const corrected = naive - campusOffsetMs(new Date(firstGuess));
  return new Date(corrected);
}

/**
 * Parse "2026-11-07 19:30:00" (or "2026-11-07T19:30:00", or just
 * "2026-11-07") as Provo wall time. Returns null for anything else.
 */
export function parseCampusWallTime(text: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(text.trim());
  if (!match) return null;
  const [, year, month, day, hour = '0', minute = '0', second = '0'] = match;
  return fromCampusWallTime({
    year: Number(year),
    month: Number(month),
    day: Number(day),
    hour: Number(hour),
    minute: Number(minute),
    second: Number(second),
  });
}

/** "2026-11-07": the Provo calendar date of an instant. Sorts as a string. */
export function campusDateKey(instant: Date): string {
  const { year, month, day } = toCampusWallTime(instant);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Midnight in Provo at the start of the given date key, shifted by `dayOffset` days. */
export function campusMidnight(dateKey: string, dayOffset = 0): Date {
  const [year, month, day] = dateKey.split('-').map(Number) as [number, number, number];
  // Date.UTC normalizes day overflow (e.g. Nov 31 becomes Dec 1).
  const shifted = new Date(Date.UTC(year, month - 1, day + dayOffset));
  return fromCampusWallTime({
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: 0,
    minute: 0,
    second: 0,
  });
}

/** 0 = Sunday ... 6 = Saturday, for the Provo calendar date. */
export function campusWeekday(instant: Date): number {
  const { year, month, day } = toCampusWallTime(instant);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}
