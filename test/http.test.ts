import { describe, expect, it } from 'vitest';
import { HttpError, PoliteQueue, StoppedAskingError } from '../pipeline/http.ts';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('PoliteQueue', () => {
  it('runs one request at a time with a pause between them', async () => {
    const queue = new PoliteQueue(40);
    const spans: { start: number; end: number }[] = [];
    const request = async () => {
      const start = Date.now();
      await sleep(10);
      spans.push({ start, end: Date.now() });
    };

    await Promise.all([queue.run('a.byu.edu', request), queue.run('b.byu.edu', request), queue.run('a.byu.edu', request)]);

    expect(queue.requestCount).toBe(3);
    for (let i = 1; i < spans.length; i++) {
      // Timers can fire a millisecond early, so allow a little slack.
      expect(spans[i]!.start - spans[i - 1]!.end).toBeGreaterThanOrEqual(38);
    }
  });

  it('keeps going after a request fails', async () => {
    const queue = new PoliteQueue(0);
    const failing = queue.run('a.byu.edu', async () => {
      throw new Error('network');
    });
    await expect(failing).rejects.toThrow('network');
    await expect(queue.run('a.byu.edu', async () => 'ok')).resolves.toBe('ok');
  });

  it('stops asking a host that refused, without sending the request', async () => {
    const queue = new PoliteQueue(0);
    const refuse = async () => {
      throw new HttpError(403, 'https://calendar.byu.edu/');
    };
    await expect(queue.run('calendar.byu.edu', refuse)).rejects.toBeInstanceOf(HttpError);

    let sent = false;
    await expect(queue.run('calendar.byu.edu', async () => (sent = true))).rejects.toBeInstanceOf(StoppedAskingError);
    expect(sent).toBe(false);
    expect(queue.refusingHosts).toEqual(new Set(['calendar.byu.edu']));
    expect(queue.requestCount).toBe(1);
  });

  it('keeps asking hosts that have not refused', async () => {
    const queue = new PoliteQueue(0);
    await expect(queue.run('calendar.byu.edu', async () => Promise.reject(new HttpError(403, 'x')))).rejects.toThrow();
    await expect(queue.run('math.byu.edu', async () => 'ok')).resolves.toBe('ok');
  });

  it('counts 429 Too Many Requests as a refusal too', async () => {
    const queue = new PoliteQueue(0);
    await expect(queue.run('music.byu.edu', async () => Promise.reject(new HttpError(429, 'x')))).rejects.toThrow();
    expect(queue.refusingHosts.has('music.byu.edu')).toBe(true);
  });
});
