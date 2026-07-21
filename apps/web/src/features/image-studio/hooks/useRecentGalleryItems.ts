import { useState, useCallback, useEffect } from 'react';

import apiClient from '../../../components/utils/apiClient';

export interface RecentGalleryItemMetadata {
  sharepicType?: string;
  content?: Record<string, unknown>;
  styling?: Record<string, unknown>;
  hasOriginalImage?: boolean;
  [key: string]: unknown;
}

export interface RecentGalleryItem {
  shareToken: string;
  title: string;
  thumbnailPath?: string;
  imageType?: string;
  createdAt: string;
  imageMetadata?: RecentGalleryItemMetadata;
}

interface UseRecentGalleryItemsOptions {
  limit?: number;
  cacheTimeout?: number;
}

interface UseRecentGalleryItemsReturn {
  items: RecentGalleryItem[];
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
  isEmpty: boolean;
  lastFetch: number | null;
}

const CACHE_KEY = 'recentGalleryItems_v2';

export const useRecentGalleryItems = (
  options: UseRecentGalleryItemsOptions = {}
): UseRecentGalleryItemsReturn => {
  const { limit = 6, cacheTimeout = 5 * 60 * 1000 } = options;

  const [initialCache] = useState(() => {
    if (typeof window === 'undefined')
      return { items: [] as RecentGalleryItem[], timestamp: null as number | null };
    try {
      const cachedData = localStorage.getItem(CACHE_KEY);
      if (cachedData) {
        const parsed = JSON.parse(cachedData) as {
          timestamp?: number;
          items?: RecentGalleryItem[];
        };
        const age = Date.now() - (parsed.timestamp ?? 0);
        if (age < cacheTimeout) {
          return {
            items: (parsed.items ?? []) as RecentGalleryItem[],
            timestamp: parsed.timestamp ?? null,
          };
        }
      }
    } catch {
      // Invalid cache, ignore
    }
    return { items: [] as RecentGalleryItem[], timestamp: null as number | null };
  });

  const [items, setItems] = useState<RecentGalleryItem[]>(initialCache.items);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetch, setLastFetch] = useState<number | null>(initialCache.timestamp);

  const fetchRecentItems = useCallback(
    async (signal?: AbortSignal) => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await apiClient.get(`/share/recent?limit=${limit}`, {
          skipAuthRedirect: true,
          signal,
        } as Record<string, unknown>);

        interface SharesResponse {
          success: boolean;
          shares: Record<string, unknown>[];
        }
        const responseData = response.data as SharesResponse;
        if (responseData.success && responseData.shares) {
          const recentItems: RecentGalleryItem[] = responseData.shares.map(
            (share: Record<string, unknown>) => ({
              shareToken: share.shareToken as string,
              title: share.title as string,
              thumbnailPath: share.thumbnailPath as string | undefined,
              imageType: share.imageType as string | undefined,
              createdAt: share.createdAt as string,
              imageMetadata: share.imageMetadata as RecentGalleryItemMetadata | undefined,
            })
          );

          setItems(recentItems);
          localStorage.setItem(
            CACHE_KEY,
            JSON.stringify({
              items: recentItems,
              timestamp: Date.now(),
            })
          );
          setLastFetch(Date.now());
        } else {
          setItems([]);
        }
      } catch (err: unknown) {
        if (signal?.aborted) return;
        console.error('[useRecentGalleryItems] Error fetching recent items:', err);
        let errorMsg = 'Failed to fetch recent items';
        if (err instanceof Error && 'response' in err) {
          const response = (err as { response?: { data?: { error?: string } } }).response;
          if (response?.data?.error) {
            errorMsg = response.data.error;
          }
        }
        setError(errorMsg);
      } finally {
        setIsLoading(false);
      }
    },
    [limit]
  );

  // Stale-while-revalidate: the localStorage cache only provides the instant
  // first paint; every mount refetches so freshly autosaved images appear
  // immediately instead of after the cache TTL. The abort keeps rapid
  // remounts from interleaving out-of-order responses.
  useEffect(() => {
    const controller = new AbortController();
    void fetchRecentItems(controller.signal);
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refresh = useCallback(() => {
    localStorage.removeItem(CACHE_KEY);
    void fetchRecentItems();
  }, [fetchRecentItems]);

  return {
    items,
    isLoading,
    error,
    refresh,
    isEmpty: items.length === 0,
    lastFetch,
  };
};

export default useRecentGalleryItems;
