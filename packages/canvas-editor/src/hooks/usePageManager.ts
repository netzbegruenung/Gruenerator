/**
 * usePageManager - Hook for multi-page canvas management
 *
 * Each page can have a different template type, enabling documents
 * that mix Zitat, Dreizeilen, Info slides, etc.
 *
 * Page structure always lives in a Y.Doc (see collab/pagesDoc.ts): the
 * host-supplied collaborative doc, or a local one this hook owns. One code
 * path for both modes means duplicate/move/undo behave identically and
 * layers survive page operations everywhere.
 *
 * Selection is tracked by page ID, not index — deleting or reordering pages
 * (locally or remotely) never silently retargets the selection.
 */

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { v4 as uuid } from 'uuid';
import * as Y from 'yjs';

import { useYjsPages } from '../collab/useYjsPages';
import { readPages } from '../collab/pagesDoc';
import { loadCanvasConfig, isValidCanvasType } from '../configs/configLoader';
import { extractInheritablePageState } from '../configs/pageInheritance';

import type { CanvasConfigId, HeterogeneousPage, FullCanvasConfig } from '../configs/types';

/** Pre-populated page definition for initializing multi-page with content */
export interface InitialPageDef {
  configId: CanvasConfigId;
  state: Record<string, unknown>;
  /**
   * Stable page id. Keep it when the source already addresses pages by id
   * (chat deck patches, server seeds) — dropping it would break that
   * addressing; omitted ids get deterministic `seed-<index>` fallbacks.
   */
  id?: string;
  /** Free-element layers (deck restore from gallery drafts). */
  layers?: Array<Record<string, unknown>>;
  config?: Record<string, unknown>;
}

/**
 * Validate persisted/external page JSON (initial_state.pages, gallery deck
 * drafts) into InitialPageDef[] — the shared parser for every restore entry
 * point, so id/layers/config survive uniformly.
 */
export function parseInitialPages(raw: unknown): InitialPageDef[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const pages: InitialPageDef[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const p = entry as Record<string, unknown>;
    if (typeof p.configId !== 'string' || !p.state || typeof p.state !== 'object') continue;
    pages.push({
      configId: p.configId as CanvasConfigId,
      state: p.state as Record<string, unknown>,
      ...(typeof p.id === 'string' ? { id: p.id } : {}),
      ...(Array.isArray(p.layers) ? { layers: p.layers as Array<Record<string, unknown>> } : {}),
      ...(p.config && typeof p.config === 'object'
        ? { config: p.config as Record<string, unknown> }
        : {}),
    });
  }
  return pages.length > 0 ? pages : undefined;
}

export interface UsePageManagerOptions {
  initialConfigId: CanvasConfigId;
  initialProps: Record<string, unknown>;
  maxPages?: number;
  /** Pre-populated pages — when provided, overrides single-page initialization from initialProps */
  initialPages?: InitialPageDef[];
  /**
   * When provided, the pages list is backed by the host's collaborative
   * Y.Doc. Pages from the Y.Doc shadow `initialProps`/`initialPages` — those
   * only seed the doc on first load. Without this option the hook owns a
   * local Y.Doc with identical semantics (minus remote peers).
   */
  collaborative?: {
    ydoc: Y.Doc;
    isSynced: boolean;
  };
}

export interface UsePageManagerReturn {
  pages: HeterogeneousPage[];
  currentPageIndex: number;
  setCurrentPageIndex: (index: number) => void;
  currentPage: HeterogeneousPage | undefined;
  addPage: (
    configId: CanvasConfigId,
    inheritBackground?: boolean,
    stateOverrides?: Record<string, unknown>
  ) => Promise<void>;
  duplicateCurrentPage: () => void;
  duplicatePage: (id: string) => void;
  movePage: (id: string, direction: 'up' | 'down') => void;
  removePage: (id: string) => void;
  updatePageState: (id: string, partial: Record<string, unknown>) => void;
  /** Convert an existing page to another template (keeps id, position, layers). */
  setPageConfig: (id: string, configId: CanvasConfigId) => Promise<void>;
  canAddMore: boolean;
  pageCount: number;
  getConfigForPage: (configId: CanvasConfigId) => Promise<FullCanvasConfig>;
  loadedConfigs: Map<CanvasConfigId, FullCanvasConfig>;
  isLoadingConfig: boolean;
  /** The Y.Doc backing the pages list (host's in collab mode, local otherwise). */
  pagesDoc: Y.Doc;
  /** Returns the page's Y.Map for that index (layers/config/state binding). */
  getPageYMap: (index: number) => Y.Map<unknown> | null;
  /** Undo the last page-level operation (add/remove/duplicate/move). */
  undoPageOp: () => void;
  /** Redo the most recently undone page-level operation. */
  redoPageOp: () => void;
  canUndoPageOp: boolean;
  canRedoPageOp: boolean;
}

/**
 * The page to select after removing `removedId`: the current page if it
 * survives, otherwise the removed page's follower (or the new last page).
 */
export function nextPageIdAfterRemoval(
  pages: Array<{ id: string }>,
  removedId: string,
  currentId: string | null
): string | null {
  const survivors = pages.filter((p) => p.id !== removedId);
  if (survivors.length === 0) return null;
  if (currentId !== null && currentId !== removedId && survivors.some((p) => p.id === currentId)) {
    return currentId;
  }
  const removedIndex = pages.findIndex((p) => p.id === removedId);
  const fallbackIndex = Math.min(Math.max(removedIndex, 0), survivors.length - 1);
  return survivors[fallbackIndex].id;
}

export function usePageManager({
  initialConfigId,
  initialProps,
  maxPages = 10,
  initialPages,
  collaborative,
}: UsePageManagerOptions): UsePageManagerReturn {
  // Config cache - loaded configs are stored here to avoid re-fetching
  const configCacheRef = useRef<Map<CanvasConfigId, FullCanvasConfig>>(new Map());
  const [isLoadingConfig, setIsLoadingConfig] = useState(false);

  // Non-collab editors own a local Y.Doc so page structure, undo and layer
  // cloning run through the exact same pagesDoc code path as collab.
  // Not destroyed on unmount: StrictMode double-mounts would hand the second
  // mount a dead doc; an unreferenced local Y.Doc is plain GC-able.
  const localDocRef = useRef<Y.Doc | null>(null);
  if (!collaborative && localDocRef.current === null) {
    localDocRef.current = new Y.Doc();
  }

  const ydoc = collaborative?.ydoc ?? (localDocRef.current as Y.Doc);
  const isSynced = collaborative ? collaborative.isSynced : true;

  const yjsPages = useYjsPages(ydoc, isSynced);

  // seedIfEmpty early-returns once pages exist (or the doc carries the
  // server-seed watermark), so re-runs from changing initialProps identity
  // are harmless.
  useEffect(() => {
    if (!yjsPages || yjsPages.isSeeded) return;
    const seed =
      initialPages && initialPages.length > 0
        ? initialPages.map((def) => ({
            configId: def.configId,
            state: def.state,
            ...(def.id ? { id: def.id } : {}),
            ...(def.layers ? { layers: def.layers } : {}),
            ...(def.config ? { config: def.config } : {}),
          }))
        : [{ configId: initialConfigId, state: initialProps }];
    yjsPages.seedIfEmpty(seed);
  }, [yjsPages, initialPages, initialConfigId, initialProps]);

  // View identity is preserved by useYjsPages for untouched pages; mirror
  // that here so memo'd PageWrappers only re-render for pages that changed.
  const pageCacheRef = useRef(new Map<string, { view: unknown; page: HeterogeneousPage }>());
  const prevPagesRef = useRef<HeterogeneousPage[]>([]);
  const pages: HeterogeneousPage[] = useMemo(() => {
    if (!yjsPages) return [];
    const cache = pageCacheRef.current;
    const next = yjsPages.pages.map((view) => {
      const cached = cache.get(view.id);
      if (cached && cached.view === view) return cached.page;
      const page: HeterogeneousPage = {
        id: view.id,
        configId: view.configId as CanvasConfigId,
        state: view.state,
      };
      cache.set(view.id, { view, page });
      return page;
    });
    const ids = new Set(next.map((p) => p.id));
    for (const id of cache.keys()) {
      if (!ids.has(id)) cache.delete(id);
    }
    const prev = prevPagesRef.current;
    const unchanged = prev.length === next.length && prev.every((p, i) => p === next[i]);
    const result = unchanged ? prev : next;
    prevPagesRef.current = result;
    return result;
  }, [yjsPages]);

  const [currentPageId, setCurrentPageId] = useState<string | null>(null);
  const currentPageIndex = useMemo(() => {
    if (currentPageId === null) return 0;
    const idx = pages.findIndex((p) => p.id === currentPageId);
    return idx >= 0 ? idx : 0;
  }, [pages, currentPageId]);

  // When the selected page disappears (remote delete, undo), fall back to the
  // page now occupying the last known position instead of index-drifting.
  const lastIndexRef = useRef(0);
  lastIndexRef.current = currentPageIndex;
  useEffect(() => {
    if (pages.length === 0) return;
    if (currentPageId === null || !pages.some((p) => p.id === currentPageId)) {
      const fallback = pages[Math.min(lastIndexRef.current, pages.length - 1)];
      setCurrentPageId(fallback.id);
    }
  }, [pages, currentPageId]);

  const setCurrentPageIndex = useCallback(
    (index: number) => {
      const page = pages[index];
      if (page) setCurrentPageId(page.id);
    },
    [pages]
  );

  const canAddMore = pages.length < maxPages;

  /**
   * Load a config by ID, using cache if available
   */
  const getConfigForPage = useCallback(
    async (configId: CanvasConfigId): Promise<FullCanvasConfig> => {
      const cached = configCacheRef.current.get(configId);
      if (cached) {
        return cached;
      }

      if (!isValidCanvasType(configId)) {
        throw new Error(`Invalid config type: ${configId}`);
      }

      setIsLoadingConfig(true);
      try {
        const config = await loadCanvasConfig(configId);
        configCacheRef.current.set(configId, config);
        return config;
      } finally {
        setIsLoadingConfig(false);
      }
    },
    []
  );

  /**
   * Add a new page with a specific template
   * @param configId - The template type for the new page
   * @param inheritBackground - Whether to copy background/scheme from current page
   */
  const addPage = useCallback(
    async (
      configId: CanvasConfigId,
      inheritBackground = true,
      stateOverrides?: Record<string, unknown>
    ) => {
      if (!canAddMore || !yjsPages) return;

      const config = await getConfigForPage(configId);

      // Read the source page from the live doc — the React view in this
      // closure is a pre-await snapshot and misses remote edits that landed
      // while the config chunk loaded.
      const liveViews = readPages(ydoc);
      const sourcePage =
        liveViews.find((p) => p.id === currentPageId) ?? liveViews[liveViews.length - 1];
      const inherited =
        inheritBackground && sourcePage ? extractInheritablePageState(sourcePage.state) : {};

      const newPageState = config.createInitialState({
        ...(config.multiPage?.defaultNewPageState || {}),
        ...inherited,
        ...stateOverrides,
      });

      const id = uuid();
      yjsPages.addPage({ id, configId, state: newPageState });
      setCurrentPageId(id);
    },
    [canAddMore, yjsPages, ydoc, currentPageId, getConfigForPage]
  );

  /**
   * Duplicate a page (same template, same content, same layers).
   * Inserts right after the source and selects the copy.
   */
  const duplicatePage = useCallback(
    (id: string) => {
      if (!canAddMore || !yjsPages) return;
      const newId = yjsPages.duplicatePage(id);
      if (newId) setCurrentPageId(newId);
    },
    [canAddMore, yjsPages]
  );

  const duplicateCurrentPage = useCallback(() => {
    if (currentPageId) duplicatePage(currentPageId);
  }, [currentPageId, duplicatePage]);

  /**
   * Move a page up or down in the order. Selection follows the id, so no
   * index bookkeeping is needed.
   */
  const movePage = useCallback(
    (id: string, direction: 'up' | 'down') => {
      yjsPages?.movePage(id, direction);
    },
    [yjsPages]
  );

  /**
   * Remove a page by ID
   */
  const removePage = useCallback(
    (id: string) => {
      if (!yjsPages || pages.length <= 1) return;
      const nextId = nextPageIdAfterRemoval(pages, id, currentPageId);
      yjsPages.removePage(id);
      setCurrentPageId(nextId);
    },
    [yjsPages, pages, currentPageId]
  );

  /**
   * Update a specific page's state
   */
  const updatePageState = useCallback(
    (id: string, partial: Record<string, unknown>) => {
      yjsPages?.updatePageState(id, partial);
    },
    [yjsPages]
  );

  /**
   * Convert an existing page to another template. Free elements (layers)
   * stay; template state is rebuilt from the new config with the shared
   * inheritance contract applied.
   */
  const setPageConfig = useCallback(
    async (id: string, configId: CanvasConfigId) => {
      if (!yjsPages) return;
      const source = readPages(ydoc).find((p) => p.id === id);
      if (!source || source.configId === configId) return;
      const config = await getConfigForPage(configId);
      const newState = config.createInitialState({
        ...(config.multiPage?.defaultNewPageState || {}),
        ...extractInheritablePageState(source.state),
      });
      yjsPages.setPageConfig(id, configId, newState);
    },
    [yjsPages, ydoc, getConfigForPage]
  );

  const getPageYMap = useCallback(
    (index: number): Y.Map<unknown> | null => {
      if (!yjsPages) return null;
      const view = yjsPages.pages[index];
      return view ? view.yMap : null;
    },
    [yjsPages]
  );

  const currentPage = useMemo(() => pages[currentPageIndex], [pages, currentPageIndex]);

  // Expose loaded configs map for components that need it
  const loadedConfigs = useMemo(() => configCacheRef.current, []);

  const noopUndo = useCallback(() => {}, []);
  const undoPageOp = yjsPages?.undoPageOp ?? noopUndo;
  const redoPageOp = yjsPages?.redoPageOp ?? noopUndo;
  const canUndoPageOp = yjsPages?.canUndoPageOp ?? false;
  const canRedoPageOp = yjsPages?.canRedoPageOp ?? false;

  return {
    pages,
    currentPageIndex,
    setCurrentPageIndex,
    currentPage,
    addPage,
    duplicateCurrentPage,
    duplicatePage,
    movePage,
    removePage,
    updatePageState,
    setPageConfig,
    canAddMore,
    pageCount: pages.length,
    getConfigForPage,
    loadedConfigs,
    isLoadingConfig,
    pagesDoc: ydoc,
    getPageYMap,
    undoPageOp,
    redoPageOp,
    canUndoPageOp,
    canRedoPageOp,
  };
}
