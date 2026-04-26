/**
 * useMediaLibrary hook
 *
 * Auto-fetching media library backed by @tanstack/react-query's useInfiniteQuery.
 * Offset-based pagination via pageParam; mutations splice cached pages in place.
 *
 * Requires @tanstack/react-query (declared as peerDependency on this package)
 * and a QueryClientProvider mounted in the consuming app.
 */

import { useInfiniteQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';

import { mediaApi } from '../api/index.js';
import { DEFAULT_PAGINATION } from '../constants.js';

import type {
  MediaFilters,
  MediaItem,
  MediaListResponse,
  MediaPagination,
  MediaUpdateParams,
} from '../types.js';

export const MEDIA_LIBRARY_QUERY_KEY = ['media-library'] as const;

interface UseMediaLibraryOptions {
  initialFilters?: MediaFilters;
  enabled?: boolean;
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
  updateItem: (id: string, updates: MediaUpdateParams) => Promise<boolean>;
}

const initialPagination: MediaPagination = {
  total: 0,
  limit: DEFAULT_PAGINATION.limit,
  offset: 0,
  hasMore: false,
};

export function useMediaLibrary(options: UseMediaLibraryOptions = {}): UseMediaLibraryReturn {
  const queryClient = useQueryClient();

  const [filters, setFiltersState] = useState<MediaFilters>(() => ({
    type: 'all',
    sort: 'newest',
    limit: DEFAULT_PAGINATION.limit,
    ...options.initialFilters,
  }));

  const enabled = options.enabled ?? true;

  const query = useInfiniteQuery<MediaListResponse, Error, InfiniteData<MediaListResponse>>({
    queryKey: [
      ...MEDIA_LIBRARY_QUERY_KEY,
      filters.type,
      filters.search,
      filters.sort,
      filters.limit,
    ],
    queryFn: async ({ pageParam }) => {
      const response = await mediaApi.getMediaLibrary({
        ...filters,
        offset: pageParam as number,
      });
      if (!response.success) {
        throw new Error(response.error ?? 'Failed to fetch media');
      }
      return response;
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage) =>
      lastPage.pagination.hasMore
        ? lastPage.pagination.offset + lastPage.pagination.limit
        : undefined,
    enabled,
  });

  const items = useMemo<MediaItem[]>(
    () => query.data?.pages.flatMap((page) => page.data) ?? [],
    [query.data]
  );

  const pagination = useMemo<MediaPagination>(() => {
    const lastPage = query.data?.pages.at(-1);
    return lastPage?.pagination ?? initialPagination;
  }, [query.data]);

  const setFilters = useCallback((patch: Partial<MediaFilters>) => {
    setFiltersState((prev) => ({ ...prev, ...patch }));
  }, []);

  const refetch = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: MEDIA_LIBRARY_QUERY_KEY });
  }, [queryClient]);

  const loadMore = useCallback(async () => {
    if (!query.hasNextPage || query.isFetchingNextPage) return;
    await query.fetchNextPage();
  }, [query]);

  const deleteItem = useCallback(
    async (id: string): Promise<boolean> => {
      try {
        const response = await mediaApi.deleteMedia(id);
        if (!response.success) return false;

        queryClient.setQueriesData<InfiniteData<MediaListResponse>>(
          { queryKey: MEDIA_LIBRARY_QUERY_KEY },
          (old) =>
            old
              ? {
                  ...old,
                  pages: old.pages.map((page) => ({
                    ...page,
                    data: page.data.filter((item) => item.id !== id),
                    pagination: {
                      ...page.pagination,
                      total: Math.max(0, page.pagination.total - 1),
                    },
                  })),
                }
              : old
        );
        return true;
      } catch {
        return false;
      }
    },
    [queryClient]
  );

  const updateItem = useCallback(
    async (id: string, updates: MediaUpdateParams): Promise<boolean> => {
      try {
        const response = await mediaApi.updateMedia(id, updates);
        if (!response.success) return false;

        queryClient.setQueriesData<InfiniteData<MediaListResponse>>(
          { queryKey: MEDIA_LIBRARY_QUERY_KEY },
          (old) =>
            old
              ? {
                  ...old,
                  pages: old.pages.map((page) => ({
                    ...page,
                    data: page.data.map((item) =>
                      item.id === id
                        ? {
                            ...item,
                            ...(updates.title !== undefined && { title: updates.title }),
                            ...(updates.altText !== undefined && { altText: updates.altText }),
                          }
                        : item
                    ),
                  })),
                }
              : old
        );
        return true;
      } catch {
        return false;
      }
    },
    [queryClient]
  );

  return {
    items,
    pagination,
    filters,
    isLoading: query.isLoading || query.isFetchingNextPage,
    error: query.error?.message ?? null,
    setFilters,
    refetch,
    loadMore,
    deleteItem,
    updateItem,
  };
}
