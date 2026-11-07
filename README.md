# BYU Events

Every event happening on BYU campus, in one place: concerts, games, lectures,
club activities, department seminars, museum programs, and academic dates.
Search and filter them, star the ones you like, and add them to your calendar.

**Live site:** https://andrewblodgett.github.io/byu_events/

An unofficial student project, not affiliated with Brigham Young University.

## How it works

BYU's events are scattered across dozens of websites. A scheduled GitHub
Action collects them every 3 hours, merges duplicates, and publishes one
`events.json` file that the page reads.

```
GitHub Action (every 3 hours)
  pipeline/build.ts
    ├─ fetch every source in pipeline/sources.config.ts
    ├─ merge duplicates (pipeline/merge.ts)
    ├─ tag free food (pipeline/tags.ts)
    └─ write public/data/events.json and public/data/feeds/*.ics
  vite build  →  GitHub Pages
```

If a source fails during a run, its events from the previous run are reused,
so one site going down doesn't empty the page.

### Sources

| Kind | Where | Adapter |
| --- | --- | --- |
| BYU Calendar API | calendar.byu.edu (arts, athletics, devotionals, BYUSA, academic dates), plus department copies like math.byu.edu | `byuCalendarApi.ts` |
| Club events feed | clubs.byu.edu/rest/events | `byuClubs.ts` |
| Department websites | Brightspot sites such as cs.byu.edu, kennedy.byu.edu, moa.byu.edu, sclcenter.byu.edu | `brightspotSite.ts` |
| Calendar feeds | Public Google or Outlook calendars, such as the Bean Museum's and ECE's | `icsFeed.ts` |

The footer of the live site lists every source with its event count and
whether it refreshed successfully.

#### Adding a source

Add an entry to `pipeline/sources.config.ts`. Most department sites are
Brightspot sites: if the site's events page links to event pages whose
URLs end in a date (like `cs.byu.edu/weekly-seminar-2026-11-13`), a
`brightspotSiteSource` with that events page as its `listingUrls` will work.
If the department publishes a Google or Outlook calendar, use
`icsFeedSource` with its public `.ics` link.

Run `npm run fetch-events` to check that the new source finds events.

### Data quirks worth knowing

- The calendar API's `IsFree` is always `"true"` and its prices are always
  `0.0`. Whether an event needs tickets comes from `TicketsExist`.
- The calendar API ignores its date range unless both ends are given.
- Department copies of the API also return every main-calendar event, so
  they're filtered to events whose page is on that department's site.
- All times are handled in Provo's time zone (`src/lib/campusTime.ts`), no
  matter where the build server or the viewer is.

## Development

Requires Node 22.18 or newer, which runs TypeScript directly.

```bash
npm install
```

```bash
npm run fetch-events   # collect events into public/data/
```

```bash
npm run dev            # http://localhost:5173/byu_events/
```

```bash
npm test               # unit tests (Vitest)
```

```bash
npm run check          # type-check everything
```

In a network sandbox that requires a proxy, run the fetch step as
`NODE_USE_ENV_PROXY=1 npm run fetch-events`.

### Layout

```
pipeline/            Collects events (runs in Node)
  sources/           One adapter per kind of source
  sources.config.ts  The list of sources
src/
  lib/               Shared by the pipeline and the page: event model,
                     Provo time helpers, filters, calendar files
  components/        Svelte components
  App.svelte         The page
test/                Unit tests, with trimmed real responses in fixtures/
```

## Deploying

The workflow in `.github/workflows/deploy.yml` tests and builds every push,
and publishes `main` to GitHub Pages. One-time setup: in the repository's
**Settings → Pages**, set **Source** to **GitHub Actions**.

## Analytics

Usage is counted with [GoatCounter](https://www.goatcounter.com), which uses
no cookies and collects no personal data. Besides page views it records
actions like adding an event to a calendar or using a filter (never search
text). To turn it on, create a GoatCounter site and put its endpoint in
`GOATCOUNTER_ENDPOINT` in `src/lib/analytics.ts`.
