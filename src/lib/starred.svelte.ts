/**
 * The events a viewer has starred, remembered in their browser.
 * Storage can be unavailable (private browsing, blocked cookies), in which
 * case stars still work for the visit but aren't saved.
 */
import { SvelteSet } from 'svelte/reactivity';

const STORAGE_KEY = 'byu-events:starred';

function load(): string[] {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(saved) ? saved.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

function save(ids: Iterable<string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    // Not saved; the stars still last for this visit.
  }
}

export const starred = new SvelteSet<string>(load());

export function toggleStar(id: string): boolean {
  const nowStarred = !starred.has(id);
  if (nowStarred) starred.add(id);
  else starred.delete(id);
  save(starred);
  return nowStarred;
}
