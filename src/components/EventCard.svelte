<script lang="ts">
  import { track } from '../lib/analytics.ts';
  import { googleCalendarUrl, toIcsCalendar } from '../lib/calendarFiles.ts';
  import { categoryLabel, type CampusEvent } from '../lib/event.ts';
  import { isHappeningNow, type EventRow } from '../lib/filters.ts';
  import { formatFee, formatTime, formatTimeRange } from '../lib/format.ts';
  import { starred, toggleStar } from '../lib/starred.svelte.ts';

  let { row, now }: { row: EventRow; now: Date } = $props();

  let expanded = $state(false);

  const event = $derived(row.occurrences[0] as CampusEvent);
  const repeats = $derived(row.occurrences.length > 1);
  const isStarred = $derived(row.occurrences.some((occurrence) => starred.has(occurrence.id)));
  const live = $derived(row.occurrences.some((occurrence) => isHappeningNow(occurrence, now)));
  const detailsId = $derived(`details-${row.key.replace(/[^a-zA-Z0-9-]/g, '-')}`);
  const mapUrl = $derived(
    event.location
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${event.location}, BYU, Provo, UT`)}`
      : null,
  );

  function toggleDetails() {
    expanded = !expanded;
    if (expanded) track('open-event', event.title);
  }

  function star() {
    // A row of repeated showings is starred or unstarred together.
    const target = !isStarred;
    for (const occurrence of row.occurrences) {
      if (starred.has(occurrence.id) !== target) toggleStar(occurrence.id);
    }
    if (target) track('star', event.title);
  }

  function downloadIcs(occurrence: CampusEvent) {
    const blob = new Blob([toIcsCalendar([occurrence], occurrence.title)], { type: 'text/calendar' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${occurrence.title.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'event'}.ics`;
    link.click();
    URL.revokeObjectURL(link.href);
    track('add-to-calendar/ics', occurrence.title);
  }
</script>

<article class="card" data-category={event.category} class:expanded>
  <div class="summary">
    <div class="time">
      {#if repeats}
        {#each row.occurrences as occurrence (occurrence.id)}
          <span>{occurrence.allDay ? 'All day' : formatTime(occurrence.start)}</span>
        {/each}
      {:else}
        {formatTimeRange(event)}
      {/if}
    </div>

    <div class="main">
      <h3 class="title">
        <button type="button" class="title-button" aria-expanded={expanded} aria-controls={detailsId} onclick={toggleDetails}>
          {event.title}
        </button>
      </h3>
      {#if event.location || event.organizer}
        <p class="meta">{[event.location, event.organizer].filter(Boolean).join(' · ')}</p>
      {/if}
      <p class="badges">
        <span class="badge category"><span class="category-dot" aria-hidden="true"></span>{categoryLabel(event.category)}</span>
        {#if live}<span class="badge live">Happening now</span>{/if}
        {#if event.ticketed}<span class="badge">Tickets</span>{/if}
        {#if event.fee !== null}<span class="badge">{formatFee(event.fee)}</span>{/if}
        {#if event.tags.includes('free-food')}<span class="badge food">Free food</span>{/if}
      </p>
    </div>

    <button
      type="button"
      class="star"
      aria-pressed={isStarred}
      aria-label={isStarred ? `Unstar ${event.title}` : `Star ${event.title}`}
      onclick={star}
    >
      {isStarred ? '★' : '☆'}
    </button>
  </div>

  {#if expanded}
    <div class="details" id={detailsId}>
      {#if event.imageUrl}
        <img src={event.imageUrl} alt="" loading="lazy" />
      {/if}
      {#if event.description}
        <p class="description">{event.description}</p>
      {/if}

      <div class="links">
        {#if event.url}
          <a href={event.url} target="_blank" rel="noopener" onclick={() => track('outbound/event-page', event.title)}>Event page</a>
        {/if}
        {#if event.ticketUrl}
          <a href={event.ticketUrl} target="_blank" rel="noopener" onclick={() => track('outbound/tickets', event.title)}>Get tickets</a>
        {/if}
        {#if mapUrl}
          <a href={mapUrl} target="_blank" rel="noopener">Map</a>
        {/if}
      </div>

      <div class="add-to-calendar">
        {#each row.occurrences as occurrence (occurrence.id)}
          <div class="calendar-row">
            <span class="calendar-label">{repeats ? `Add ${formatTimeRange(occurrence)}` : 'Add to calendar'}</span>
            <a
              class="chip"
              href={googleCalendarUrl(occurrence)}
              target="_blank"
              rel="noopener"
              onclick={() => track('add-to-calendar/google', occurrence.title)}
            >
              Google
            </a>
            <button type="button" class="chip" onclick={() => downloadIcs(occurrence)}>Apple / Outlook (.ics)</button>
          </div>
        {/each}
      </div>
    </div>
  {/if}
</article>

<style>
  .card {
    border: 1px solid var(--border);
    border-left: 4px solid var(--cat-color);
    border-radius: var(--radius);
    background: var(--surface);
  }

  .summary {
    display: grid;
    grid-template-columns: 76px 1fr auto;
    gap: 12px;
    padding: 12px 8px 12px 12px;
  }

  .time {
    display: flex;
    flex-direction: column;
    color: var(--text-muted);
    font-size: 14px;
    font-variant-numeric: tabular-nums;
    line-height: 1.4;
  }

  .main {
    min-width: 0;
  }

  .title {
    margin: 0;
    font-size: 16px;
    line-height: 1.3;
  }

  .title-button {
    padding: 0;
    border: none;
    background: none;
    font-weight: 650;
    text-align: left;
    cursor: pointer;
  }

  .title-button:hover {
    text-decoration: underline;
  }

  .meta {
    margin: 4px 0 0;
    color: var(--text-muted);
    font-size: 14px;
  }

  .badges {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin: 8px 0 0;
  }

  .badge.category {
    gap: 6px;
  }

  .badge.live {
    background: var(--cat-lectures);
    color: var(--surface);
  }

  .badge.food {
    background: var(--warning-bg);
    color: var(--warning-text);
  }

  .star {
    align-self: start;
    width: 40px;
    height: 40px;
    border: none;
    border-radius: 50%;
    background: none;
    color: var(--text-muted);
    font-size: 22px;
    line-height: 1;
    cursor: pointer;
  }

  .star[aria-pressed='true'] {
    color: #e0a100;
  }

  .details {
    padding: 0 12px 14px;
    border-top: 1px solid var(--border);
  }

  .details img {
    display: block;
    width: 100%;
    max-height: 260px;
    margin-top: 12px;
    border-radius: 8px;
    object-fit: cover;
  }

  .description {
    margin: 12px 0 0;
    white-space: pre-line;
    overflow-wrap: anywhere;
  }

  .links {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    margin-top: 12px;
    font-weight: 600;
  }

  .add-to-calendar {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 14px;
  }

  .calendar-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }

  .calendar-label {
    width: 100%;
    color: var(--text-muted);
    font-size: 13px;
  }

  .calendar-row .chip {
    text-decoration: none;
  }
</style>
