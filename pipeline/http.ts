/**
 * A small, polite HTTP client. It identifies itself, times out, and retries
 * server errors once.
 *
 * Every request to BYU's servers (any *.byu.edu site) waits its turn in one
 * queue: one request at a time, with a pause between them. Most BYU sites sit
 * behind the same servers, so this keeps the whole build gentle on them, not
 * just each site. If BYU refuses several requests in a row, the build stops
 * asking for the rest of the run and falls back on the last run's events.
 */

const USER_AGENT = 'byu-events-aggregator (+https://github.com/andrewblodgett/byu_events)';
const TIMEOUT_MS = 45_000;
const RETRY_DELAY_MS = 3_000;

/** Pause between requests to BYU's servers. */
const BYU_REQUEST_GAP_MS = 500;
/** Refusals (403 or 429) in a row before we stop asking BYU's servers. */
const BYU_REFUSALS_BEFORE_STOPPING = 3;

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

/** Runs requests one at a time, waiting `gapMs` after each before starting the next. */
export class PoliteQueue {
  readonly gapMs: number;
  readonly refusalsBeforeStopping: number;
  requestCount = 0;
  refusalCount = 0;
  private consecutiveRefusals = 0;
  private lastFinishedAt = 0;
  private tail: Promise<unknown> = Promise.resolve();

  constructor(gapMs: number, refusalsBeforeStopping: number) {
    this.gapMs = gapMs;
    this.refusalsBeforeStopping = refusalsBeforeStopping;
  }

  get stoppedAsking(): boolean {
    return this.consecutiveRefusals >= this.refusalsBeforeStopping;
  }

  run<T>(request: () => Promise<T>): Promise<T> {
    const turn = this.tail.then(async () => {
      if (this.stoppedAsking) throw new StoppedAskingError('Stopped asking after repeated refusals');
      const wait = this.lastFinishedAt + this.gapMs - Date.now();
      if (wait > 0) await sleep(wait);
      this.requestCount++;
      try {
        const result = await request();
        this.consecutiveRefusals = 0;
        return result;
      } catch (error) {
        if (isRefusal(error)) {
          this.consecutiveRefusals++;
          this.refusalCount++;
        }
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

export const byuQueue = new PoliteQueue(BYU_REQUEST_GAP_MS, BYU_REFUSALS_BEFORE_STOPPING);

function isByuUrl(url: string): boolean {
  const host = new URL(url).hostname;
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
  const attempt = () => (isByuUrl(url) ? byuQueue.run(() => fetchOnce(url)) : fetchOnce(url));
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
