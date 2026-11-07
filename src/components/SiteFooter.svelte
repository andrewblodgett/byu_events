<script lang="ts">
  import { track } from '../lib/analytics.ts';
  import { CATEGORIES, type EventsFile } from '../lib/event.ts';
  import { formatAge } from '../lib/format.ts';

  let { data, now }: { data: EventsFile | null; now: Date } = $props();

  const REPO_URL = 'https://github.com/andrewblodgett/byu_events';
  const feedBase = `${location.host}${import.meta.env.BASE_URL}data/feeds`;

  const workingSources = $derived(data?.sources.filter((source) => source.status !== 'failed').length ?? 0);
</script>

<footer class="site-footer">
  <div class="wrap">
    {#if data}
      <p>
        Updated {formatAge(data.generatedAt, now)} from {workingSources} sources.
      </p>

      <details>
        <summary>Where these events come from</summary>
        <ul class="sources">
          {#each data.sources as source (source.id)}
            <li>
              <a href={source.homepage} target="_blank" rel="noopener">{source.name}</a>
              <span class="count">{source.eventCount} events</span>
              {#if source.status === 'stale'}
                <span class="badge" title={source.error}>Couldn't refresh; showing last copy</span>
              {:else if source.status === 'failed'}
                <span class="badge" title={source.error}>Unavailable right now</span>
              {/if}
            </li>
          {/each}
        </ul>
        <p>
          Know a calendar we're missing?
          <a href={`${REPO_URL}/issues/new?title=${encodeURIComponent('Add event source: ')}`} target="_blank" rel="noopener">
            Tell us about it
          </a>.
        </p>
      </details>

      <details>
        <summary>Subscribe in your calendar app</summary>
        <p>These update on their own as events are added. Pick one, or subscribe to everything:</p>
        <ul class="feeds">
          <li>
            <a href={`webcal://${feedBase}/all.ics`} onclick={() => track('subscribe/all')}>All events</a>
          </li>
          {#each CATEGORIES as category (category.id)}
            <li>
              <a href={`webcal://${feedBase}/${category.id}.ics`} onclick={() => track(`subscribe/${category.id}`)}>
                {category.label}
              </a>
            </li>
          {/each}
        </ul>
      </details>
    {/if}

    <p class="fine-print">
      An unofficial student project, not affiliated with Brigham Young University. Details can change, so check the
      event page before you go. <a href={REPO_URL} target="_blank" rel="noopener">Source code</a>.
    </p>
  </div>
</footer>

<style>
  .site-footer {
    margin-top: 40px;
    padding: 24px 0 40px;
    border-top: 1px solid var(--border);
    color: var(--text-muted);
    font-size: 14px;
  }

  details {
    margin: 12px 0;
  }

  summary {
    color: var(--text);
    font-weight: 600;
    cursor: pointer;
  }

  .sources,
  .feeds {
    padding-left: 18px;
  }

  .sources li {
    margin: 4px 0;
  }

  .count {
    margin: 0 6px;
  }

  .feeds {
    columns: 2;
  }

  .fine-print {
    margin-top: 20px;
  }
</style>
