import type { CampusEvent, DerivedTag } from '../src/lib/event.ts';

const FREE_FOOD = new RegExp(
  [
    'refreshments',
    'pizza',
    'snacks?',
    'treats',
    'donuts?',
    'doughnuts?',
    'cookies',
    'ice cream',
    'free (food|lunch|dinner|breakfast|drinks)',
    '(food|lunch|dinner|breakfast) (will be )?(provided|served)',
  ].join('|'),
  'i',
);

export function deriveTags(event: CampusEvent): DerivedTag[] {
  const tags: DerivedTag[] = [];
  // Ticketed shows usually mean concessions, not free food.
  if (!event.ticketed && FREE_FOOD.test(`${event.title}\n${event.description}`)) tags.push('free-food');
  return tags;
}
