/**
 * Every place we collect events from. To add a source, add an entry here.
 *
 * Order matters: when the same event shows up in several sources, the
 * fields from the source listed first win (gaps are filled from the others).
 */
import { brightspotSiteSource } from './sources/brightspotSite.ts';
import { byuAthleticsSource } from './sources/byuAthletics.ts';
import { byuCalendarApiSource } from './sources/byuCalendarApi.ts';
import { byuClubsSource } from './sources/byuClubs.ts';
import { icsFeedSource } from './sources/icsFeed.ts';
import { internationalCinemaSource } from './sources/internationalCinema.ts';
import { physicsColloquiaSource } from './sources/physicsColloquia.ts';
import type { EventSource } from './sources/types.ts';

export const SOURCES: EventSource[] = [
  // The main campus calendar: arts, athletics, devotionals, BYUSA, academic dates.
  byuCalendarApiSource({
    id: 'byu-calendar',
    name: 'BYU Calendar',
    siteUrl: 'https://calendar.byu.edu',
  }),

  // Every home game. Listed after the main calendar, which has ticket links
  // for the games it shares with this source.
  byuAthleticsSource(),

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
  byuCalendarApiSource({
    id: 'engineering',
    name: 'College of Engineering',
    siteUrl: 'https://engineering.byu.edu',
    fallbackCategory: 'lectures',
    ownEventsOnly: true,
  }),
  byuCalendarApiSource({
    id: 'music',
    name: 'School of Music',
    siteUrl: 'https://music.byu.edu',
    fallbackCategory: 'arts',
    ownEventsOnly: true,
  }),
  byuCalendarApiSource({
    id: 'maxwell-institute',
    name: 'Maxwell Institute',
    siteUrl: 'https://mi.byu.edu',
    fallbackCategory: 'lectures',
    ownEventsOnly: true,
  }),
  byuCalendarApiSource({
    id: 'belonging',
    name: 'Office of Belonging',
    siteUrl: 'https://belonging.byu.edu',
    fallbackCategory: 'student-life',
    ownEventsOnly: true,
  }),
  // These two gather events from many department sites, including the
  // College of Humanities, Nursing, Mechanical Engineering, Exercise
  // Sciences, and the Bean Museum, whose own sites don't serve the API.
  byuCalendarApiSource({
    id: 'gradstudies',
    name: 'Graduate Studies (department calendars)',
    siteUrl: 'https://gradstudies.byu.edu',
    fallbackCategory: 'lectures',
    skipMainCalendarEvents: true,
  }),
  byuCalendarApiSource({
    id: 'lifesciences',
    name: 'College of Life Sciences (department calendars)',
    siteUrl: 'https://lifesciences.byu.edu',
    fallbackCategory: 'lectures',
    skipMainCalendarEvents: true,
  }),
  // The math department's calendar points here for ACME's own events. (APEX's
  // calendar just re-lists math.byu.edu events, which the source above covers.)
  brightspotSiteSource({
    id: 'acme',
    name: 'ACME (Applied and Computational Mathematics Emphasis)',
    homepage: 'https://acme.byu.edu/event',
    listingUrls: ['https://acme.byu.edu/event'],
    category: 'student-life',
    organizer: 'ACME',
  }),

  // Department and office sites whose events we read page by page.
  brightspotSiteSource({
    id: 'socialsciences',
    name: 'College of Family, Home & Social Sciences',
    homepage: 'https://socialsciences.byu.edu/upcoming-events',
    listingUrls: ['https://socialsciences.byu.edu/upcoming-events'],
    category: 'lectures',
  }),
  brightspotSiteSource({
    id: 'wheatley',
    name: 'Wheatley Institute',
    homepage: 'https://wheatley.byu.edu/events',
    listingUrls: ['https://wheatley.byu.edu/events'],
    category: 'lectures',
  }),
  brightspotSiteSource({
    id: 'english',
    name: 'Department of English',
    homepage: 'https://english.byu.edu/',
    listingUrls: ['https://english.byu.edu/'],
    category: 'lectures',
  }),
  brightspotSiteSource({
    id: 'geography',
    name: 'Department of Geography',
    homepage: 'https://geography.byu.edu/',
    listingUrls: ['https://geography.byu.edu/'],
    category: 'lectures',
  }),
  brightspotSiteSource({
    id: 'cfac',
    name: 'College of Fine Arts & Communications',
    homepage: 'https://cfac.byu.edu/',
    listingUrls: ['https://cfac.byu.edu/'],
    category: 'arts',
  }),
  brightspotSiteSource({
    id: 'club-sports',
    name: 'BYU Club Sports',
    homepage: 'https://extramuralsports.byu.edu/',
    listingUrls: ['https://extramuralsports.byu.edu/'],
    category: 'athletics',
    // "Men's Rugby @ Western Washington University" is an away game.
    skipTitles: /\s@\s/,
  }),
  brightspotSiteSource({
    id: 'multicultural',
    name: 'Multicultural Student Services',
    homepage: 'https://multicultural.byu.edu/',
    listingUrls: ['https://multicultural.byu.edu/'],
    category: 'student-life',
  }),
  brightspotSiteSource({
    id: 'byusa',
    name: 'BYUSA',
    homepage: 'https://byusa.byu.edu/',
    listingUrls: ['https://byusa.byu.edu/'],
    category: 'student-life',
  }),
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
    id: 'mpc',
    name: 'Museum of Peoples and Cultures',
    homepage: 'https://mpc.byu.edu/programs-and-events',
    listingUrls: ['https://mpc.byu.edu/programs-and-events'],
    category: 'museums',
  }),
  brightspotSiteSource({
    id: 'bean-museum',
    name: 'Bean Life Science Museum',
    homepage: 'https://mlbean.byu.edu/events',
    listingUrls: ['https://mlbean.byu.edu/events'],
    category: 'museums',
  }),

  // Sites with their own page layouts.
  internationalCinemaSource(),
  physicsColloquiaSource(),

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
