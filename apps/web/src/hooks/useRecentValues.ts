import { useState, useCallback, useEffect } from 'react';

import apiClient from '../components/utils/apiClient';

interface UseRecentValuesOptions {
  limit?: number;
  autoSave?: boolean;
  debounceMs?: number;
  cacheTimeout?: number;
}

interface UseRecentValuesReturn {
  recentValues: string[];
  isLoading: boolean;
  error: string | null;
  saveRecentValue: (value: string, formName?: string | null) => Promise<void>;
  clearRecentValues: () => Promise<void>;
  refresh: () => void;
  hasRecentValue: (value: string) => boolean;
  isEmpty: boolean;
  lastFetch: number | null;
}

/**
 * Custom hook for managing recent form values
 * Provides functionality to save, retrieve, and manage recent form inputs
 */
export const useRecentValues = (
  fieldType: string,
  options: UseRecentValuesOptions = {}
): UseRecentValuesReturn => {
  const { limit = 5, autoSave = true, debounceMs = 1000, cacheTimeout = 5 * 60 * 1000 } = options;

  // Cache key for local storage
  const cacheKey = `recentValues_${fieldType}`;

  // Initialize state synchronously from localStorage to avoid flicker
  // Using lazy initializer to only read localStorage once on mount
  const [initialCache] = useState(() => {
    if (typeof window === 'undefined')
      return { values: [] as string[], timestamp: null as number | null };
    try {
      const cachedData = localStorage.getItem(cacheKey);
      if (cachedData) {
        const parsed = JSON.parse(cachedData);
        const age = Date.now() - parsed.timestamp;
        if (age < cacheTimeout) {
          return {
            values: (parsed.values || []) as string[],
            timestamp: parsed.timestamp as number,
          };
        }
      }
    } catch {
      // Invalid cache, ignore
    }
    return { values: [] as string[], timestamp: null as number | null };
  });

  const [recentValues, setRecentValues] = useState<string[]>(initialCache.values);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetch, setLastFetch] = useState<number | null>(initialCache.timestamp);

  // Only fetch from server if cache was empty or expired (on mount only)
  useEffect(() => {
    if (lastFetch === null) {
      fetchRecentValues();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fieldType]);

  /**
   * Fetch recent values from the server
   */
  const fetchRecentValues = useCallback(async () => {
    if (!fieldType) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await apiClient.get(`/recent-values/${fieldType}?limit=${limit}`, {
        skipAuthRedirect: true,
      } as Record<string, unknown>);

      if (response.data?.success && response.data?.data) {
        const values = response.data.data.map((item: { field_value: string }) => item.field_value);
        setRecentValues(values);

        // Cache the results
        localStorage.setItem(
          cacheKey,
          JSON.stringify({
            values,
            timestamp: Date.now(),
          })
        );
        setLastFetch(Date.now());
      } else {
        setRecentValues([]);
      }
    } catch (err: unknown) {
      console.error('[useRecentValues] Error fetching recent values:', err);
      let errorMsg = 'Failed to fetch recent values';
      if (err instanceof Error && 'response' in err) {
        const response = (err as { response?: { data?: { error?: string } } }).response;
        if (response?.data?.error) {
          errorMsg = response.data.error;
        }
      }
      setError(errorMsg);
      // Don't clear existing values on error
    } finally {
      setIsLoading(false);
    }
  }, [fieldType, limit, cacheKey]);

  /**
   * Save a new recent value
   */
  const saveRecentValue = useCallback(
    async (value: string, formName: string | null = null) => {
      if (!fieldType || !value || typeof value !== 'string' || value.trim() === '') {
        return;
      }

      const trimmedValue = value.trim();

      // Don't save if it's already the most recent value
      if (recentValues.length > 0 && recentValues[0] === trimmedValue) {
        return;
      }

      try {
        const response = await apiClient.post(
          '/recent-values',
          {
            fieldType,
            fieldValue: trimmedValue,
            formName,
          },
          {
            skipAuthRedirect: true,
          } as Record<string, unknown>
        );

        if (response.data?.success) {
          // Update local state optimistically
          setRecentValues((prev) => {
            const filtered = prev.filter((v) => v !== trimmedValue);
            return [trimmedValue, ...filtered].slice(0, limit);
          });

          // Update cache
          const newValues = [trimmedValue, ...recentValues.filter((v) => v !== trimmedValue)].slice(
            0,
            limit
          );
          localStorage.setItem(
            cacheKey,
            JSON.stringify({
              values: newValues,
              timestamp: Date.now(),
            })
          );

          console.log(
            `[useRecentValues] Saved recent value for ${fieldType}:`,
            trimmedValue.substring(0, 50) + '...'
          );
        }
      } catch (err) {
        console.error('[useRecentValues] Error saving recent value:', err);
        // Don't throw error to avoid disrupting form submission
      }
    },
    [fieldType, recentValues, limit, cacheKey]
  );

  /**
   * Clear all recent values for the current field type
   */
  const clearRecentValues = useCallback(async () => {
    if (!fieldType) return;

    try {
      const response = await apiClient.delete(`/recent-values/${fieldType}`, {
        skipAuthRedirect: true,
      } as Record<string, unknown>);

      if (response.data?.success) {
        setRecentValues([]);
        localStorage.removeItem(cacheKey);
        console.log(`[useRecentValues] Cleared recent values for ${fieldType}`);
      }
    } catch (err: unknown) {
      console.error('[useRecentValues] Error clearing recent values:', err);
      let errorMsg = 'Failed to clear recent values';
      if (err instanceof Error && 'response' in err) {
        const response = (err as { response?: { data?: { error?: string } } }).response;
        if (response?.data?.error) {
          errorMsg = response.data.error;
        }
      }
      setError(errorMsg);
    }
  }, [fieldType, cacheKey]);

  /**
   * Refresh recent values from server
   */
  const refresh = useCallback(() => {
    localStorage.removeItem(cacheKey);
    fetchRecentValues();
  }, [fetchRecentValues, cacheKey]);

  /**
   * Check if a value exists in recent values
   */
  const hasRecentValue = useCallback(
    (value: string) => {
      if (!value || typeof value !== 'string') return false;
      return recentValues.includes(value.trim());
    },
    [recentValues]
  );

  return {
    recentValues,
    isLoading,
    error,
    saveRecentValue,
    clearRecentValues,
    refresh,
    hasRecentValue,
    isEmpty: recentValues.length === 0,
    lastFetch,
  };
};

export default useRecentValues;
