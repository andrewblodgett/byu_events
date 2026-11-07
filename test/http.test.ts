import { describe, expect, it } from 'vitest';
import { HttpError, PoliteQueue, StoppedAskingError } from '../pipeline/http.ts';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('PoliteQueue', () => {
  it('runs one request at a time with a pause between them', async () => {
    const queue = new PoliteQueue(40, 3);
    const spans: { start: number; end: number }[] = [];
    const request = async () => {
      const start = Date.now();
      await sleep(10);
      spans.push({ start, end: Date.now() });
    };

    await Promise.all([queue.run(request), queue.run(request), queue.run(request)]);

    expect(queue.requestCount).toBe(3);
    for (let i = 1; i < spans.length; i++) {
      // Timers can fire a millisecond early, so allow a little slack.
      expect(spans[i]!.start - spans[i - 1]!.end).toBeGreaterThanOrEqual(38);
    }
  });

  it('keeps going after a request fails', async () => {
    const queue = new PoliteQueue(0, 3);
    const failing = queue.run(async () => {
      throw new Error('network');
    });
    await expect(failing).rejects.toThrow('network');
    await expect(queue.run(async () => 'ok')).resolves.toBe('ok');
  });

  it('stops asking after refusals in a row, without sending more requests', async () => {
    const queue = new PoliteQueue(0, 2);
    const refuse = async () => {
      throw new HttpError(403, 'https://calendar.byu.edu/');
    };
    await expect(queue.run(refuse)).rejects.toBeInstanceOf(HttpError);
    await expect(queue.run(refuse)).rejects.toBeInstanceOf(HttpError);

    let sent = false;
    await expect(queue.run(async () => (sent = true))).rejects.toBeInstanceOf(StoppedAskingError);
    expect(sent).toBe(false);
    expect(queue.stoppedAsking).toBe(true);
    expect(queue.refusalCount).toBe(2);
  });

  it('forgives a refusal once a request succeeds', async () => {
    const queue = new PoliteQueue(0, 2);
    await expect(queue.run(async () => Promise.reject(new HttpError(429, 'x')))).rejects.toThrow();
    await queue.run(async () => 'ok');
    await expect(queue.run(async () => Promise.reject(new HttpError(403, 'x')))).rejects.toThrow();
    expect(queue.stoppedAsking).toBe(false);
  });
});
