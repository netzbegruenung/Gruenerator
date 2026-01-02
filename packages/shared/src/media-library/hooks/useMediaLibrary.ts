/**
 * useMediaLibrary hook
 * React Query-based hook for fetching and managing media library
 *
 * Note: This hook requires @tanstack/react-query to be installed in the consuming app.
 * It uses the global API client configured by the platform.
 */

import { useState, useCallback } from 'react';
import { mediaApi } from '../api/index.js';
import { DEFAULT_PAGINATION } from '../constants.js';
import type {
  MediaItem,
  MediaFilters,
  MediaPagination,
  MediaListResponse,
} from '../types.js';

interface UseMediaLibraryOptions {
  initialFilters?: MediaFilters;
}

interface UseMediaLibraryReturn {
  items: MediaItem[];
  pagination: MediaPagination;
  filters: MediaFilters;
  isLoading: boolean;
  error: string | null;
  setFilters: (filters: Partial<MediaFilters>) => void;
  refetch: () => Promise<void>;
  loadMore: () => Promise<void>;
  deleteItem: (id: string) => Promise<boolean>;
  updateItem: (id: string, updates: { title?: string; altText?: string }) => Promise<boolean>;
}

/**
 * Hook for managing media library state and operations
 * Uses manual state management for compatibility across platforms
 */
export function useMediaLibrary(options: UseMediaLibraryOptions = {}): UseMediaLibraryReturn {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [pagination, setPagination] = useState<MediaPagination>({
    total: 0,
    limit: DEFAULT_PAGINATION.limit,
    offset: 0,
    hasMore: false,
  });
  const [filters, setFiltersState] = useState<MediaFilters>({
    type: 'all',
    sort: 'newest',
    limit: DEFAULT_PAGINATION.limit,
    offset: 0,
    ...options.initialFilters,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMedia = useCallback(async (currentFilters: MediaFilters, append = false) => {
    setIsLoading(true);
    setError(null);

    try {
      const response: MediaListResponse = await mediaApi.getMediaLibrary(currentFilters);

      if (response.success) {
        setItems(prev => append ? [...prev, ...response.data] : response.data);
        setPagination(response.pagination);
      } else {
        throw new Error(response.error || 'Failed to fetch media');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch media';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const setFilters = useCallback((newFilters: Partial<MediaFilters>) => {
    const updatedFilters = { ...filters, ...newFilters, offset: 0 };
    setFiltersState(updatedFilters);
    fetchMedia(updatedFilters);
  }, [filters, fetchMedia]);

  const refetch = useCallback(async () => {
    await fetchMedia({ ...filters, offset: 0 });
  }, [filters, fetchMedia]);

  const loadMore = useCallback(async () => {
    if (!pagination.hasMore || isLoading) return;

    const newOffset = pagination.offset + pagination.limit;
    const updatedFilters = { ...filters, offset: newOffset };
    setFiltersState(updatedFilters);
    await fetchMedia(updatedFilters, true);
  }, [filters, pagination, isLoading, fetchMedia]);

  const deleteItem = useCallback(async (id: string): Promise<boolean> => {
    try {
      const response = await mediaApi.deleteMedia(id);
      if (response.success) {
        setItems(prev => prev.filter(item => item.id !== id));
        setPagination(prev => ({ ...prev, total: Math.max(0, prev.total - 1) }));
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, []);

  const updateItem = useCallback(async (
    id: string,
    updates: { title?: string; altText?: string }
  ): Promise<boolean> => {
    try {
      const response = await mediaApi.updateMedia(id, updates);
      if (response.success) {
        setItems(prev =>
          prev.map(item =>
            item.id === id
              ? { ...item, title: updates.title ?? item.title, altText: updates.altText ?? item.altText }
              : item
          )
        );
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, []);

  return {
    items,
    pagination,
    filters,
    isLoading,
    error,
    setFilters,
    refetch,
    loadMore,
    deleteItem,
    updateItem,
  };
}
