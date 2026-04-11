/**
 * useRecentValuesTyped — typed replacement for useRecentValues.
 *
 * Demonstrates the ts-rest migration pattern:
 *   BEFORE: apiClient.get(`/recent-values/${fieldType}?limit=${limit}`)
 *           → response typed as `any`, shape verified only at runtime
 *
 *   AFTER:  client.recentValues.getByFieldType({ params: { fieldType }, query: { limit } })
 *           → body fully typed as GetRecentValuesResponse, shape enforced at compile time
 *
 * The response `body` type is inferred directly from the Zod schema in
 * @gruenerator/contracts — no manual interface duplication.
 *
 * This hook intentionally mirrors useRecentValues.ts so both can coexist
 * during migration. Once this is verified stable, the old hook can be removed.
 */

import { getContractsClient } from '@gruenerator/shared/api';
import { useState, useCallback, useEffect } from 'react';

interface UseRecentValuesOptions {
  limit?: number;
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

export function useRecentValuesTyped(
  fieldType: string,
  options: UseRecentValuesOptions = {}
): UseRecentValuesReturn {
  const { limit = 5, cacheTimeout = 5 * 60 * 1000 } = options;
  const cacheKey = `recentValues_${fieldType}`;

  const [initialCache] = useState(() => {
    if (typeof window === 'undefined')
      return { values: [] as string[], timestamp: null as number | null };
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached) as { values: string[]; timestamp: number };
        if (Date.now() - parsed.timestamp < cacheTimeout) {
          return { values: parsed.values, timestamp: parsed.timestamp };
        }
      }
    } catch {
      // invalid cache
    }
    return { values: [] as string[], timestamp: null as number | null };
  });

  const [recentValues, setRecentValues] = useState<string[]>(initialCache.values);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetch, setLastFetch] = useState<number | null>(initialCache.timestamp);

  // Fetch on mount only when cache is cold
  useEffect(() => {
    if (lastFetch === null) {
      fetchRecentValues();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fieldType]);

  const fetchRecentValues = useCallback(async () => {
    if (!fieldType) return;
    setIsLoading(true);
    setError(null);

    try {
      const client = getContractsClient();

      // ── Typed call ──────────────────────────────────────────────────────────
      // `status` and `body` are discriminated by the contract's response map.
      // TypeScript knows `body.data` is an array of `RecentValueItem` objects.
      const result = await client.recentValues.getByFieldType({
        params: { fieldType },
        query: { limit: String(limit) },
      });

      if (result.status === 200) {
        // result.body is typed as z.infer<typeof getRecentValuesResponseSchema>
        const values = result.body.data.map((item) => item.field_value);
        setRecentValues(values);
        localStorage.setItem(cacheKey, JSON.stringify({ values, timestamp: Date.now() }));
        setLastFetch(Date.now());
      } else {
        setRecentValues([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch recent values');
    } finally {
      setIsLoading(false);
    }
  }, [fieldType, limit, cacheKey]);

  const saveRecentValue = useCallback(
    async (value: string, formName: string | null = null) => {
      const trimmed = value.trim();
      if (!fieldType || !trimmed) return;
      if (recentValues[0] === trimmed) return;

      try {
        const client = getContractsClient();
        const result = await client.recentValues.save({
          body: {
            fieldType,
            fieldValue: trimmed,
            ...(formName !== null && { formName }),
          },
        });

        if (result.status === 201) {
          setRecentValues((prev) =>
            [trimmed, ...prev.filter((v) => v !== trimmed)].slice(0, limit)
          );
          const newValues = [trimmed, ...recentValues.filter((v) => v !== trimmed)].slice(0, limit);
          localStorage.setItem(
            cacheKey,
            JSON.stringify({ values: newValues, timestamp: Date.now() })
          );
        }
      } catch (err) {
        console.error('[useRecentValuesTyped] Error saving recent value:', err);
      }
    },
    [fieldType, recentValues, limit, cacheKey]
  );

  const clearRecentValues = useCallback(async () => {
    if (!fieldType) return;
    try {
      const client = getContractsClient();
      const result = await client.recentValues.clearByFieldType({
        params: { fieldType },
      });
      if (result.status === 200) {
        setRecentValues([]);
        localStorage.removeItem(cacheKey);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear recent values');
    }
  }, [fieldType, cacheKey]);

  const refresh = useCallback(() => {
    localStorage.removeItem(cacheKey);
    void fetchRecentValues();
  }, [fetchRecentValues, cacheKey]);

  const hasRecentValue = useCallback(
    (value: string) => recentValues.includes(value.trim()),
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
}

export default useRecentValuesTyped;
