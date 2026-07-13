import { useEffect, useState } from 'react';

import { useChatConfigStore } from '../stores/chatConfigStore';
import { useSharepicLiveStore } from '../stores/sharepicLiveStore';

import type { SharepicVariant } from './useChatGraphStream';

/**
 * Module-level thumbnail cache for the variant strip. Keyed by
 * variantId + live version, so a chat edit (sharepic_updated bumps the
 * version) invalidates exactly the affected entry; switching the hero back
 * and forth costs nothing. Capped to keep long sessions bounded.
 */
const thumbCache = new Map<string, string>();
const THUMB_CACHE_MAX = 30;

function cacheKeyFor(variantId: string, version: number | null): string {
  return `${variantId}:v${version ?? 0}`;
}

/** Called by useSharepicArtifact after a successful head render so the hero's
 *  full-res result doubles as the thumbnail — no duplicate render for the
 *  selected variant. */
export function seedThumbnailCache(variantId: string, dataUrl: string): void {
  const version = useSharepicLiveStore.getState().entries[variantId]?.version ?? null;
  thumbCache.set(cacheKeyFor(variantId, version), dataUrl);
  trimCache();
}

/**
 * Cached full-res head render for a variant at a given live version, or null.
 * The cache is version-keyed, so a chat edit (version bump) is a miss and
 * forces a fresh render; switching the hero back and forth is a hit.
 */
export function getCachedSharepicRender(variantId: string, version: number | null): string | null {
  return thumbCache.get(cacheKeyFor(variantId, version)) ?? null;
}

function trimCache(): void {
  while (thumbCache.size > THUMB_CACHE_MAX) {
    const oldest = thumbCache.keys().next().value;
    if (oldest == null) return;
    thumbCache.delete(oldest);
  }
}

/**
 * Lightweight render-once preview for the variant thumbnail strip. Unlike
 * useSharepicArtifact it has NO version stepper, NO rehydration fetch and NO
 * thumbnail-upload side effects — just the current head image, cached.
 */
export function useSharepicThumbnail(variant: SharepicVariant): {
  imageBase64: string | null;
  failed: boolean;
} {
  const live = useSharepicLiveStore((s) => s.entries[variant.id]);
  const cacheKey = cacheKeyFor(variant.id, live?.version ?? null);
  const [imageBase64, setImageBase64] = useState<string | null>(
    () => thumbCache.get(cacheKey) ?? null
  );
  const [failed, setFailed] = useState(false);

  const renderInput = live?.state ?? variant.initialProps;

  useEffect(() => {
    const cached = thumbCache.get(cacheKey);
    if (cached) {
      setImageBase64(cached);
      return undefined;
    }
    const renderFn = useChatConfigStore.getState().renderSharepic;
    if (!renderFn) {
      setFailed(true);
      return undefined;
    }
    let cancelled = false;
    renderFn(variant.canvasType, renderInput)
      .then((dataUrl) => {
        if (cancelled) return;
        if (dataUrl) {
          thumbCache.set(cacheKey, dataUrl);
          trimCache();
          setImageBase64(dataUrl);
          setFailed(false);
        } else {
          setFailed(true);
        }
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [cacheKey, variant.canvasType, renderInput]);

  return { imageBase64, failed };
}
