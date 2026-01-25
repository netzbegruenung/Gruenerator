import { useState, useEffect, useCallback, useRef } from 'react';

import apiClient from '../components/utils/apiClient';

/**
 * Saved text from API
 */
export interface SavedText {
  id: string;
  title: string;
  content: string;
  type: string;
  created_at: string;
  word_count: number;
  character_count: number;
}

/**
 * Options for useRecentTexts hook
 */
export interface UseRecentTextsOptions {
  generatorType: string;
  limit?: number;
  enabled?: boolean;
}

/**
 * Hook return type
 */
export interface UseRecentTextsReturn {
  texts: SavedText[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  deleteText: (id: string) => Promise<void>;
}

/**
 * Cache for recent texts (5 minute TTL)
 */
interface CacheEntry {
  data: SavedText[];
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Hook to fetch recent texts for a specific generator type
 * Includes caching to reduce API calls
 *
 * @param options - Configuration options
 * @returns Recent texts data and actions
 */
export function useRecentTexts(options: UseRecentTextsOptions): UseRecentTextsReturn {
  const { generatorType, limit = 3, enabled = true } = options;

  const [texts, setTexts] = useState<SavedText[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isMountedRef = useRef(true);

  /**
   * Fetch texts from API
   */
  const fetchTexts = useCallback(async () => {
    if (!enabled) {
      return;
    }

    // Check cache first
    const cacheKey = `${generatorType}-${limit}`;
    const cached = cache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      console.log('[useRecentTexts] Using cached data for', generatorType);
      setTexts(cached.data);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      console.log('[useRecentTexts] Fetching recent texts for', generatorType);

      const response = await apiClient.get('/auth/saved-texts', {
        params: {
          type: generatorType,
          limit,
          page: 1,
        },
        skipAuthRedirect: true,
      } as any);

      const fetchedTexts = response.data.data || [];

      if (isMountedRef.current) {
        setTexts(fetchedTexts);

        // Update cache
        cache.set(cacheKey, {
          data: fetchedTexts,
          timestamp: Date.now(),
        });

        console.log('[useRecentTexts] Fetched', fetchedTexts.length, 'texts');
      }
    } catch (err) {
      console.error('[useRecentTexts] Error fetching texts:', err);

      if (isMountedRef.current) {
        const errorMessage = err instanceof Error ? err.message : 'Fehler beim Laden der Texte';
        setError(errorMessage);
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [generatorType, limit, enabled]);

  /**
   * Delete a text
   */
  const deleteText = useCallback(
    async (id: string) => {
      try {
        console.log('[useRecentTexts] Deleting text', id);

        await apiClient.delete(`/auth/saved-texts/${id}`);

        // Remove from local state
        if (isMountedRef.current) {
          setTexts((prev) => prev.filter((text) => text.id !== id));

          // Invalidate cache
          const cacheKey = `${generatorType}-${limit}`;
          cache.delete(cacheKey);

          console.log('[useRecentTexts] Text deleted successfully');
        }
      } catch (err) {
        console.error('[useRecentTexts] Error deleting text:', err);

        const errorMessage = err instanceof Error ? err.message : 'Fehler beim Löschen';
        if (isMountedRef.current) {
          setError(errorMessage);
        }

        throw err;
      }
    },
    [generatorType, limit]
  );

  /**
   * Manual refetch
   */
  const refetch = useCallback(async () => {
    // Invalidate cache
    const cacheKey = `${generatorType}-${limit}`;
    cache.delete(cacheKey);

    await fetchTexts();
  }, [generatorType, limit, fetchTexts]);

  /**
   * Fetch on mount and when dependencies change
   */
  useEffect(() => {
    fetchTexts();
  }, [fetchTexts]);

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  return {
    texts,
    isLoading,
    error,
    refetch,
    deleteText,
  };
}
