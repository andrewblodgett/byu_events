/**
 * Combine events from every source into one list without duplicates.
 *
 * The same event often appears in several places: a Kennedy Center lecture is
 * on calendar.byu.edu and on kennedy.byu.edu, and Clubs Night is on the main
 * calendar and in the clubs feed. Two events are the same when they share an
 * id (Brightspot content ids match exactly across sources), when they start
 * within 15 minutes of each other and have closely matching titles, or when
 * they start at the same minute in the same place with overlapping titles.
 */
import type { CampusEvent } from '../src/lib/event.ts';

const SAME_EVENT_START_TOLERANCE_MS = 15 * 60_000;
const STOP_WORDS = new Set(['the', 'a', 'an', 'of', 'and', 'or', 'for', 'to', 'in', 'on', 'at', 'with', 'vs', 'byu']);

export function titleTokens(title: string): Set<string> {
  const words = title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // Strip accents.
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    // Single letters are mostly the "s" left over from "Men's".
    .filter((word) => word.length > 1 && !STOP_WORDS.has(word))
    // "Forests" and "Forest" are the same word. (Not "class" → "clas".)
    .map((word) => (word.length > 3 && word.endsWith('s') && !word.endsWith('ss') ? word.slice(0, -1) : word));
  return new Set(words);
}

function jaccard(a: Set<string>, b: Set<string>): number {
  const intersection = [...a].filter((word) => b.has(word)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : intersection / union;
}

function isSubset(small: Set<string>, large: Set<string>): boolean {
  return [...small].every((word) => large.has(word));
}

export function titlesMatch(a: string, b: string): boolean {
  const tokensA = titleTokens(a);
  const tokensB = titleTokens(b);
  const [smaller, larger] = tokensA.size <= tokensB.size ? [tokensA, tokensB] : [tokensB, tokensA];
  if (jaccard(tokensA, tokensB) >= 0.6) return true;
  // "Philharmonic" vs "BYU Philharmonic: Barber & Bernstein" style pairs.
  return smaller.size >= 2 && isSubset(smaller, larger);
}

const GENERIC_LOCATION_WORDS = new Set(['room', 'building', 'bldg', 'the', 'byu', 'campus', 'center', 'all', 'over']);

function locationTokens(location: string): Set<string> {
  const words = location.toLowerCase().split(/[^a-z0-9]+/);
  return new Set(words.filter((word) => word.length >= 2 && !GENERIC_LOCATION_WORDS.has(word)));
}

/**
 * Sources describe places loosely ("RB Pool" vs "RB Competition Pool"), so
 * locations are compatible unless they share nothing at all.
 */
export function locationsCompatible(a: CampusEvent, b: CampusEvent): boolean {
  if (!a.location || !b.location) return true;
  const tokensB = locationTokens(b.location);
  return [...locationTokens(a.location)].some((word) => tokensB.has(word));
}

export function isSameEvent(a: CampusEvent, b: CampusEvent): boolean {
  if (a.id === b.id) return true;
  const startGap = Math.abs(Date.parse(a.start) - Date.parse(b.start));
  if (startGap > SAME_EVENT_START_TOLERANCE_MS) return false;

  if (titlesMatch(a.title, b.title)) {
    // A one-word title like "Colloquium" could be two departments' events at
    // the same hour, so then the place has to agree too. Otherwise trust the
    // title: sources often disagree on the room.
    const shortest = Math.min(titleTokens(a.title).size, titleTokens(b.title).size);
    return shortest >= 2 || locationsCompatible(a, b);
  }

  // One venue's two calendars often word the same program differently
  // ("Biomes at the Bean - Savannas" vs "Biome Program: Savanna"). Accept
  // that only with strong evidence: the same minute, both sources naming a
  // matching place, and at least two words in common. Hiding a real event
  // is worse than showing one twice ("Care Week Workshop" and "Hip Hop
  // Workshop" share one word and stay separate).
  const tokensB = titleTokens(b.title);
  const sharedWords = [...titleTokens(a.title)].filter((word) => tokensB.has(word)).length;
  return startGap === 0 && sharedWords >= 2 && a.location !== null && b.location !== null && locationsCompatible(a, b);
}

/** Keep `primary`'s fields, filling gaps from `secondary`. */
export function combine(primary: CampusEvent, secondary: CampusEvent): CampusEvent {
  const longerDescription =
    secondary.description.length > primary.description.length ? secondary.description : primary.description;
  return {
    ...primary,
    end: primary.end ?? secondary.end,
    location: primary.location ?? secondary.location,
    description: longerDescription,
    url: primary.url ?? secondary.url,
    imageUrl: primary.imageUrl ?? secondary.imageUrl,
    category: primary.category === 'other' ? secondary.category : primary.category,
    organizer: primary.organizer ?? secondary.organizer,
    ticketed: primary.ticketed || secondary.ticketed,
    ticketUrl: primary.ticketUrl ?? secondary.ticketUrl,
    fee: primary.fee ?? secondary.fee,
    tags: [...new Set([...primary.tags, ...secondary.tags])],
    sources: [...new Set([...primary.sources, ...secondary.sources])],
  };
}

/**
 * `events` must be ordered by source preference: when two copies of an event
 * disagree, the one that comes first wins.
 */
export function mergeEvents(events: CampusEvent[]): CampusEvent[] {
  const merged: CampusEvent[] = [];
  const indexById = new Map<string, number>();
  // Kept events grouped into 15-minute slots by start time, so each event is
  // only compared with the few that start near it.
  const indexesBySlot = new Map<number, number[]>();
  const slotOf = (event: CampusEvent) => Math.floor(Date.parse(event.start) / SAME_EVENT_START_TOLERANCE_MS);

  function findMatch(event: CampusEvent): number | undefined {
    const byId = indexById.get(event.id);
    if (byId !== undefined) return byId;
    const slot = slotOf(event);
    for (const nearbySlot of [slot - 1, slot, slot + 1]) {
      for (const index of indexesBySlot.get(nearbySlot) ?? []) {
        if (isSameEvent(merged[index] as CampusEvent, event)) return index;
      }
    }
    return undefined;
  }

  for (const event of events) {
    const index = findMatch(event);
    if (index === undefined) {
      const newIndex = merged.length;
      merged.push(event);
      indexById.set(event.id, newIndex);
      const slot = slotOf(event);
      indexesBySlot.set(slot, [...(indexesBySlot.get(slot) ?? []), newIndex]);
    } else {
      // The kept copy's start time wins, so its slot stays correct.
      merged[index] = combine(merged[index] as CampusEvent, event);
      indexById.set(event.id, index);
    }
  }

  return merged.sort((a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title));
}
