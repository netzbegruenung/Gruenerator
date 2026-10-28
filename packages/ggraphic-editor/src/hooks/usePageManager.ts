// SPDX-License-Identifier: MPL-2.0
/**
 * usePageManager - Hook for multi-page canvas management
 *
 * Each page can have a different template type, enabling documents
 * that mix quote, headline and info slides, etc.
 *
 * Page structure always lives in a Y.Doc (see collab/pagesDoc.ts): the
 * host-supplied collaborative doc, or a local one this hook owns. One code
 * path for both modes means duplicate/move/undo behave identically.
 *
 * Selection is tracked by page ID, not index — deleting or reordering pages
 * (locally or remotely) never silently retargets the selection.
 */

import { migrateDocument, type DocumentRefusal } from '@ggraphic/schema';
import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { v4 as uuid } from 'uuid';
import * as Y from 'yjs';

import { readPages } from '@ggraphic/editor/collab/pagesDoc';
import { extractInheritablePageState } from '@ggraphic/editor/configs/pageInheritance';
import { messages } from '@ggraphic/editor/i18n/messages';
import { getTemplate, type TemplateId } from '@ggraphic/editor/templates/registry';

import { hostEmittedStateKeys } from '../collab/pageElementStateKeys.js';
import { useYjsPages, type NormalizeEcho, type YjsPagesApi } from '../collab/useYjsPages.js';
import { loadCanvasConfig } from '../configs/configLoader.js';

import type { HeterogeneousPage, FullCanvasConfig } from '../configs/types.js';

/** Pre-populated page definition for initializing multi-page with content */
export interface InitialPageDef<TId extends string = TemplateId> {
  configId: TId;
  state: Record<string, unknown>;
  /**
   * Stable page id. Keep it when the source already addresses pages by id
   * (chat deck patches, server seeds) — dropping it would break that
   * addressing; omitted ids get deterministic `seed-<index>` fallbacks.
   */
  id?: string;
  config?: Record<string, unknown>;
}

/**
 * Validate persisted/external page JSON (initial_state.pages, gallery deck
 * drafts) into InitialPageDef[] — the shared parser for every restore entry
 * point, so id/config survive uniformly.
 */
export function parseInitialPages(raw: unknown): InitialPageDef[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const pages: InitialPageDef[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const p = entry as Record<string, unknown>;
    if (typeof p.configId !== 'string' || !p.state || typeof p.state !== 'object') continue;
    pages.push({
      configId: p.configId,
      state: p.state as Record<string, unknown>,
      ...(typeof p.id === 'string' ? { id: p.id } : {}),
      ...(p.config && typeof p.config === 'object'
        ? { config: p.config as Record<string, unknown> }
        : {}),
    });
  }
  return pages.length > 0 ? pages : undefined;
}

/**
 * A stored initial document (a host's saved canvas state: `{ pages, … }`,
 * optionally versioned) read through `migrateDocument` into seed pages. A
 * document from a newer build, or a malformed envelope, comes back as a
 * refusal and no pages: the host opens it read-only, and nothing is seeded
 * from it.
 */
export function readInitialDocument(raw: unknown): {
  pages: InitialPageDef[] | null;
  refusal: DocumentRefusal | null;
} {
  const result = migrateDocument(raw);
  if (result.status === 'newer' || result.status === 'invalid') {
    return { pages: null, refusal: result };
  }
  return { pages: parseInitialPages(result.document.pages) ?? null, refusal: null };
}

export interface UsePageManagerOptions<TId extends string = TemplateId> {
  initialConfigId: TId;
  /** The canvas document's format; freeform pages are laid out on it. */
  formatId?: string;
  initialProps: Record<string, unknown>;
  maxPages?: number;
  /** Sagt Seitenänderungen an (`useAnnounce`); ohne Angabe bleibt der Hook stumm. */
  announce?: (text: string) => void;
  /** Pre-populated pages — when provided, overrides single-page initialization from initialProps */
  initialPages?: InitialPageDef<TId>[];
  /**
   * When provided, the pages list is backed by the host's collaborative
   * Y.Doc. Pages from the Y.Doc shadow `initialProps`/`initialPages` — those
   * only seed the doc on first load. Without this option the hook owns a
   * local Y.Doc with identical semantics (minus remote peers).
   */
  collaborative?: {
    ydoc: Y.Doc;
    isSynced: boolean;
    /**
     * Show `initialPages`/`initialProps` until the doc has synced. Only for a
     * canvas that was just created: `initial_state` does not follow edits made
     * in the editor, so on a reopened canvas it would flash a stale deck
     * before the live one replaces it.
     */
    previewBeforeSync?: boolean;
    /**
     * The doc already holds the local (IndexedDB) cache. Its pages are shown
     * read-only until the sync; they may lag the server, so nothing writes
     * to them.
     */
    isLocalLoaded?: boolean;
  };
}

export interface UsePageManagerReturn<TId extends string = TemplateId> {
  pages: HeterogeneousPage<TId>[];
  currentPageIndex: number;
  setCurrentPageIndex: (index: number) => void;
  currentPage: HeterogeneousPage<TId> | undefined;
  addPage: (
    configId: TId,
    inheritBackground?: boolean,
    stateOverrides?: Record<string, unknown>
  ) => Promise<void>;
  duplicateCurrentPage: () => void;
  duplicatePage: (id: string) => void;
  movePage: (id: string, direction: 'up' | 'down') => void;
  removePage: (id: string) => void;
  updatePageState: (id: string, partial: Record<string, unknown>) => void;
  /** Convert an existing page to another template (keeps id, position). */
  setPageConfig: (id: string, configId: TId) => Promise<void>;
  canAddMore: boolean;
  pageCount: number;
  getConfigForPage: (configId: TId) => Promise<FullCanvasConfig>;
  loadedConfigs: Map<TId, FullCanvasConfig>;
  isLoadingConfig: boolean;
  /** The Y.Doc backing the pages list (host's in collab mode, local otherwise). */
  pagesDoc: Y.Doc;
  /** Returns the page's Y.Map for that index (config/state binding). */
  getPageYMap: (index: number) => Y.Map<unknown> | null;
  /** Undo the last page-level operation (add/remove/duplicate/move). */
  undoPageOp: () => void;
  /** Redo the most recently undone page-level operation. */
  redoPageOp: () => void;
  /** Verwerfen of a replaced deck, see `YjsPagesApi['discardReplaceDeck']`. */
  discardReplaceDeck: () => void;
  /** Replace a deck's pages as ONE page-level undo step; null before the doc syncs. */
  replaceDeck: YjsPagesApi['replaceDeck'] | null;
  canUndoPageOp: boolean;
  canRedoPageOp: boolean;
  /** Pages come from the initial state or the unsynced cache: show them, edit nothing. */
  isPreview: boolean;
  /**
   * The doc carries a newer document version (or a malformed stamp): it is
   * shown as a preview and this build writes nothing to it.
   */
  schemaRefusal: DocumentRefusal | null;
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

export function usePageManager<TId extends string = TemplateId>({
  initialConfigId,
  formatId,
  initialProps,
  maxPages = 10,
  initialPages,
  collaborative,
  announce,
}: UsePageManagerOptions<TId>): UsePageManagerReturn<TId> {
  const announceRef = useRef(announce);
  announceRef.current = announce;
  // Config cache - loaded configs are stored here to avoid re-fetching
  const configCacheRef = useRef<Map<TId, FullCanvasConfig>>(new Map());
  const [isLoadingConfig, setIsLoadingConfig] = useState(false);

  // Non-collab editors own a local Y.Doc so page structure, undo and page
  // cloning run through the exact same pagesDoc code path as collab.
  // Not destroyed on unmount: StrictMode double-mounts would hand the second
  // mount a dead doc; an unreferenced local Y.Doc is plain GC-able.
  const localDocRef = useRef<Y.Doc | null>(null);
  if (!collaborative && localDocRef.current === null) {
    localDocRef.current = new Y.Doc();
  }

  const ydoc = collaborative?.ydoc ?? (localDocRef.current as Y.Doc);
  const isSynced = collaborative ? collaborative.isSynced : true;

  // What a mounted page writes back for a state it receives (GenericCanvas
  // rebuilds it through createInitialState, useEmitHostStateChanges re-emits
  // these keys) — lets a deck undo tell that echo from a real edit.
  const normalizeEcho = useCallback<NormalizeEcho>((configId, state) => {
    const config = configCacheRef.current.get(configId as TId);
    if (!config) return null;
    const rebuilt = config.createInitialState(state) as Record<string, unknown>;
    return Object.fromEntries(
      hostEmittedStateKeys()
        .filter((key) => Object.hasOwn(rebuilt, key))
        .map((key) => [key, rebuilt[key]])
    );
  }, []);

  const docPagesApi = useYjsPages(ydoc, isSynced, normalizeEcho);
  // A doc this build must not write is previewed like the unsynced cache.
  const schemaRefusal = docPagesApi?.schemaRefusal ?? null;
  const yjsPages = schemaRefusal ? null : docPagesApi;

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
            ...(def.config ? { config: def.config } : {}),
          }))
        : [{ configId: initialConfigId, state: initialProps }];
    yjsPages.seedIfEmpty(seed);
  }, [yjsPages, initialPages, initialConfigId, initialProps]);

  // View identity is preserved by useYjsPages for untouched pages; mirror
  // that here so memo'd PageWrappers only re-render for pages that changed.
  const pageCacheRef = useRef(new Map<string, { view: unknown; page: HeterogeneousPage<TId> }>());
  const prevPagesRef = useRef<HeterogeneousPage<TId>[]>([]);
  const cachedViews = useMemo(() => {
    if (schemaRefusal && docPagesApi) return docPagesApi.pages;
    return !yjsPages && collaborative?.isLocalLoaded ? readPages(ydoc) : [];
  }, [yjsPages, docPagesApi, schemaRefusal, collaborative?.isLocalLoaded, ydoc]);
  const isPreview =
    !yjsPages &&
    (collaborative?.previewBeforeSync === true || cachedViews.length > 0 || schemaRefusal !== null);
  const previewPages = useMemo((): HeterogeneousPage<TId>[] => {
    if (!isPreview) return [];
    if (cachedViews.length > 0) {
      return cachedViews.map((view, i) => ({
        id: `preview-${i}`,
        configId: view.configId as TId,
        state: view.state,
      }));
    }
    const defs =
      initialPages && initialPages.length > 0
        ? initialPages
        : [{ configId: initialConfigId, state: initialProps }];
    // Own ids: the doc's pages must mount fresh, bound to their Y.Maps.
    return defs.map((def, i) => ({
      id: `preview-${i}`,
      configId: def.configId,
      state: def.state,
    }));
  }, [isPreview, cachedViews, initialPages, initialConfigId, initialProps]);

  const docPages: HeterogeneousPage<TId>[] = useMemo(() => {
    if (!yjsPages) return [];
    const cache = pageCacheRef.current;
    const next = yjsPages.pages.map((view) => {
      const cached = cache.get(view.id);
      if (cached && cached.view === view) return cached.page;
      const page: HeterogeneousPage<TId> = {
        id: view.id,
        configId: view.configId as TId,
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
  const pages = isPreview ? previewPages : docPages;

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
    async (configId: TId): Promise<FullCanvasConfig> => {
      const cached = configCacheRef.current.get(configId);
      if (cached) {
        return cached;
      }

      if (getTemplate(configId) === undefined) {
        throw new Error(`Invalid config type: ${configId}`);
      }

      setIsLoadingConfig(true);
      try {
        // Der Loader liefert FullCanvasConfig<any, any> für heterogene Configs.
        const config = (await loadCanvasConfig(configId, formatId)) as FullCanvasConfig;
        configCacheRef.current.set(configId, config);
        return config;
      } finally {
        setIsLoadingConfig(false);
      }
    },
    [formatId]
  );

  /**
   * Add a new page with a specific template
   * @param configId - The template type for the new page
   * @param inheritBackground - Whether to copy background/scheme from current page
   */
  const addPage = useCallback(
    async (configId: TId, inheritBackground = true, stateOverrides?: Record<string, unknown>) => {
      if (!canAddMore || !yjsPages) return;

      const config = await getConfigForPage(configId);

      // Read the source page from the live doc — the React view in this
      // closure is a pre-await snapshot and misses remote edits that landed
      // while the config chunk loaded.
      const liveViews = readPages(ydoc);
      const sourcePage =
        liveViews.find((p) => p.id === currentPageId) ?? liveViews[liveViews.length - 1];
      const inherited =
        inheritBackground && sourcePage
          ? extractInheritablePageState(sourcePage.state, configId)
          : {};

      const newPageState = config.createInitialState({
        ...(config.multiPage?.defaultNewPageState || {}),
        ...inherited,
        ...stateOverrides,
      });

      const id = uuid();
      yjsPages.addPage({ id, configId, state: newPageState });
      setCurrentPageId(id);
      announceRef.current?.(messages().announce.pageAdded(liveViews.length + 1));
    },
    [canAddMore, yjsPages, ydoc, currentPageId, getConfigForPage]
  );

  /**
   * Duplicate a page (same template, same content).
   * Inserts right after the source and selects the copy.
   */
  // The per-page callbacks below go into every memo'd PageWrapper. `yjsPages`
  // gets a new identity on every Y update, so closing over it re-rendered all
  // pages (and their Stages) on each edit; they read the live values instead.
  const liveRef = useRef({ yjsPages, pages, currentPageId, canAddMore });
  liveRef.current = { yjsPages, pages, currentPageId, canAddMore };

  const duplicatePage = useCallback((id: string) => {
    const { canAddMore: canAdd, yjsPages: api } = liveRef.current;
    if (!canAdd || !api) return;
    const newId = api.duplicatePage(id);
    if (newId) {
      setCurrentPageId(newId);
      const at = liveRef.current.pages.findIndex((p) => p.id === id);
      if (at >= 0) announceRef.current?.(messages().announce.pageDuplicated(at + 1));
    }
  }, []);

  const duplicateCurrentPage = useCallback(() => {
    if (currentPageId) duplicatePage(currentPageId);
  }, [currentPageId, duplicatePage]);

  /**
   * Move a page up or down in the order. Selection follows the id, so no
   * index bookkeeping is needed.
   */
  const movePage = useCallback((id: string, direction: 'up' | 'down') => {
    liveRef.current.yjsPages?.movePage(id, direction);
  }, []);

  /**
   * Remove a page by ID
   */
  const removePage = useCallback((id: string) => {
    const { yjsPages: api, pages: livePages, currentPageId: liveCurrentId } = liveRef.current;
    if (!api || livePages.length <= 1) return;
    const nextId = nextPageIdAfterRemoval(livePages, id, liveCurrentId);
    api.removePage(id);
    setCurrentPageId(nextId);
    const at = livePages.findIndex((p) => p.id === id);
    if (at >= 0) announceRef.current?.(messages().announce.pageRemoved(at + 1));
  }, []);

  /**
   * Update a specific page's state
   */
  const updatePageState = useCallback((id: string, partial: Record<string, unknown>) => {
    liveRef.current.yjsPages?.updatePageState(id, partial);
  }, []);

  /**
   * Convert an existing page to another template. Template state is rebuilt
   * from the new config with the shared inheritance contract applied.
   */
  const setPageConfig = useCallback(
    async (id: string, configId: TId) => {
      if (!yjsPages) return;
      const source = readPages(ydoc).find((p) => p.id === id);
      if (!source || source.configId === configId) return;
      const config = await getConfigForPage(configId);
      const newState = config.createInitialState({
        ...(config.multiPage?.defaultNewPageState || {}),
        ...extractInheritablePageState(source.state, configId),
      });
      yjsPages.setPageConfig(id, configId, newState);
    },
    [yjsPages, ydoc, getConfigForPage]
  );

  const getPageYMap = useCallback(
    (index: number): Y.Map<unknown> | null => {
      // A refused doc's pages are never bound: a mounted binding would write their config.
      if (schemaRefusal) return null;
      const view = yjsPages ? yjsPages.pages[index] : cachedViews[index];
      return view ? view.yMap : null;
    },
    [yjsPages, cachedViews, schemaRefusal]
  );

  const currentPage = useMemo(() => pages[currentPageIndex], [pages, currentPageIndex]);

  // Expose loaded configs map for components that need it
  const loadedConfigs = useMemo(() => configCacheRef.current, []);

  const noopUndo = useCallback(() => {}, []);
  const undoPageOp = useCallback(() => {
    if (!yjsPages) return;
    yjsPages.undoPageOp();
    if (yjsPages.canUndoPageOp) announceRef.current?.(messages().announce.undone);
  }, [yjsPages]);
  const redoPageOp = useCallback(() => {
    if (!yjsPages) return;
    yjsPages.redoPageOp();
    if (yjsPages.canRedoPageOp) announceRef.current?.(messages().announce.redone);
  }, [yjsPages]);
  const discardReplaceDeck = yjsPages?.discardReplaceDeck ?? noopUndo;
  const replaceDeck = yjsPages?.replaceDeck ?? null;
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
    discardReplaceDeck,
    replaceDeck,
    canUndoPageOp,
    canRedoPageOp,
    isPreview,
    schemaRefusal,
  };
}
