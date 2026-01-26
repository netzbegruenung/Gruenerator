/**
 * useHeterogeneousMultiPage - Hook for heterogeneous multi-page canvas management
 *
 * Unlike useMultiPageCanvas which requires all pages to share the same template/config,
 * this hook allows each page to have a different template type. This enables creating
 * documents that mix Zitat, Dreizeilen, Info slides, etc.
 *
 * Key features:
 * - Each page stores its own configId (template type) + state
 * - Configs are loaded on-demand and cached
 * - Background inheritance when adding pages with different templates
 */

import { useState, useCallback, useMemo, useRef } from 'react';
import { v4 as uuid } from 'uuid';

import { loadCanvasConfig, isValidCanvasType } from '../configs/configLoader';

import type { CanvasConfigId, HeterogeneousPage, FullCanvasConfig } from '../configs/types';

export interface UseHeterogeneousMultiPageOptions {
  initialConfigId: CanvasConfigId;
  initialProps: Record<string, unknown>;
  maxPages?: number;
}

export interface UseHeterogeneousMultiPageReturn {
  pages: HeterogeneousPage[];
  currentPageIndex: number;
  setCurrentPageIndex: (index: number) => void;
  currentPage: HeterogeneousPage | undefined;
  addPage: (configId: CanvasConfigId, inheritBackground?: boolean) => Promise<void>;
  duplicateCurrentPage: () => void;
  removePage: (id: string) => void;
  updatePageState: (id: string, partial: Record<string, unknown>) => void;
  canAddMore: boolean;
  pageCount: number;
  getConfigForPage: (configId: CanvasConfigId) => Promise<FullCanvasConfig>;
  loadedConfigs: Map<CanvasConfigId, FullCanvasConfig>;
  isLoadingConfig: boolean;
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

export function useHeterogeneousMultiPage({
  initialConfigId,
  initialProps,
  maxPages = 10,
}: UseHeterogeneousMultiPageOptions): UseHeterogeneousMultiPageReturn {
  // Config cache - loaded configs are stored here to avoid re-fetching
  const configCacheRef = useRef<Map<CanvasConfigId, FullCanvasConfig>>(new Map());
  const [isLoadingConfig, setIsLoadingConfig] = useState(false);

  // Initialize with one page using the initial config
  const [pages, setPages] = useState<HeterogeneousPage[]>(() => [
    {
      id: uuid(),
      configId: initialConfigId,
      state: initialProps,
      order: 0,
    },
  ]);

  const [currentPageIndex, setCurrentPageIndex] = useState(0);

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
    async (configId: CanvasConfigId, inheritBackground = true) => {
      if (!canAddMore) return;

      // Load the config for the new page
      const config = await getConfigForPage(configId);

      // Get background from current page if inheriting
      const currentPage = pages[currentPageIndex];
      const inheritedBackground =
        inheritBackground && currentPage ? extractInheritableBackground(currentPage.state) : {};

      // Create initial state using the config's createInitialState
      // Merge in inherited background and any default new page state
      const newPageState = config.createInitialState({
        ...(config.multiPage?.defaultNewPageState || {}),
        ...inheritedBackground,
      });

      const newPage: HeterogeneousPage = {
        id: uuid(),
        configId,
        state: newPageState,
        order: pages.length,
      };

      setPages((prev) => [...prev, newPage]);

      // Auto-switch to new page
      setCurrentPageIndex(pages.length);
    },
    [canAddMore, pages, currentPageIndex, getConfigForPage]
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

    setPages((prev) => [...prev, duplicatedPage]);
    setCurrentPageIndex(pages.length);
  }, [canAddMore, pages, currentPageIndex]);

  /**
   * Remove a page by ID
   */
  const removePage = useCallback(
    (id: string) => {
      if (pages.length <= 1) return; // Keep at least one

      setPages((prev) => {
        const filtered = prev.filter((p) => p.id !== id);
        return filtered.map((p, i) => ({ ...p, order: i }));
      });

      // Adjust current index if needed
      setCurrentPageIndex((prev) => Math.min(prev, pages.length - 2));
    },
    [pages.length]
  );

  /**
   * Update a specific page's state
   */
  const updatePageState = useCallback((id: string, partial: Record<string, unknown>) => {
    setPages((prev) =>
      prev.map((p) => (p.id === id ? { ...p, state: { ...p.state, ...partial } } : p))
    );
  }, []);

  const currentPage = useMemo(() => pages[currentPageIndex], [pages, currentPageIndex]);

  // Expose loaded configs map for components that need it
  const loadedConfigs = useMemo(() => configCacheRef.current, []);

  return {
    pages,
    currentPageIndex,
    setCurrentPageIndex,
    currentPage,
    addPage,
    duplicateCurrentPage,
    removePage,
    updatePageState,
    canAddMore,
    pageCount: pages.length,
    getConfigForPage,
    loadedConfigs,
    isLoadingConfig,
  };
}
