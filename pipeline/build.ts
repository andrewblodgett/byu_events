/**
 * Collect events from every source and write public/data/:
 *   events.json         everything the web page needs
 *   feeds/all.ics       a subscribable calendar of every event
 *   feeds/<category>.ics one per category
 *
 * Run with `npm run fetch-events`.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { campusDateKey, campusMidnight } from '../src/lib/campusTime.ts';
import { toIcsCalendar } from '../src/lib/calendarFiles.ts';
import { CATEGORIES, type CampusEvent, type EventsFile, type SourceReport } from '../src/lib/event.ts';
import { fetchJson } from './http.ts';
import { mergeEvents } from './merge.ts';
import { SOURCES } from './sources.config.ts';
import type { EventSource, FetchWindow } from './sources/types.ts';
import { deriveTags } from './tags.ts';

const OUTPUT_DIR = 'public/data';
const DAYS_AHEAD = 365;
/** Museum calendars list their closures; those are hours, not events. */
const CLOSURE_TITLE = /^(museum )?closed\b|\bclosure$/i;
/** The live site's data, used to fill in for any source that fails this run. */
const PREVIOUS_DATA_URL = 'https://andrewblodgett.github.io/byu_events/data/events.json';

async function loadPreviousEvents(): Promise<CampusEvent[]> {
  try {
    return (await fetchJson<EventsFile>(PREVIOUS_DATA_URL)).events;
  } catch (error) {
    console.warn(`No previous data to fall back on (${(error as Error).message})`);
    return [];
  }
}

interface SourceResult {
  report: SourceReport;
  events: CampusEvent[];
}

async function runSource(source: EventSource, window: FetchWindow, previous: CampusEvent[]): Promise<SourceResult> {
  const startedAt = Date.now();
  const base = { id: source.id, name: source.name, homepage: source.homepage };
  try {
    const events = await source.fetchEvents(window);
    console.log(`✓ ${source.id}: ${events.length} events (${((Date.now() - startedAt) / 1000).toFixed(1)}s)`);
    return { report: { ...base, status: 'ok', eventCount: events.length }, events };
  } catch (error) {
    const message = (error as Error).message;
    const stillUpcoming = (event: CampusEvent) => new Date(event.end ?? event.start) >= window.from;
    const stale = previous.filter((event) => event.sources.includes(source.id) && stillUpcoming(event));
    console.error(`✗ ${source.id}: ${message}. Reusing ${stale.length} events from the last run.`);
    return {
      report: { ...base, status: stale.length > 0 ? 'stale' : 'failed', eventCount: stale.length, error: message },
      events: stale,
    };
  }
}

async function writeOutputs(file: EventsFile): Promise<void> {
  await mkdir(`${OUTPUT_DIR}/feeds`, { recursive: true });
  await writeFile(`${OUTPUT_DIR}/events.json`, JSON.stringify(file));
  await writeFile(`${OUTPUT_DIR}/feeds/all.ics`, toIcsCalendar(file.events, 'BYU Campus Events'));
  for (const category of CATEGORIES) {
    const events = file.events.filter((event) => event.category === category.id);
    await writeFile(`${OUTPUT_DIR}/feeds/${category.id}.ics`, toIcsCalendar(events, `BYU ${category.label}`));
  }
}

async function main(): Promise<void> {
  const today = campusDateKey(new Date());
  const window: FetchWindow = { from: campusMidnight(today), to: campusMidnight(today, DAYS_AHEAD) };
  const previous = await loadPreviousEvents();

  // Sources are independent, so fetch them all at once. Promise.all keeps
  // their configured order, which the merge step relies on.
  const results = await Promise.all(SOURCES.map((source) => runSource(source, window, previous)));

  const events = mergeEvents(results.flatMap((result) => result.events))
    .filter((event) => !CLOSURE_TITLE.test(event.title))
    .map((event) => ({ ...event, tags: deriveTags(event) }));
  const file: EventsFile = {
    generatedAt: new Date().toISOString(),
    sources: results.map((result) => result.report),
    events,
  };
  await writeOutputs(file);

  const found = results.reduce((total, result) => total + result.events.length, 0);
  console.log(`\n${events.length} events after merging ${found} from ${SOURCES.length} sources.`);

  if (results.every((result) => result.report.status === 'failed')) {
    // Don't let a total outage replace the live site with an empty one.
    console.error('Every source failed.');
    process.exitCode = 1;
  }
}

await main();
