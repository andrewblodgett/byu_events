/**
 * A small, polite HTTP client: identifies itself, times out, retries
 * server errors once, and never hits a host with too many requests at once.
 */

const USER_AGENT = 'byu-events-aggregator (+https://github.com/andrewblodgett/byu_events)';
const TIMEOUT_MS = 45_000;
const RETRY_DELAY_MS = 3_000;

export class HttpError extends Error {
  readonly status: number;
  readonly url: string;

  constructor(status: number, url: string) {
    super(`HTTP ${status} for ${url}`);
    this.status = status;
    this.url = url;
  }
}

function isRetryable(error: unknown): boolean {
  if (error instanceof HttpError) return error.status >= 500;
  return true; // Network errors and timeouts.
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
  try {
    return await fetchOnce(url);
  } catch (error) {
    if (!isRetryable(error)) throw error;
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    return fetchOnce(url);
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
