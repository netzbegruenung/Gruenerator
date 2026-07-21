import { useState, useCallback, useEffect, useRef } from 'react';

import { useAgentStore } from '../stores/chatStore';
import { useChatConfigStore } from '../stores/chatConfigStore';
import { useSharepicLiveStore } from '../stores/sharepicLiveStore';

import { getCachedSharepicRender, seedThumbnailCache } from './useSharepicThumbnail';

import type { SharepicVariant } from './useChatGraphStream';

export interface SharepicVersionEntry {
  version: number;
  summary: string | null;
}

const FALLBACK_LABELS: Record<string, string> = {
  dreizeilen: 'Dreizeiler',
  'zitat-pure': 'Zitat',
  zitat: 'Zitat',
  info: 'Info',
  simple: 'Sharepic',
  veranstaltung: 'Veranstaltung',
  slider: 'Slider',
  freeform: 'Freeform',
};

export function sharepicLabel(variant: Pick<SharepicVariant, 'label' | 'canvasType'>): string {
  return variant.label ?? FALLBACK_LABELS[variant.canvasType] ?? 'Sharepic';
}

/**
 * After a real edit (entry is thumbnail-dirty) the freshly rendered head PNG
 * doubles as the canvas thumbnail. Version previews never qualify, and the
 * flag is cleared up front — a failed upload is not worth a retry loop.
 * Clearing is synchronous, so when card and panel render the same variant
 * concurrently only the first completed render uploads.
 */
export function maybeUploadThumbnail(
  variantId: string,
  dataUrl: string,
  isVersionPreview: boolean
) {
  if (isVersionPreview) return;
  const store = useSharepicLiveStore.getState();
  const entry = store.entries[variantId];
  if (!entry?.thumbnailDirty || !entry.canvasId) return;
  const upload = useChatConfigStore.getState().updateSharepicThumbnail;
  if (!upload) return;
  store.clearThumbnailDirty(variantId);
  upload(entry.canvasId, dataUrl).catch((err) => {
    console.warn('[useSharepicArtifact] Thumbnail-Update fehlgeschlagen:', err);
  });
}

/**
 * Shared live-rendering + version logic for a chat sharepic variant. Used by
 * the inline message card AND the docked artifact panel — both render from
 * the same sharepicLiveStore entry, so SSE updates reach them identically.
 */
export function useSharepicArtifact(variant: SharepicVariant) {
  const live = useSharepicLiveStore((s) => s.entries[variant.id]);
  const isActiveForChat = useSharepicLiveStore((s) => s.activeVariant?.variantId === variant.id);

  // Cache-first initial paint: the version-keyed render cache (shared with the
  // thumbnail strip) already holds the full-res head render, so a remount —
  // hero switch (keyed by variant id) or thread re-open — paints instantly
  // instead of showing a spinner through a fresh Konva render.
  const initialCached = getCachedSharepicRender(variant.id, live?.version ?? null);
  const [imageBase64, setImageBase64] = useState<string | null>(initialCached);
  const [isRendering, setIsRendering] = useState(initialCached == null);
  const [renderError, setRenderError] = useState(false);
  const [versions, setVersions] = useState<SharepicVersionEntry[] | null>(null);
  /** Version being previewed via the stepper; null = current head. */
  const [viewVersion, setViewVersion] = useState<number | null>(null);
  const [viewState, setViewState] = useState<Record<string, unknown> | null>(null);
  const versionStateCache = useRef(new Map<number, Record<string, unknown>>());
  const hydratedRef = useRef(false);

  const canvasId = live?.canvasId ?? variant.canvasId ?? null;
  const headVersion = live?.version ?? null;
  const renderInput = viewState ?? live?.state ?? variant.initialProps;

  // Render (and re-render after each chat edit / version step). renderInput
  // is the full flat state — StandaloneCanvas's createInitialState accepts it
  // in place of the original initialProps.
  //
  // Cache-first: during streaming the message metadata (and with it the
  // variant/renderInput identity) is recreated on every SSE tick, re-running
  // this effect. A version-keyed cache hit resolves those runs without
  // touching Konva — only a real content change (version bump / first render
  // / version preview) pays for a render.
  useEffect(() => {
    if (viewState == null) {
      const cached = getCachedSharepicRender(variant.id, headVersion);
      if (cached) {
        setImageBase64(cached);
        setRenderError(false);
        setIsRendering(false);
        return undefined;
      }
    }
    let cancelled = false;
    const renderFn = useChatConfigStore.getState().renderSharepic;
    if (!renderFn) {
      setRenderError(true);
      setIsRendering(false);
      return undefined;
    }
    setIsRendering(true);
    renderFn(variant.canvasType, renderInput)
      .then((dataUrl) => {
        if (cancelled) return;
        if (dataUrl) {
          setImageBase64(dataUrl);
          setRenderError(false);
          maybeUploadThumbnail(variant.id, dataUrl, viewState != null);
          // Head renders double as strip thumbnails (version previews don't).
          if (viewState == null) seedThumbnailCache(variant.id, dataUrl);
        } else {
          setRenderError(true);
        }
      })
      .catch(() => {
        if (!cancelled) setRenderError(true);
      })
      .finally(() => {
        if (!cancelled) setIsRendering(false);
      });
    return () => {
      cancelled = true;
    };
  }, [variant.canvasType, variant.id, renderInput, viewState, headVersion]);

  // Thread-reload rehydration: a minted variant renders its CURRENT state
  // (which may have changed in the studio), not the stale initialProps.
  useEffect(() => {
    if (!canvasId || hydratedRef.current || live?.state) return;
    const fetchState = useChatConfigStore.getState().fetchSharepicState;
    if (!fetchState) return;
    hydratedRef.current = true;
    void fetchState(canvasId).then((result) => {
      if (!result) return;
      useSharepicLiveStore.getState().upsertEntry(variant.id, {
        canvasId,
        canvasType: variant.canvasType,
        version: result.version,
        state: result.state,
      });
    });
  }, [canvasId, live?.state, variant.id, variant.canvasType]);

  // New head version (chat edit applied) → drop any stale version preview.
  useEffect(() => {
    setViewVersion(null);
    setViewState(null);
    setVersions(null);
  }, [headVersion]);

  const loadVersions = useCallback(async (): Promise<SharepicVersionEntry[]> => {
    if (versions) return versions;
    const fetchVersions = useChatConfigStore.getState().fetchSharepicVersions;
    if (!canvasId || !fetchVersions) return [];
    const list = await fetchVersions(canvasId).catch(() => []);
    const entries = list.map((v) => ({ version: v.version, summary: v.summary }));
    setVersions(entries);
    return entries;
  }, [canvasId, versions]);

  const stepToVersion = useCallback(
    async (direction: -1 | 1) => {
      if (!canvasId) return;
      const list = await loadVersions();
      if (list.length < 2) return;
      const ordered = [...list].sort((a, b) => a.version - b.version);
      const currentIdx =
        viewVersion == null
          ? ordered.length - 1
          : ordered.findIndex((v) => v.version === viewVersion);
      const nextIdx = Math.min(Math.max(currentIdx + direction, 0), ordered.length - 1);
      const target = ordered[nextIdx];
      if (!target) return;
      if (nextIdx === ordered.length - 1) {
        setViewVersion(null);
        setViewState(null);
        return;
      }
      const cached = versionStateCache.current.get(target.version);
      if (cached) {
        setViewVersion(target.version);
        setViewState(cached);
        return;
      }
      const fetchVersionState = useChatConfigStore.getState().fetchSharepicVersionState;
      if (!fetchVersionState) return;
      const state = await fetchVersionState(canvasId, target.version).catch(() => null);
      if (state) {
        versionStateCache.current.set(target.version, state);
        setViewVersion(target.version);
        setViewState(state);
      }
    },
    [canvasId, loadVersions, viewVersion]
  );

  const restoreViewVersion = useCallback(async () => {
    if (!canvasId || viewVersion == null) return;
    const restore = useChatConfigStore.getState().restoreSharepicVersion;
    if (!restore) return;
    const result = await restore(canvasId, viewVersion).catch(() => null);
    if (result) {
      useSharepicLiveStore.getState().upsertEntry(variant.id, {
        canvasId,
        canvasType: variant.canvasType,
        version: result.version,
        state: result.state,
        thumbnailDirty: true,
      });
    }
  }, [canvasId, viewVersion, variant.id, variant.canvasType]);

  const toggleActive = useCallback(() => {
    const store = useSharepicLiveStore.getState();
    if (store.activeVariant?.variantId === variant.id) {
      store.setActiveVariant(null);
    } else {
      store.setActiveVariant({
        variantId: variant.id,
        canvasId,
        canvasType: variant.canvasType,
        initialProps: variant.initialProps,
        ...(variant.label ? { label: variant.label } : {}),
      });
    }
  }, [variant.id, variant.canvasType, variant.initialProps, variant.label, canvasId]);

  const download = useCallback(() => {
    if (!imageBase64) return;
    const link = document.createElement('a');
    link.href = imageBase64;
    link.download = `sharepic-${variant.canvasType}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [imageBase64, variant.canvasType]);

  const openInStudio = useCallback(() => {
    const threadId = useAgentStore.getState().currentThreadId;
    useChatConfigStore.getState().onEditSharepic?.(
      {
        ...variant,
        initialProps: live?.state ?? variant.initialProps,
        ...(canvasId ? { canvasId } : {}),
      },
      { threadId }
    );
  }, [variant, live?.state, canvasId]);

  const showStepper = canvasId != null && headVersion != null && headVersion > 1;

  return {
    imageBase64,
    isRendering,
    renderError,
    canvasId,
    headVersion,
    viewVersion,
    isActiveForChat,
    showStepper,
    label: sharepicLabel(variant),
    stepToVersion,
    restoreViewVersion,
    toggleActive,
    download,
    openInStudio,
  };
}
