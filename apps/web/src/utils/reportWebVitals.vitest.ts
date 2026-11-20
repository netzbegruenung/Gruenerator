import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type MetricWithAttribution } from 'web-vitals/attribution';

const handlers = vi.hoisted(() => new Map<string, (m: unknown) => void>());
vi.mock('web-vitals/attribution', () => ({
  onTTFB: (cb: (m: unknown) => void) => handlers.set('TTFB', cb),
  onFCP: (cb: (m: unknown) => void) => handlers.set('FCP', cb),
  onLCP: (cb: (m: unknown) => void) => handlers.set('LCP', cb),
  onCLS: (cb: (m: unknown) => void) => handlers.set('CLS', cb),
  onINP: (cb: (m: unknown) => void) => handlers.set('INP', cb),
}));

import { reportWebVitals, toEventData } from './reportWebVitals';

function metric(partial: Partial<MetricWithAttribution>): MetricWithAttribution {
  return {
    name: 'LCP',
    value: 2512.7,
    rating: 'needs-improvement',
    delta: 0,
    id: 'v1',
    entries: [],
    navigationType: 'navigate',
    attribution: {},
    ...partial,
  } as MetricWithAttribution;
}

const track = vi.fn();

beforeEach(() => {
  vi.useFakeTimers();
  handlers.clear();
  track.mockReset();
  vi.stubGlobal('window', { location: { pathname: '/notebooks/meine-notizen-a1b2c3' } });
  vi.stubGlobal('navigator', { connection: { effectiveType: '3g' } });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('toEventData', () => {
  it('rounds milliseconds and keeps CLS to three decimals', () => {
    expect(toEventData(metric({ value: 2512.7 }), '/').value).toBe(2513);
    expect(toEventData(metric({ name: 'CLS', value: 0.123456 }), '/').value).toBe(0.123);
  });

  it('takes the attribution selector of LCP, INP and CLS, truncated', () => {
    expect(toEventData(metric({ attribution: { target: 'main > h1' } as never }), '/').target).toBe(
      'main > h1'
    );
    expect(
      toEventData(
        metric({ name: 'INP', attribution: { interactionTarget: 'button' } as never }),
        '/'
      ).target
    ).toBe('button');
    const long = toEventData(metric({ attribution: { target: 'x'.repeat(500) } as never }), '/');
    expect(String(long.target)).toHaveLength(100);
  });
});

describe('reportWebVitals', () => {
  it('sends one Umami event per metric with the first path segment only', () => {
    vi.stubGlobal('window', {
      location: { pathname: '/notebooks/meine-notizen-a1b2c3' },
      umami: { track },
    });
    reportWebVitals();
    handlers.get('LCP')?.(metric({}));
    expect(track).toHaveBeenCalledWith('web-vitals', {
      metric: 'LCP',
      value: 2513,
      rating: 'needs-improvement',
      route: '/notebooks',
      navigation: 'navigate',
      connection: '3g',
    });
  });

  it('waits for the deferred Umami tracker, then gives up', () => {
    const win: { location: { pathname: string }; umami?: { track: typeof track } } = {
      location: { pathname: '/' },
    };
    vi.stubGlobal('window', win);
    reportWebVitals();
    handlers.get('FCP')?.(metric({ name: 'FCP' }));
    vi.advanceTimersByTime(2000);
    win.umami = { track };
    vi.advanceTimersByTime(1000);
    expect(track).toHaveBeenCalledTimes(1);

    track.mockReset();
    delete win.umami;
    handlers.get('TTFB')?.(metric({ name: 'TTFB' }));
    vi.advanceTimersByTime(60_000);
    expect(track).not.toHaveBeenCalled();
  });
});
