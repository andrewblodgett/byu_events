/**
 * Every place we collect events from. To add a source, add an entry here.
 *
 * Order matters: when the same event shows up in several sources, the
 * fields from the source listed first win (gaps are filled from the others).
 */
import { brightspotSiteSource } from './sources/brightspotSite.ts';
import { byuCalendarApiSource } from './sources/byuCalendarApi.ts';
import { byuClubsSource } from './sources/byuClubs.ts';
import { icsFeedSource } from './sources/icsFeed.ts';
import type { EventSource } from './sources/types.ts';

export const SOURCES: EventSource[] = [
  // The main campus calendar: arts, athletics, devotionals, BYUSA, academic dates.
  byuCalendarApiSource({
    id: 'byu-calendar',
    name: 'BYU Calendar',
    siteUrl: 'https://calendar.byu.edu',
  }),

  byuClubsSource(),

  // Department sites that serve their own copy of the calendar API,
  // including events that don't appear on calendar.byu.edu.
  byuCalendarApiSource({
    id: 'math',
    name: 'Department of Mathematics',
    siteUrl: 'https://math.byu.edu',
    fallbackCategory: 'lectures',
    organizer: 'Department of Mathematics',
    ownEventsOnly: true,
  }),

  // Department and office sites whose events we read page by page.
  brightspotSiteSource({
    id: 'sclcenter-clubs',
    name: 'Student Connection & Leadership Center',
    homepage: 'https://sclcenter.byu.edu/clubs-events',
    listingUrls: ['https://sclcenter.byu.edu/clubs-events'],
    category: 'clubs',
    organizer: 'BYUSA Clubs',
  }),
  brightspotSiteSource({
    id: 'cs',
    name: 'Computer Science',
    homepage: 'https://cs.byu.edu/events',
    listingUrls: ['https://cs.byu.edu/events'],
    category: 'lectures',
  }),
  brightspotSiteSource({
    id: 'kennedy',
    name: 'Kennedy Center for International Studies',
    homepage: 'https://kennedy.byu.edu/calendar',
    listingUrls: ['https://kennedy.byu.edu/calendar'],
    category: 'lectures',
  }),
  brightspotSiteSource({
    id: 'mmbio',
    name: 'Microbiology & Molecular Biology',
    homepage: 'https://mmbio.byu.edu/calendar',
    listingUrls: ['https://mmbio.byu.edu/calendar'],
    category: 'lectures',
  }),
  brightspotSiteSource({
    id: 'humanities',
    name: 'College of Humanities',
    homepage: 'https://hum.byu.edu/events',
    listingUrls: ['https://hum.byu.edu/events'],
    category: 'lectures',
  }),
  brightspotSiteSource({
    id: 'family-history',
    name: 'Family History Library',
    homepage: 'https://familyhistory.lib.byu.edu/events',
    listingUrls: ['https://familyhistory.lib.byu.edu/events'],
    category: 'lectures',
  }),
  brightspotSiteSource({
    id: 'moa',
    name: 'BYU Museum of Art',
    homepage: 'https://moa.byu.edu/events/',
    listingUrls: ['https://moa.byu.edu/events/'],
    category: 'museums',
  }),
  brightspotSiteSource({
    id: 'bean-museum',
    name: 'Bean Life Science Museum',
    homepage: 'https://mlbean.byu.edu/events',
    listingUrls: ['https://mlbean.byu.edu/events'],
    category: 'museums',
  }),

  // Departments that keep a Google or Outlook calendar instead.
  icsFeedSource({
    id: 'bean-museum-programs',
    name: 'Bean Life Science Museum programs',
    homepage: 'https://mlbean.byu.edu/events',
    feedUrl:
      'https://calendar.google.com/calendar/ical/l62o3mrd2e1172ojb04ebcfhgc%40group.calendar.google.com/public/basic.ics',
    category: 'museums',
    organizer: 'Bean Life Science Museum',
    defaultLocation: 'Monte L. Bean Life Science Museum',
    // Its shows repeat several times a day all year.
    daysAhead: 60,
  }),
  icsFeedSource({
    id: 'ece',
    name: 'Electrical & Computer Engineering',
    homepage: 'https://ece.byu.edu/schedule-of-events',
    feedUrl:
      'https://outlook.office365.com/owa/calendar/a3e0f18708ff4147888db4e15f9bf045@byu.edu/5c669c3dec7b43f4b4501530b96369703597652552248665359/calendar.ics',
    category: 'lectures',
  }),
];
