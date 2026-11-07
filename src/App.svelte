<script lang="ts">
  import { onMount } from 'svelte';
  import EventCard from './components/EventCard.svelte';
  import FilterBar from './components/FilterBar.svelte';
  import SiteFooter from './components/SiteFooter.svelte';
  import { track } from './lib/analytics.ts';
  import type { EventsFile } from './lib/event.ts';
  import { groupByDay, matchesFilters, type DayGroup, type Filters } from './lib/filters.ts';
  import { formatDayHeading } from './lib/format.ts';
  import { starred } from './lib/starred.svelte.ts';
  import { filtersFromSearch, filtersToSearch } from './lib/urlState.ts';

  /** How many events to draw at first; "Show more" adds this many again. */
  const PAGE_SIZE = 120;

  let data = $state<EventsFile | null>(null);
  let loadError = $state(false);
  let filters = $state<Filters>(filtersFromSearch(location.search));
  let now = $state(new Date());
  let shownCount = $state(PAGE_SIZE);

  const matching = $derived(
    data ? data.events.filter((event) => matchesFilters(event, filters, now, (id) => starred.has(id))) : [],
  );
  const groups = $derived(groupByDay(matching, now));
  const visibleGroups = $derived(takeEvents(groups, shownCount));

  /** The first day groups holding about `limit` events, never splitting a day. */
  function takeEvents(all: DayGroup[], limit: number): DayGroup[] {
    const taken: DayGroup[] = [];
    let total = 0;
    for (const group of all) {
      if (total >= limit) break;
      taken.push(group);
      total += group.eventCount;
    }
    return taken;
  }

  async function loadEvents() {
    loadError = false;
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}data/events.json`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      data = (await response.json()) as EventsFile;
    } catch {
      loadError = true;
    }
  }

  onMount(() => {
    loadEvents();
    // Keep "Happening now" and past events current if the tab stays open.
    const clock = setInterval(() => (now = new Date()), 60_000);
    return () => clearInterval(clock);
  });

  // Mirror the filters into the URL, and start the list over when they change.
  let lastSearch = filtersToSearch(filtersFromSearch(location.search));
  $effect(() => {
    const search = filtersToSearch(filters);
    if (search === lastSearch) return;
    lastSearch = search;
    history.replaceState(null, '', `${location.pathname}${search}`);
    shownCount = PAGE_SIZE;
  });

  // Count which filters get used (never the search text), once they settle.
  let trackTimer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    const summary = filtersToSearch({ ...filters, query: '' }).slice(1); // e.g. "when=tonight&food"
    clearTimeout(trackTimer);
    if (summary) trackTimer = setTimeout(() => track(`filter/${summary}`), 2000);
  });
</script>

<header class="site-header">
  <div class="wrap">
    <h1>BYU Events</h1>
    <p>Everything happening on campus, in one place.</p>
  </div>
</header>

<FilterBar bind:filters />

<main class="wrap">
  {#if loadError}
    <div class="notice" role="alert">
      <p>We couldn't load events. Check your connection and try again.</p>
      <button type="button" class="chip" onclick={loadEvents}>Try again</button>
    </div>
  {:else if !data}
    <p class="notice" aria-busy="true">Loading events…</p>
  {:else}
    <p class="result-count" aria-live="polite">
      {matching.length.toLocaleString()} event{matching.length === 1 ? '' : 's'}
    </p>

    {#if matching.length === 0}
      <div class="notice">
        <p>No events match these filters.</p>
        {#if filters.starredOnly && starred.size === 0}
          <p>Tap ☆ on an event to save it here.</p>
        {/if}
      </div>
    {/if}

    {#each visibleGroups as group (group.dateKey)}
      {@const heading = formatDayHeading(group.dateKey, now)}
      <section class="day" aria-labelledby={`day-${group.dateKey}`}>
        <h2 id={`day-${group.dateKey}`}>
          {heading.label}
          {#if heading.date}<span class="day-date">{heading.date}</span>{/if}
        </h2>
        <div class="day-events">
          {#each group.rows as row (row.key)}
            <EventCard {row} {now} />
          {/each}
        </div>
      </section>
    {/each}

    {#if visibleGroups.length < groups.length}
      <button type="button" class="chip show-more" onclick={() => (shownCount += PAGE_SIZE)}>Show more</button>
    {/if}
  {/if}
</main>

<SiteFooter {data} {now} />

<style>
  .site-header {
    padding: 14px 0 12px;
    background: var(--header-bg);
    color: var(--header-text);
  }

  .site-header h1 {
    margin: 0;
    font-size: 22px;
    letter-spacing: -0.01em;
  }

  .site-header p {
    margin: 0;
    font-size: 14px;
    opacity: 0.85;
  }

  .result-count {
    margin: 16px 0 0;
    color: var(--text-muted);
    font-size: 14px;
  }

  .notice {
    margin: 24px 0;
    padding: 16px;
    border-radius: var(--radius);
    background: var(--surface);
    border: 1px solid var(--border);
  }

  .notice p {
    margin: 0 0 8px;
  }

  .day h2 {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0 10px;
    margin: 24px 0 10px;
    font-size: 18px;
  }

  .day-date {
    color: var(--text-muted);
    font-size: 14px;
    font-weight: 500;
  }

  .day-events {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .show-more {
    display: flex;
    margin: 24px auto 0;
  }
</style>
