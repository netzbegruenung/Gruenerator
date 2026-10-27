/**
 * Vorschaubilder der Folienlayouts: je (Layout, Land) einmal pro Sitzung
 * gerendert, nacheinander (eine Offscreen-Bühne zur Zeit), gleiche Anfragen
 * teilen sich einen Lauf. Fehlschläge werden nicht gemerkt — beim nächsten
 * Öffnen wird es noch einmal versucht.
 */

import { useCanvasEditorServices } from '@ggraphic/editor/CanvasEditorProvider';
import { plainImageUrls, type CanvasImageUrlService } from '@ggraphic/editor/hostServices';
import { useLayoutEffect, useRef, useState } from 'react';

import { preloadSlideLayoutPhoto, renderSlideLayoutThumbnail } from './renderSlideLayoutThumbnail';

import type { SlideLayoutId } from './slideLayouts';
import type { BrandLocale } from '../brand/theme';

/** Obergrenze der Bildbreite in Gerätepixeln. */
export const MAX_THUMBNAIL_PX = 480;
/** Kachelbreite, wenn das Layout (noch) keine Breite meldet. */
const FALLBACK_TILE_PX = 160;

export interface SlideThumbnailRenderer {
  /** Läuft parallel, vor dem Platz in der Warteschlange (Foto vorladen). */
  prepare: (id: SlideLayoutId, locale: BrandLocale) => Promise<void>;
  render: (
    id: SlideLayoutId,
    locale: BrandLocale,
    widthPx: number,
    imageUrls: CanvasImageUrlService
  ) => Promise<string | null>;
}

export interface SlideThumbnailCache {
  peek: (id: SlideLayoutId, locale: BrandLocale) => string | null;
  /** `imageUrls`: the host's, so the offscreen stage loads photos as the editor does. */
  get: (
    id: SlideLayoutId,
    locale: BrandLocale,
    widthPx: number,
    imageUrls?: CanvasImageUrlService
  ) => Promise<string | null>;
}

export function createSlideThumbnailCache(renderer: SlideThumbnailRenderer): SlideThumbnailCache {
  const done = new Map<string, string>();
  const inflight = new Map<string, Promise<string | null>>();
  let tail: Promise<unknown> = Promise.resolve();

  return {
    peek: (id, locale) => done.get(`${locale}:${id}`) ?? null,
    get(id, locale, widthPx, imageUrls = plainImageUrls) {
      const key = `${locale}:${id}`;
      const cached = done.get(key);
      if (cached) return Promise.resolve(cached);
      const running = inflight.get(key);
      if (running) return running;

      const job = (async () => {
        await renderer.prepare(id, locale).catch(() => undefined);
        const run = tail.then(() =>
          renderer.render(id, locale, widthPx, imageUrls).catch(() => null)
        );
        tail = run;
        const url = await run;
        if (url) done.set(key, url);
        inflight.delete(key);
        return url;
      })();
      inflight.set(key, job);
      return job;
    },
  };
}

export const slideLayoutThumbnails = createSlideThumbnailCache({
  prepare: preloadSlideLayoutPhoto,
  render: renderSlideLayoutThumbnail,
});

export function thumbnailWidthPx(tileWidth: number, dpr: number): number {
  return Math.min(MAX_THUMBNAIL_PX, Math.ceil((tileWidth || FALLBACK_TILE_PX) * (dpr || 1)));
}

type ThumbnailStatus = 'loading' | 'ready' | 'failed';

/**
 * Das Vorschaubild einer Kachel. `ref` gehört an das Element, das die
 * Kachelbreite vorgibt; gerendert wird erst, wenn die Kachel montiert ist.
 */
export function useSlideLayoutThumbnail(id: SlideLayoutId, locale: BrandLocale) {
  const ref = useRef<HTMLElement | null>(null);
  const { imageUrls = plainImageUrls } = useCanvasEditorServices();
  const [src, setSrc] = useState(() => slideLayoutThumbnails.peek(id, locale));
  const [status, setStatus] = useState<ThumbnailStatus>(src ? 'ready' : 'loading');

  useLayoutEffect(() => {
    if (src) return;
    let alive = true;
    const width = thumbnailWidthPx(
      ref.current?.getBoundingClientRect().width ?? 0,
      window.devicePixelRatio
    );
    void slideLayoutThumbnails.get(id, locale, width, imageUrls).then((url) => {
      if (!alive) return;
      setSrc(url);
      setStatus(url ? 'ready' : 'failed');
    });
    return () => {
      alive = false;
    };
  }, [id, locale, src, imageUrls]);

  return { ref, src, status };
}
