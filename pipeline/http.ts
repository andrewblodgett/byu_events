/**
 * A small, polite HTTP client. It identifies itself, times out, and retries
 * server errors once.
 *
 * Every request to BYU's servers (any *.byu.edu site) waits its turn in one
 * queue: one request at a time, with a pause between them. Most BYU sites sit
 * behind the same servers, so this keeps the whole build gentle on them, not
 * just each site. Some BYU sites refuse requests from cloud servers such as
 * GitHub's; once a site refuses (403 or 429), we stop asking that site for the
 * rest of the run and fall back on its events from the last run.
 */

const USER_AGENT = 'byu-events-aggregator (+https://github.com/andrewblodgett/byu_events)';
const TIMEOUT_MS = 45_000;
const RETRY_DELAY_MS = 3_000;

/** Pause between requests to BYU's servers. */
const BYU_REQUEST_GAP_MS = 500;

export class HttpError extends Error {
  readonly status: number;
  readonly url: string;

  constructor(status: number, url: string) {
    super(`HTTP ${status} for ${url}`);
    this.status = status;
    this.url = url;
  }
}

/** Thrown instead of sending a request once a server has refused us repeatedly. */
export class StoppedAskingError extends Error {}

function isRefusal(error: unknown): boolean {
  return error instanceof HttpError && (error.status === 403 || error.status === 429);
}

function isRetryable(error: unknown): boolean {
  if (error instanceof StoppedAskingError) return false;
  if (error instanceof HttpError) return error.status >= 500;
  return true; // Network errors and timeouts.
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Runs requests one at a time, waiting `gapMs` after each before starting the
 * next. Once a host refuses a request, later requests to it aren't sent.
 */
export class PoliteQueue {
  readonly gapMs: number;
  requestCount = 0;
  /** Hosts that refused us this run. */
  readonly refusingHosts = new Set<string>();
  private lastFinishedAt = 0;
  private tail: Promise<unknown> = Promise.resolve();

  constructor(gapMs: number) {
    this.gapMs = gapMs;
  }

  run<T>(host: string, request: () => Promise<T>): Promise<T> {
    const turn = this.tail.then(async () => {
      if (this.refusingHosts.has(host)) throw new StoppedAskingError(`${host} refused an earlier request`);
      const wait = this.lastFinishedAt + this.gapMs - Date.now();
      if (wait > 0) await sleep(wait);
      this.requestCount++;
      try {
        return await request();
      } catch (error) {
        if (isRefusal(error)) this.refusingHosts.add(host);
        throw error;
      } finally {
        this.lastFinishedAt = Date.now();
      }
    });
    // The next request waits for this one whether it succeeded or not.
    this.tail = turn.catch(() => undefined);
    return turn;
  }
}

export const byuQueue = new PoliteQueue(BYU_REQUEST_GAP_MS);

function isByuHost(host: string): boolean {
  return host === 'byu.edu' || host.endsWith('.byu.edu');
}

async function fetchOnce(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new HttpError(response.status, url);
  return response.text();
}

export async function fetchText(url: string): Promise<string> {
  const host = new URL(url).hostname;
  const attempt = () => (isByuHost(host) ? byuQueue.run(host, () => fetchOnce(url)) : fetchOnce(url));
  try {
    return await attempt();
  } catch (error) {
    if (!isRetryable(error)) throw error;
    await sleep(RETRY_DELAY_MS);
    return attempt();
  }
}

export async function fetchJson<T>(url: string): Promise<T> {
  return JSON.parse(await fetchText(url)) as T;
}

/**
 * Run `task` on every item with at most `limit` running at once.
 * Results come back in the same order as `items`.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await task(items[index] as T);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
