/**
 * Die Vorschau-Warteschlange: eine Offscreen-Bühne zur Zeit, gleiche Anfragen
 * teilen sich einen Lauf, Ergebnisse bleiben für die Sitzung, Fehlschläge nicht.
 */
import { describe, expect, it } from 'vitest';

import {
  createSlideThumbnailCache,
  MAX_THUMBNAIL_PX,
  thumbnailWidthPx,
  type SlideThumbnailRenderer,
} from './slideLayoutThumbnails';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

function fakeRenderer() {
  const calls: string[] = [];
  const pending = new Map<string, ReturnType<typeof deferred<string | null>>>();
  let active = 0;
  let maxActive = 0;
  const renderer: SlideThumbnailRenderer = {
    prepare: () => Promise.resolve(),
    render: (id, locale) => {
      const key = `${locale}:${id}`;
      calls.push(key);
      active += 1;
      maxActive = Math.max(maxActive, active);
      const d = deferred<string | null>();
      pending.set(key, d);
      return d.promise.finally(() => {
        active -= 1;
      });
    },
  };
  return { renderer, calls, pending, maxActive: () => maxActive };
}

describe('slide thumbnail cache', () => {
  it('renders one layout at a time, in request order', async () => {
    const f = fakeRenderer();
    const cache = createSlideThumbnailCache(f.renderer);
    const a = cache.get('titel', 'de-DE', 200);
    const b = cache.get('zitat', 'de-DE', 200);
    await tick();
    expect(f.calls).toEqual(['de-DE:titel']);

    f.pending.get('de-DE:titel')!.resolve('data:a');
    expect(await a).toBe('data:a');
    await tick();
    expect(f.calls).toEqual(['de-DE:titel', 'de-DE:zitat']);
    f.pending.get('de-DE:zitat')!.resolve('data:b');
    expect(await b).toBe('data:b');
    expect(f.maxActive()).toBe(1);
  });

  it('dedupes identical requests and caches per layout and locale', async () => {
    const f = fakeRenderer();
    const cache = createSlideThumbnailCache(f.renderer);
    const first = cache.get('danke', 'de-DE', 200);
    const second = cache.get('danke', 'de-DE', 400);
    const at = cache.get('danke', 'de-AT', 200);
    await tick();
    f.pending.get('de-DE:danke')!.resolve('data:de');
    await tick();
    f.pending.get('de-AT:danke')!.resolve('data:at');
    expect(await first).toBe('data:de');
    expect(await second).toBe('data:de');
    expect(await at).toBe('data:at');

    expect(cache.peek('danke', 'de-DE')).toBe('data:de');
    expect(await cache.get('danke', 'de-DE', 200)).toBe('data:de');
    expect(f.calls).toEqual(['de-DE:danke', 'de-AT:danke']);
  });

  it('does not remember failures, and a failure does not stall the queue', async () => {
    const f = fakeRenderer();
    const cache = createSlideThumbnailCache(f.renderer);
    const broken = cache.get('bildfolie', 'de-DE', 200);
    const next = cache.get('titel', 'de-DE', 200);
    await tick();
    f.pending.get('de-DE:bildfolie')!.resolve(null);
    expect(await broken).toBeNull();
    await tick();
    f.pending.get('de-DE:titel')!.resolve('data:t');
    expect(await next).toBe('data:t');

    expect(cache.peek('bildfolie', 'de-DE')).toBeNull();
    void cache.get('bildfolie', 'de-DE', 200);
    await tick();
    expect(f.calls.filter((c) => c === 'de-DE:bildfolie')).toHaveLength(2);
  });

  it('lets a slow photo wait outside the queue', async () => {
    const f = fakeRenderer();
    const photo = deferred<void>();
    const cache = createSlideThumbnailCache({
      ...f.renderer,
      prepare: (id) => (id === 'bildfolie' ? photo.promise : Promise.resolve()),
    });
    void cache.get('bildfolie', 'de-DE', 200);
    void cache.get('titel', 'de-DE', 200);
    await tick();
    expect(f.calls).toEqual(['de-DE:titel']);
    photo.resolve();
    f.pending.get('de-DE:titel')!.resolve('data:t');
    await tick();
    await tick();
    expect(f.calls).toEqual(['de-DE:titel', 'de-DE:bildfolie']);
  });

  it('sizes the image to the tile in device pixels, capped', () => {
    expect(thumbnailWidthPx(120, 2)).toBe(240);
    expect(thumbnailWidthPx(400, 3)).toBe(MAX_THUMBNAIL_PX);
    expect(thumbnailWidthPx(0, 1)).toBe(160);
  });
});
