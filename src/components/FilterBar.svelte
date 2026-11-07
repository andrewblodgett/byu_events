<script lang="ts">
  import { CATEGORIES, type CategoryId } from '../lib/event.ts';
  import { DEFAULT_FILTERS, WHEN_OPTIONS, type Filters } from '../lib/filters.ts';

  let { filters = $bindable() }: { filters: Filters } = $props();

  // Academic dates have their own toggle below instead of a category chip.
  const categoryChips = CATEGORIES.filter((category) => category.id !== 'academic');

  const toggles = [
    { key: 'noTickets', label: 'No tickets needed' },
    { key: 'freeFood', label: 'Free food' },
    { key: 'starredOnly', label: '★ Starred' },
    { key: 'showAcademic', label: 'Academic dates' },
  ] as const;

  const isDefault = $derived(JSON.stringify(filters) === JSON.stringify(DEFAULT_FILTERS));

  function toggleCategory(id: CategoryId) {
    filters.categories = filters.categories.includes(id)
      ? filters.categories.filter((category) => category !== id)
      : [...filters.categories, id];
  }

  function reset() {
    filters = { ...DEFAULT_FILTERS, categories: [] };
  }
</script>

<!-- Two siblings so only the first (search and "when") stays pinned while scrolling. -->
<div class="filter-bar pinned">
  <div class="wrap">
    <label class="search">
      <span class="visually-hidden">Search events</span>
      <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18">
        <path
          fill="currentColor"
          d="M10 2a8 8 0 0 1 6.32 12.9l5.39 5.39-1.42 1.42-5.39-5.39A8 8 0 1 1 10 2Zm0 2a6 6 0 1 0 0 12 6 6 0 0 0 0-12Z"
        />
      </svg>
      <input type="search" placeholder="Search events, places, clubs…" bind:value={filters.query} />
    </label>

    <div class="chip-row" role="group" aria-label="When">
      {#each WHEN_OPTIONS as option (option.id)}
        <button
          type="button"
          class="chip"
          aria-pressed={filters.when === option.id}
          onclick={() => (filters.when = option.id)}
        >
          {option.label}
        </button>
      {/each}
    </div>
  </div>
</div>

<div class="filter-bar">
  <div class="wrap">
    <div class="chip-row" role="group" aria-label="Categories">
      {#each categoryChips as category (category.id)}
        <button
          type="button"
          class="chip"
          data-category={category.id}
          aria-pressed={filters.categories.includes(category.id)}
          onclick={() => toggleCategory(category.id)}
        >
          <span class="category-dot" aria-hidden="true"></span>
          {category.label}
        </button>
      {/each}
    </div>

    <div class="chip-row" role="group" aria-label="More filters">
      {#each toggles as toggle (toggle.key)}
        <button
          type="button"
          class="chip"
          aria-pressed={filters[toggle.key]}
          onclick={() => (filters[toggle.key] = !filters[toggle.key])}
        >
          {toggle.label}
        </button>
      {/each}
      {#if !isDefault}
        <button type="button" class="reset" onclick={reset}>Clear filters</button>
      {/if}
    </div>
  </div>
</div>

<style>
  .filter-bar {
    padding-bottom: 4px;
  }

  .pinned {
    position: sticky;
    top: 0;
    z-index: 10;
    padding-top: 12px;
    background: color-mix(in srgb, var(--bg) 92%, transparent);
    backdrop-filter: blur(8px);
  }

  .filter-bar:not(.pinned) {
    border-bottom: 1px solid var(--border);
  }

  .search {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
    color: var(--text-muted);
  }

  .search:focus-within {
    border-color: var(--focus);
  }

  .search input {
    flex: 1;
    min-width: 0;
    padding: 10px 0;
    border: none;
    background: transparent;
    color: var(--text);
    font-size: 16px; /* 16px keeps iOS from zooming in on focus. */
  }

  .search input:focus {
    outline: none;
  }

  .chip-row {
    display: flex;
    gap: 8px;
    margin: 10px calc(-1 * var(--gutter)) 0;
    padding: 0 var(--gutter) 6px;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .chip-row::-webkit-scrollbar {
    display: none;
  }

  /* Wide screens have room to wrap instead of scrolling sideways. */
  @media (min-width: 760px) {
    .chip-row {
      flex-wrap: wrap;
      margin: 10px 0 0;
      padding: 0 0 6px;
      overflow: visible;
    }
  }

  .reset {
    flex: none;
    border: none;
    background: none;
    color: var(--link);
    font-size: 14px;
    text-decoration: underline;
    cursor: pointer;
  }
</style>
