import { useState, useCallback, useEffect, useRef } from 'react';

import { useChatConfigStore } from '../stores/chatConfigStore';
import { useSharepicLiveStore } from '../stores/sharepicLiveStore';

import { maybeUploadThumbnail, type SharepicVersionEntry } from './useSharepicArtifact';

import type { SharepicVariant } from './useChatGraphStream';

/**
 * Deck sibling of useSharepicArtifact: live rendering, slide pager, version
 * stepping and ZIP download for a multi-page slider variant. Card and docked
 * panel share the same sharepicLiveStore entry, so SSE updates reach both.
 */
export function useSliderDeckArtifact(variant: SharepicVariant) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [isRendering, setIsRendering] = useState(true);
  const [renderError, setRenderError] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [versions, setVersions] = useState<SharepicVersionEntry[] | null>(null);
  /** Version being previewed via the stepper; null = current head. */
  const [viewVersion, setViewVersion] = useState<number | null>(null);
  const [viewPages, setViewPages] = useState<Array<Record<string, unknown>> | null>(null);
  // Render cache: epoch bumps whenever the page set changes, invalidating
  // all cached slide renders at once.
  const renderCache = useRef(new Map<string, string>());
  const epochRef = useRef(0);
  const versionPagesCache = useRef(new Map<number, Array<Record<string, unknown>>>());
  const hydratedRef = useRef(false);

  const live = useSharepicLiveStore((s) => s.entries[variant.id]);
  const isActiveForChat = useSharepicLiveStore((s) => s.activeVariant?.variantId === variant.id);

  const canvasId = live?.canvasId ?? variant.canvasId ?? null;
  const headVersion = live?.version ?? null;
  const livePages = live?.pages ?? null;
  const headPages = livePages ?? variant.pages ?? [];
  const pages = viewPages ?? headPages;
  const slideCount = pages.length;
  const safeIndex = Math.min(selectedIndex, Math.max(0, slideCount - 1));

  useEffect(() => {
    epochRef.current += 1;
  }, [pages]);

  const renderSlide = useCallback(
    async (index: number): Promise<string | null> => {
      const pageState = pages[index];
      if (!pageState) return null;
      const key = `${epochRef.current}:${index}`;
      const cached = renderCache.current.get(key);
      if (cached) return cached;
      const renderFn = useChatConfigStore.getState().renderSharepic;
      if (!renderFn) return null;
      const dataUrl = await renderFn(variant.canvasType, pageState);
      if (dataUrl) renderCache.current.set(key, dataUrl);
      return dataUrl;
    },
    [pages, variant.canvasType]
  );

  // Render the selected slide (and re-render after chat edits / version steps).
  useEffect(() => {
    let cancelled = false;
    if (slideCount === 0) {
      setRenderError(true);
      setIsRendering(false);
      return undefined;
    }
    setIsRendering(true);
    renderSlide(safeIndex)
      .then((dataUrl) => {
        if (cancelled) return;
        if (dataUrl) {
          setImageBase64(dataUrl);
          setRenderError(false);
          if (safeIndex === 0) maybeUploadThumbnail(variant.id, dataUrl, viewPages != null);
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
  }, [renderSlide, safeIndex, slideCount, variant.id, viewPages]);

  // Thread-reload rehydration: a deck renders its CURRENT pages (which may
  // have changed in the studio), not the stale generation-time pages.
  useEffect(() => {
    if (!canvasId || hydratedRef.current || livePages) return;
    const fetchState = useChatConfigStore.getState().fetchSharepicState;
    if (!fetchState) return;
    hydratedRef.current = true;
    void fetchState(canvasId).then((result) => {
      if (!result?.pages || result.pages.length === 0) return;
      useSharepicLiveStore.getState().upsertEntry(variant.id, {
        canvasId,
        canvasType: variant.canvasType,
        version: result.version,
        state: null,
        pages: result.pages,
      });
    });
  }, [canvasId, livePages, variant.id, variant.canvasType]);

  // New head version (chat edit applied) → drop any stale version preview.
  useEffect(() => {
    setViewVersion(null);
    setViewPages(null);
    setVersions(null);
  }, [headVersion]);

  const selectSlide = useCallback(
    (index: number) => {
      setSelectedIndex(Math.min(Math.max(index, 0), Math.max(0, slideCount - 1)));
    },
    [slideCount]
  );

  const loadVersions = useCallback(async (): Promise<SharepicVersionEntry[]> => {
    if (versions) return versions;
    const fetchVersions = useChatConfigStore.getState().fetchSharepicVersions;
    if (!canvasId || !fetchVersions) return [];
    const list = await fetchVersions(canvasId).catch(() => []);
    const entries = list.map((v) => ({ version: v.version, summary: v.summary }));
    setVersions(entries);
    return entries;
  }, [canvasId, versions]);

  const extractVersionPages = (
    state: Record<string, unknown> | null
  ): Array<Record<string, unknown>> | null => {
    const raw = state?.pages;
    if (!Array.isArray(raw) || raw.length === 0) return null;
    // Version snapshots store full PageDefs ({id, configId, state}).
    return raw.map((p) =>
      p && typeof p === 'object' && 'state' in (p as object)
        ? ((p as { state: Record<string, unknown> }).state ?? {})
        : ((p as Record<string, unknown>) ?? {})
    );
  };

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
        setViewPages(null);
        return;
      }
      const cached = versionPagesCache.current.get(target.version);
      if (cached) {
        setViewVersion(target.version);
        setViewPages(cached);
        return;
      }
      const fetchVersionState = useChatConfigStore.getState().fetchSharepicVersionState;
      if (!fetchVersionState) return;
      const state = await fetchVersionState(canvasId, target.version).catch(() => null);
      const versionPages = extractVersionPages(state);
      if (versionPages) {
        versionPagesCache.current.set(target.version, versionPages);
        setViewVersion(target.version);
        setViewPages(versionPages);
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
      const restoredPages = extractVersionPages(result.state);
      useSharepicLiveStore.getState().upsertEntry(variant.id, {
        canvasId,
        canvasType: variant.canvasType,
        version: result.version,
        state: null,
        ...(restoredPages ? { pages: restoredPages } : {}),
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
        pages: headPages,
        ...(variant.label ? { label: variant.label } : {}),
      });
    }
  }, [variant.id, variant.canvasType, variant.initialProps, variant.label, canvasId, headPages]);

  const downloadZip = useCallback(async () => {
    const zip = useChatConfigStore.getState().downloadSharepicZip;
    if (!zip || slideCount === 0 || isExporting) return;
    setIsExporting(true);
    try {
      const images: string[] = [];
      for (let i = 0; i < slideCount; i++) {
        const dataUrl = await renderSlide(i);
        if (dataUrl) images.push(dataUrl);
      }
      if (images.length > 0) await zip(images, variant.canvasType);
    } catch (err) {
      console.warn('[useSliderDeckArtifact] ZIP-Export fehlgeschlagen:', err);
    } finally {
      setIsExporting(false);
    }
  }, [slideCount, isExporting, renderSlide, variant.canvasType]);

  const openInStudio = useCallback(() => {
    useChatConfigStore.getState().onEditSharepic?.({
      ...variant,
      ...(canvasId ? { canvasId } : {}),
    });
  }, [variant, canvasId]);

  const showStepper = canvasId != null && headVersion != null && headVersion > 1;

  return {
    imageBase64,
    isRendering,
    renderError,
    isExporting,
    canvasId,
    slideCount,
    selectedIndex: safeIndex,
    selectSlide,
    headVersion,
    viewVersion,
    isActiveForChat,
    showStepper,
    canDownloadZip: useChatConfigStore.getState().downloadSharepicZip != null,
    stepToVersion,
    restoreViewVersion,
    toggleActive,
    downloadZip,
    openInStudio,
  };
}
