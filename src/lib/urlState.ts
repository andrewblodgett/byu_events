/**
 * Filters live in the URL so a filtered view can be bookmarked or shared,
 * e.g. ?when=weekend&cat=athletics,arts&notickets
 */
import { CATEGORIES, type CategoryId } from './event.ts';
import { DEFAULT_FILTERS, WHEN_OPTIONS, type Filters, type When } from './filters.ts';

const FLAG_PARAMS = {
  noTickets: 'notickets',
  freeFood: 'food',
  starredOnly: 'starred',
  showAcademic: 'academic',
} as const satisfies Partial<Record<keyof Filters, string>>;

function isWhen(value: string | null): value is When {
  return WHEN_OPTIONS.some((option) => option.id === value);
}

function isCategory(value: string): value is CategoryId {
  return CATEGORIES.some((category) => category.id === value);
}

export function filtersFromSearch(search: string): Filters {
  const params = new URLSearchParams(search);
  const when = params.get('when');
  const filters: Filters = {
    ...DEFAULT_FILTERS,
    query: params.get('q') ?? '',
    when: isWhen(when) ? when : DEFAULT_FILTERS.when,
    categories: (params.get('cat') ?? '').split(',').filter(isCategory),
  };
  for (const [key, param] of Object.entries(FLAG_PARAMS) as [keyof typeof FLAG_PARAMS, string][]) {
    filters[key] = params.has(param);
  }
  return filters;
}

export function filtersToSearch(filters: Filters): string {
  const params = new URLSearchParams();
  if (filters.query.trim()) params.set('q', filters.query.trim());
  if (filters.when !== DEFAULT_FILTERS.when) params.set('when', filters.when);
  if (filters.categories.length > 0) params.set('cat', filters.categories.join(','));
  for (const [key, param] of Object.entries(FLAG_PARAMS) as [keyof typeof FLAG_PARAMS, string][]) {
    if (filters[key]) params.set(param, '');
  }
  // URLSearchParams writes "notickets=", which reads fine but looks odd.
  const search = params.toString().replace(/=(?=&|$)/g, '');
  return search ? `?${search}` : '';
}
