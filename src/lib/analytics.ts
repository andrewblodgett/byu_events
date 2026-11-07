/**
 * Privacy-friendly usage counts with GoatCounter (https://www.goatcounter.com):
 * no cookies and no personal data. Page views are counted automatically;
 * `track` records what people do on the page, like adding an event to their
 * calendar.
 *
 * To turn it on, create a site at goatcounter.com and put its endpoint here,
 * e.g. 'https://byuevents.goatcounter.com/count'. Empty means off.
 */
export const GOATCOUNTER_ENDPOINT = '';

interface GoatCounter {
  count(options: { path: string; title?: string; event?: boolean }): void;
}

declare global {
  interface Window {
    goatcounter?: Partial<GoatCounter>;
  }
}

/** Events recorded before the script finishes loading. */
const queued: Parameters<GoatCounter['count']>[0][] = [];

export function startAnalytics(): void {
  if (!GOATCOUNTER_ENDPOINT) return;
  const script = document.createElement('script');
  script.async = true;
  script.src = 'https://gc.zgo.at/count.js';
  script.dataset.goatcounter = GOATCOUNTER_ENDPOINT;
  script.addEventListener('load', () => {
    for (const options of queued.splice(0)) window.goatcounter?.count?.(options);
  });
  document.head.append(script);
}

/**
 * Record an action. `name` shows up as the event's path in GoatCounter, for
 * example "add-to-calendar/google"; `detail` is shown as its title.
 */
export function track(name: string, detail?: string): void {
  if (!GOATCOUNTER_ENDPOINT) return;
  const options = { path: name, title: detail ?? name, event: true };
  if (window.goatcounter?.count) window.goatcounter.count(options);
  else queued.push(options);
}
