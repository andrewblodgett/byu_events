/**
 * Physics & Astronomy colloquia. The department's site isn't on BYU's CMS;
 * each upcoming talk is a card like:
 *
 *   <div class="card ..." id="colloquium-1606">
 *     <h2>Wed, Nov 11 — Dennis Parker</h2>
 *     <h3>Affiliation: University of Utah · Time: 4 pm · Location: C215 ESC</h3>
 *     <h2>Talk title</h2> <p>Abstract…</p>
 */
import { parse } from 'node-html-parser';
import type { CampusEvent } from '../../src/lib/event.ts';
import { fetchText } from '../http.ts';
import { campusInstant } from '../parseDates.ts';
import { htmlToText, nonEmpty, truncateDescription } from '../text.ts';
import { createEvent, overlapsWindow, type EventSource } from './types.ts';

const PAGE_URL = 'https://physics.byu.edu/department/seminars';
const SOURCE_ID = 'physics';

/** "Wed, Nov 11 — Dennis Parker" */
const CARD_HEADING = /^[A-Za-z]{3,9},?\s+([A-Za-z]{3,9})\.?\s+(\d{1,2})\s*[—–-]+\s*(.+)$/;

function labeledValue(text: string, label: string): string | null {
  return nonEmpty(new RegExp(`${label}:\\s*([^\\n]+)`).exec(text)?.[1]);
}

export function readColloquia(html: string, now: Date): CampusEvent[] {
  const events: CampusEvent[] = [];
  for (const card of parse(html).querySelectorAll('div[id^="colloquium-"]')) {
    const heading = CARD_HEADING.exec(card.querySelector('h2')?.text.trim() ?? '');
    const details = card.querySelector('h3')?.text ?? '';
    if (!heading) continue;
    const [, month, day, speaker] = heading;
    const start = campusInstant(month!, Number(day), labeledValue(details, 'Time') ?? '', now);
    if (!start) continue;

    const body = card.querySelector('.card-body');
    const talkTitle = nonEmpty(body?.querySelector('h2')?.text);
    const abstract = htmlToText(
      (body?.innerHTML ?? '').replace(/^[\s\S]*?<\/h2>/, ''), // Everything after the talk title.
    );
    const affiliation = labeledValue(details.replace(/Affiliation:/, 'Affiliation: '), 'Affiliation');
    const image = card.querySelector('img')?.getAttribute('src');

    events.push(
      createEvent({
        id: `${SOURCE_ID}:${card.id.replace('colloquium-', '')}`,
        title: `Physics Colloquium: ${speaker!.trim()}`,
        start: start.toISOString(),
        location: labeledValue(details, 'Location')?.replace(/\s+or\s*$/, '') ?? null,
        description: truncateDescription(
          [talkTitle, affiliation && `${speaker!.trim()}, ${affiliation}`, abstract].filter(Boolean).join('\n\n'),
        ),
        url: PAGE_URL,
        imageUrl: image ? new URL(image, PAGE_URL).toString() : null,
        category: 'lectures',
        organizer: 'Physics & Astronomy',
        sources: [SOURCE_ID],
      }),
    );
  }
  return events;
}

export function physicsColloquiaSource(): EventSource {
  return {
    id: SOURCE_ID,
    name: 'Physics & Astronomy colloquia',
    homepage: PAGE_URL,
    async fetchEvents(window) {
      return readColloquia(await fetchText(PAGE_URL), new Date()).filter((event) =>
        overlapsWindow(new Date(event.start), null, window),
      );
    },
  };
}
