/**
 * usePageManager - Hook for multi-page canvas management
 *
 * Each page can have a different template type, enabling documents
 * that mix Zitat, Dreizeilen, Info slides, etc.
 *
 * Key features:
 * - Each page stores its own configId (template type) + state
 * - Configs are loaded on-demand and cached
 * - Background inheritance when adding pages with different templates
 */

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { v4 as uuid } from 'uuid';
import * as Y from 'yjs';

import { useYjsPages } from '../collab/useYjsPages';
import { loadCanvasConfig, isValidCanvasType } from '../configs/configLoader';

import type { CanvasConfigId, HeterogeneousPage, FullCanvasConfig } from '../configs/types';

/** Pre-populated page definition for initializing multi-page with content */
export interface InitialPageDef {
  configId: CanvasConfigId;
  state: Record<string, unknown>;
}

export interface UsePageManagerOptions {
  initialConfigId: CanvasConfigId;
  initialProps: Record<string, unknown>;
  maxPages?: number;
  /** Pre-populated pages — when provided, overrides single-page initialization from initialProps */
  initialPages?: InitialPageDef[];
  /**
   * When provided, the pages list is backed by a Yjs doc instead of local
   * useState. Mutations route through `ydoc.transact` so they propagate to
   * remote peers. Pages from the Y.Doc shadow `initialProps`/`initialPages`
   * — those are only used to seed the doc on first load.
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
  canAddMore: boolean;
  pageCount: number;
  getConfigForPage: (configId: CanvasConfigId) => Promise<FullCanvasConfig>;
  loadedConfigs: Map<CanvasConfigId, FullCanvasConfig>;
  isLoadingConfig: boolean;
  /** When in collaborative mode, returns the page's Y.Map for that index; null otherwise. */
  getPageYMap: (index: number) => Y.Map<unknown> | null;
  /** Undo the last page-level operation (add/remove/duplicate/move). */
  undoPageOp: () => void;
  /** Redo the most recently undone page-level operation. */
  redoPageOp: () => void;
  canUndoPageOp: boolean;
  canRedoPageOp: boolean;
}

/**
 * Extract background properties that can be inherited across different templates.
 * This allows maintaining visual consistency when switching templates.
 */
function extractInheritableBackground(state: Record<string, unknown>): Record<string, unknown> {
  const inheritableProps: Record<string, unknown> = {};

  // Image background sources (used by templates with image backgrounds)
  if (state.currentImageSrc) {
    inheritableProps.currentImageSrc = state.currentImageSrc;
    inheritableProps.imageSrc = state.currentImageSrc;
  } else if (state.imageSrc) {
    inheritableProps.imageSrc = state.imageSrc;
    inheritableProps.currentImageSrc = state.imageSrc;
  }

  // Solid color background (used by info, zitat-pure)
  if (state.backgroundColor) {
    inheritableProps.backgroundColor = state.backgroundColor;
  }

  // Image offset and scale (for templates that support image positioning)
  if (state.imageOffset) {
    inheritableProps.imageOffset = state.imageOffset;
  }
  if (state.imageScale !== undefined) {
    inheritableProps.imageScale = state.imageScale;
  }

  return inheritableProps;
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

  const yjsPages = useYjsPages(collaborative?.ydoc ?? null, collaborative?.isSynced ?? false);

  const [localPages, setLocalPages] = useState<HeterogeneousPage[]>(() => {
    if (collaborative) return [];
    if (initialPages && initialPages.length > 0) {
      return initialPages.map((def, index) => ({
        id: uuid(),
        configId: def.configId,
        state: def.state,
        order: index,
      }));
    }
    return [
      {
        id: uuid(),
        configId: initialConfigId,
        state: initialProps,
        order: 0,
      },
    ];
  });

  // seedIfEmpty itself early-returns once pages exist, so re-runs from
  // changing initialProps/initialPages identity are harmless.
  useEffect(() => {
    if (!yjsPages || yjsPages.isSeeded) return;
    const seed =
      initialPages && initialPages.length > 0
        ? initialPages.map((def) => ({ id: uuid(), configId: def.configId, state: def.state }))
        : [{ id: uuid(), configId: initialConfigId, state: initialProps }];
    yjsPages.seedIfEmpty(seed);
  }, [yjsPages, initialPages, initialConfigId, initialProps]);

  const collabPagesView: HeterogeneousPage[] = useMemo(() => {
    if (!yjsPages) return [];
    return yjsPages.pages.map((p, idx) => ({
      id: p.id,
      configId: p.configId as CanvasConfigId,
      state: p.state,
      order: idx,
    }));
  }, [yjsPages]);

  const pages: HeterogeneousPage[] = collaborative ? collabPagesView : localPages;

  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  // Clamp current index when the collaborative page list shrinks under us.
  useEffect(() => {
    if (currentPageIndex >= pages.length && pages.length > 0) {
      setCurrentPageIndex(pages.length - 1);
    }
  }, [pages.length, currentPageIndex]);

  const canAddMore = pages.length < maxPages;

  /**
   * Load a config by ID, using cache if available
   */
  const getConfigForPage = useCallback(
    async (configId: CanvasConfigId): Promise<FullCanvasConfig> => {
      // Check cache first
      const cached = configCacheRef.current.get(configId);
      if (cached) {
        return cached;
      }

      // Load config
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
   * @param inheritBackground - Whether to copy background from current page
   */
  const addPage = useCallback(
    async (
      configId: CanvasConfigId,
      inheritBackground = true,
      stateOverrides?: Record<string, unknown>
    ) => {
      if (!canAddMore) return;

      // Load the config for the new page
      const config = await getConfigForPage(configId);

      // Get background from current page if inheriting
      const currentPage = pages[currentPageIndex];
      const inheritedBackground =
        inheritBackground && currentPage ? extractInheritableBackground(currentPage.state) : {};

      // Create initial state using the config's createInitialState
      // Merge in inherited background, default new page state, and any overrides
      const newPageState = config.createInitialState({
        ...(config.multiPage?.defaultNewPageState || {}),
        ...inheritedBackground,
        ...stateOverrides,
      });

      const newPage: HeterogeneousPage = {
        id: uuid(),
        configId,
        state: newPageState,
        order: pages.length,
      };

      if (yjsPages) {
        yjsPages.addPage({ id: newPage.id, configId, state: newPageState });
      } else {
        setLocalPages((prev) => [...prev, newPage]);
      }

      // Auto-switch to new page
      setCurrentPageIndex(pages.length);
    },
    [canAddMore, pages, currentPageIndex, getConfigForPage, yjsPages, setLocalPages]
  );

  /**
   * Duplicate the current page (same template, same content)
   */
  const duplicateCurrentPage = useCallback(() => {
    if (!canAddMore) return;

    const currentPage = pages[currentPageIndex];
    if (!currentPage) return;

    const duplicatedPage: HeterogeneousPage = {
      id: uuid(),
      configId: currentPage.configId,
      state: { ...currentPage.state },
      order: pages.length,
    };

    if (yjsPages) {
      yjsPages.addPage({
        id: duplicatedPage.id,
        configId: duplicatedPage.configId,
        state: duplicatedPage.state,
      });
    } else {
      setLocalPages((prev) => [...prev, duplicatedPage]);
    }
    setCurrentPageIndex(pages.length);
  }, [canAddMore, pages, currentPageIndex, yjsPages, setLocalPages]);

  /**
   * Duplicate a specific page by ID (inserts after the original)
   */
  const duplicatePage = useCallback(
    (id: string) => {
      if (!canAddMore) return;

      const sourceIndex = pages.findIndex((p) => p.id === id);
      if (sourceIndex === -1) return;

      const sourcePage = pages[sourceIndex];
      const duplicated: HeterogeneousPage = {
        id: uuid(),
        configId: sourcePage.configId,
        state: { ...sourcePage.state },
        order: 0,
      };

      if (yjsPages) {
        yjsPages.insertPage(sourceIndex + 1, {
          id: duplicated.id,
          configId: duplicated.configId,
          state: duplicated.state,
        });
      } else {
        setLocalPages((prev) => {
          const next = [...prev];
          next.splice(sourceIndex + 1, 0, duplicated);
          return next.map((p, i) => ({ ...p, order: i }));
        });
      }
      setCurrentPageIndex(sourceIndex + 1);
    },
    [canAddMore, pages, yjsPages, setLocalPages]
  );

  /**
   * Move a page up or down in the order
   */
  const movePage = useCallback(
    (id: string, direction: 'up' | 'down') => {
      const index = pages.findIndex((p) => p.id === id);
      if (index === -1) return;

      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= pages.length) return;

      if (yjsPages) {
        yjsPages.movePage(id, direction);
      } else {
        setLocalPages((prev) => {
          const next = [...prev];
          [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
          return next.map((p, i) => ({ ...p, order: i }));
        });
      }

      // Follow the moved page
      if (currentPageIndex === index) {
        setCurrentPageIndex(targetIndex);
      } else if (currentPageIndex === targetIndex) {
        setCurrentPageIndex(index);
      }
    },
    [pages, currentPageIndex, yjsPages, setLocalPages]
  );

  /**
   * Remove a page by ID
   */
  const removePage = useCallback(
    (id: string) => {
      if (pages.length <= 1) return; // Keep at least one

      if (yjsPages) {
        yjsPages.removePage(id);
      } else {
        setLocalPages((prev) => {
          const filtered = prev.filter((p) => p.id !== id);
          return filtered.map((p, i) => ({ ...p, order: i }));
        });
      }

      // Adjust current index if needed
      setCurrentPageIndex((prev) => Math.min(prev, pages.length - 2));
    },
    [pages.length, yjsPages, setLocalPages]
  );

  /**
   * Update a specific page's state
   */
  const updatePageState = useCallback(
    (id: string, partial: Record<string, unknown>) => {
      if (yjsPages) {
        yjsPages.updatePageState(id, partial);
        return;
      }
      setLocalPages((prev) =>
        prev.map((p) => (p.id === id ? { ...p, state: { ...p.state, ...partial } } : p))
      );
    },
    [yjsPages, setLocalPages]
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

  // Page-level undo/redo. Collab mode is fully wired via Yjs UndoManager;
  // local (non-collab) mode is a no-op here for now — pages persist via
  // host auto-save, and most users hit this path through the collab editor.
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
    canAddMore,
    pageCount: pages.length,
    getConfigForPage,
    loadedConfigs,
    isLoadingConfig,
    getPageYMap,
    undoPageOp,
    redoPageOp,
    canUndoPageOp,
    canRedoPageOp,
  };
}
