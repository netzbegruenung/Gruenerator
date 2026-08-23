/**
 * The rendered picture for one sharepic variant, cache first.
 *
 * The chat never sends a bitmap — only the canvas description — so a preview
 * has to be produced on the device. `services/sharepicRender.ts` borrows the
 * web renderer through a hidden WebView; this hook is what a card uses to ask
 * for one without knowing any of that.
 */

import { useSharepicLiveStore, type SharepicVariant } from '@gruenerator/chat';
import { useEffect, useState } from 'react';

import { renderSharepic } from '../services/sharepicRender';
import {
  readCachedSharepic,
  sharepicCacheKey,
  writeCachedSharepic,
} from '../services/sharepicRenderCache';

export type SharepicPreviewStatus = 'rendering' | 'ready' | 'unavailable';

export interface SharepicPreview {
  image: string | null;
  status: SharepicPreviewStatus;
}

function fromCache(key: string): SharepicPreview {
  const cached = readCachedSharepic(key);
  return cached === null
    ? { image: null, status: 'rendering' }
    : { image: cached, status: 'ready' };
}

export function useSharepicPreview(variant: SharepicVariant): SharepicPreview {
  // A chat edit bumps the version, which changes the key — so an edited
  // sharepic is a cache miss and re-renders, while flipping between variants
  // costs nothing. Same rule as web's thumbnail cache.
  const entry = useSharepicLiveStore((state) => state.entries[variant.id]);
  const version = entry?.version ?? 0;
  const key = sharepicCacheKey(variant.id, version);

  // The edited state wins over the original props once an edit has landed —
  // mirrors `viewState ?? live?.state ?? variant.initialProps` on web.
  const props = entry?.state ?? variant.initialProps;

  const [current, setCurrent] = useState(() => ({ key, preview: fromCache(key) }));

  // Adjusting state during render rather than in an effect: this state derives
  // from `key`, and React's own recipe for that is to compare and re-set here.
  // An effect would additionally show the PREVIOUS variant's picture for one
  // frame after a switch, which reads as the wrong sharepic rather than a slow
  // one.
  if (current.key !== key) {
    setCurrent({ key, preview: fromCache(key) });
  }

  useEffect(() => {
    if (current.preview.status !== 'rendering') return;
    let cancelled = false;

    void renderSharepic(key, variant.canvasType, props).then((image) => {
      if (cancelled) return;
      if (image === null) {
        setCurrent({ key, preview: { image: null, status: 'unavailable' } });
        return;
      }
      writeCachedSharepic(key, image);
      setCurrent({ key, preview: { image, status: 'ready' } });
    });

    return () => {
      cancelled = true;
    };
    // `props` is a fresh object on every store read, so keying the effect on it
    // would re-render the sharepic on every unrelated store change. The version
    // inside `key` is what actually says the picture changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, variant.canvasType, current.preview.status]);

  return current.preview;
}
