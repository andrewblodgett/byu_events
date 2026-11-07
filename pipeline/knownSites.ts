/**
 * Names and default categories for BYU websites whose events reach us through
 * another site's copy of the calendar API (Graduate Studies' API, for
 * example, carries the College of Humanities' events). Their events often
 * have no organizer and an unhelpful category such as "Events", so we fall
 * back on what we know about the site the event's page lives on.
 */
import type { CategoryId } from '../src/lib/event.ts';

interface KnownSite {
  name: string;
  category: CategoryId;
}

const KNOWN_SITES: Record<string, KnownSite> = {
  'acme.byu.edu': { name: 'ACME', category: 'student-life' },
  'belonging.byu.edu': { name: 'Office of Belonging', category: 'student-life' },
  'byusa.byu.edu': { name: 'BYUSA', category: 'student-life' },
  'cell.byu.edu': { name: 'Cell Biology & Physiology', category: 'lectures' },
  'engineering.byu.edu': { name: 'College of Engineering', category: 'lectures' },
  'exsc.byu.edu': { name: 'Exercise Sciences', category: 'lectures' },
  'gradstudies.byu.edu': { name: 'Graduate Studies', category: 'lectures' },
  'hum.byu.edu': { name: 'College of Humanities', category: 'lectures' },
  'lifesciences.byu.edu': { name: 'College of Life Sciences', category: 'lectures' },
  'lsm.byu.edu': { name: 'Bean Life Science Museum', category: 'museums' },
  'math.byu.edu': { name: 'Department of Mathematics', category: 'lectures' },
  'mi.byu.edu': { name: 'Maxwell Institute', category: 'lectures' },
  'music.byu.edu': { name: 'School of Music', category: 'arts' },
  'nursing.byu.edu': { name: 'College of Nursing', category: 'lectures' },
  'science.byu.edu': { name: 'College of Computational, Mathematical & Physical Sciences', category: 'lectures' },
  'www.me.byu.edu': { name: 'Mechanical Engineering', category: 'lectures' },
};

export function knownSiteFor(url: string | null | undefined): KnownSite | null {
  try {
    return KNOWN_SITES[new URL(url ?? '').host] ?? null;
  } catch {
    return null;
  }
}

/** Sites whose events all appear in calendar.byu.edu's own feed. */
const MAIN_CALENDAR_HOSTS = new Set(['calendar.byu.edu', 'academiccalendar.byu.edu', 'onstage.byu.edu']);

export function isMainCalendarUrl(url: string | null | undefined): boolean {
  try {
    return MAIN_CALENDAR_HOSTS.has(new URL(url ?? '').host);
  } catch {
    return false;
  }
}
