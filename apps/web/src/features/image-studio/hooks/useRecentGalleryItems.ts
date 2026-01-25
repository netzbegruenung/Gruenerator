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

const CACHE_KEY = 'recentGalleryItems';

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
        const parsed = JSON.parse(cachedData);
        const age = Date.now() - parsed.timestamp;
        if (age < cacheTimeout) {
          return {
            items: (parsed.items || []) as RecentGalleryItem[],
            timestamp: parsed.timestamp as number,
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

  const fetchRecentItems = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await apiClient.get(`/share/recent?limit=${limit}`, {
        skipAuthRedirect: true,
      } as Record<string, unknown>);

      if (response.data?.success && response.data?.shares) {
        const recentItems: RecentGalleryItem[] = response.data.shares.map(
          (share: Record<string, unknown>) => ({
            shareToken: share.shareToken as string,
            title: share.title as string,
            thumbnailPath: share.thumbnailPath as string | undefined,
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
  }, [limit]);

  useEffect(() => {
    if (lastFetch === null) {
      fetchRecentItems();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refresh = useCallback(() => {
    localStorage.removeItem(CACHE_KEY);
    fetchRecentItems();
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
