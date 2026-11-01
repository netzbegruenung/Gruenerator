/**
 * Vorschaubilder der Deck-Vorlagen: je (Stil, Typ, Land) einmal pro Sitzung,
 * nacheinander gerendert (eine Offscreen-Bühne zur Zeit). Fehlschläge werden
 * nicht gemerkt.
 */
import { useCanvasEditorServices } from '@ggraphic/editor/CanvasEditorProvider';
import { plainImageUrls, type CanvasImageUrlService } from '@ggraphic/editor/hostServices';
import { useLayoutEffect, useRef, useState } from 'react';

import { renderDeckStilThumbnail, type DeckPreviewTyp } from './renderDeckStilThumbnail';
import { thumbnailWidthPx } from './slideLayoutThumbnails';

import type { BrandLocale } from '../brand/theme';
import type { DeckStilId } from '@gruenerator/contracts/slides';

/** Die drei Typen, an denen eine Vorlage erkannt wird. */
export const DECK_PREVIEW_TYPEN: readonly DeckPreviewTyp[] = ['titel', 'liste', 'kernsatz'];

const done = new Map<string, string>();
const inflight = new Map<string, Promise<string | null>>();
let tail: Promise<unknown> = Promise.resolve();

const keyOf = (stil: DeckStilId, typ: DeckPreviewTyp, locale: BrandLocale) =>
  `${locale}:${stil}:${typ}`;

function fetchThumbnail(
  stil: DeckStilId,
  typ: DeckPreviewTyp,
  locale: BrandLocale,
  widthPx: number,
  imageUrls: CanvasImageUrlService
): Promise<string | null> {
  const key = keyOf(stil, typ, locale);
  const running = inflight.get(key);
  if (running) return running;
  const run = tail.then(() =>
    renderDeckStilThumbnail(stil, typ, locale, widthPx, imageUrls).catch(() => null)
  );
  tail = run;
  const job = run.then((url) => {
    if (url) done.set(key, url);
    inflight.delete(key);
    return url;
  });
  inflight.set(key, job);
  return job;
}

type Status = 'loading' | 'ready' | 'failed';

/** `ref` gehört an das Element, das die Kachelbreite vorgibt. */
export function useDeckStilThumbnail(stil: DeckStilId, typ: DeckPreviewTyp, locale: BrandLocale) {
  const ref = useRef<HTMLElement | null>(null);
  const { imageUrls = plainImageUrls } = useCanvasEditorServices();
  const [src, setSrc] = useState(() => done.get(keyOf(stil, typ, locale)) ?? null);
  const [status, setStatus] = useState<Status>(src ? 'ready' : 'loading');

  useLayoutEffect(() => {
    if (src) return;
    let alive = true;
    const width = thumbnailWidthPx(
      ref.current?.getBoundingClientRect().width ?? 0,
      window.devicePixelRatio
    );
    void fetchThumbnail(stil, typ, locale, width, imageUrls).then((url) => {
      if (!alive) return;
      setSrc(url);
      setStatus(url ? 'ready' : 'failed');
    });
    return () => {
      alive = false;
    };
  }, [stil, typ, locale, src, imageUrls]);

  return { ref, src, status };
}
