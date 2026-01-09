/**
 * useMultiPageCanvas - Hook for multi-page canvas management
 * 
 * Manages page state for multi-slide sharepics without adding
 * wrapper components or extra visual noise.
 */

import { useState, useCallback, useMemo } from 'react';
import { v4 as uuid } from 'uuid';
import type { FullCanvasConfig } from '../configs/types';

export interface PageState<TState = Record<string, any>> {
    id: string;
    state: TState;
    order: number;
}

export interface UseMultiPageCanvasOptions<TState, TActions> {
    config: FullCanvasConfig<TState, TActions>;
    initialProps: Record<string, any>;
    maxPages?: number;
}

export interface UseMultiPageCanvasReturn<TState> {
    /** All pages */
    pages: PageState<TState>[];
    /** Current page index */
    currentPageIndex: number;
    /** Set current page */
    setCurrentPageIndex: (index: number) => void;
    /** Current page state */
    currentPage: PageState<TState> | undefined;
    /** Add a new page */
    addPage: () => void;
    /** Remove a page by ID */
    removePage: (id: string) => void;
    /** Update a page's state */
    updatePageState: (id: string, partial: Partial<TState>) => void;
    /** Whether more pages can be added */
    canAddMore: boolean;
    /** Total page count */
    pageCount: number;
}

export function useMultiPageCanvas<TState extends Record<string, any>, TActions>({
    config,
    initialProps,
    maxPages = 10,
}: UseMultiPageCanvasOptions<TState, TActions>): UseMultiPageCanvasReturn<TState> {
    // Initialize with one page
    const [pages, setPages] = useState<PageState<TState>[]>(() => [{
        id: uuid(),
        state: config.createInitialState(initialProps) as TState,
        order: 0,
    }]);

    const [currentPageIndex, setCurrentPageIndex] = useState(0);

    const canAddMore = pages.length < maxPages;

    const addPage = useCallback(() => {
        if (!canAddMore) return;

        // Get background from last page to copy it
        const lastPage = pages[pages.length - 1];
        const lastState = lastPage?.state || {};
        const bgImage = lastState.currentImageSrc || lastState.imageSrc;

        const newPageState = config.createInitialState({
            ...(config.multiPage?.defaultNewPageState || {}),
            // Copy background from previous page
            imageSrc: bgImage,
            currentImageSrc: bgImage,
        }) as TState;

        setPages(prev => [
            ...prev,
            {
                id: uuid(),
                state: newPageState,
                order: prev.length,
            },
        ]);

        // Optionally auto-switch to new page
        setCurrentPageIndex(pages.length);
    }, [config, canAddMore, pages.length]);

    const removePage = useCallback((id: string) => {
        if (pages.length <= 1) return; // Keep at least one

        setPages(prev => {
            const filtered = prev.filter(p => p.id !== id);
            return filtered.map((p, i) => ({ ...p, order: i }));
        });

        // Adjust current index if needed
        setCurrentPageIndex(prev => Math.min(prev, pages.length - 2));
    }, [pages.length]);

    const updatePageState = useCallback((id: string, partial: Partial<TState>) => {
        setPages(prev =>
            prev.map(p =>
                p.id === id ? { ...p, state: { ...p.state, ...partial } } : p
            )
        );
    }, []);

    const currentPage = useMemo(() => pages[currentPageIndex], [pages, currentPageIndex]);

    return {
        pages,
        currentPageIndex,
        setCurrentPageIndex,
        currentPage,
        addPage,
        removePage,
        updatePageState,
        canAddMore,
        pageCount: pages.length,
    };
}
