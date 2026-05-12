/**
 * useRecentValuesTyped — typed recent-form-values hook.
 *
 * Uses ts-rest contracts client for compile-time-checked request/response shapes.
 * Server state lives in TanStack Query; localStorage seeds initialData so reloads
 * don't flicker while the network roundtrip happens.
 */

import { getContractsClient } from '@gruenerator/shared/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';

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

interface CachedValues {
  values: string[];
  timestamp: number;
}

const recentValuesKey = (fieldType: string, limit: number) =>
  ['recent-values', fieldType, limit] as const;

const readCache = (cacheKey: string, cacheTimeout: number): CachedValues | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(cacheKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedValues;
    if (Date.now() - parsed.timestamp < cacheTimeout) return parsed;
  } catch {
    // invalid cache
  }
  return null;
};

const writeCache = (cacheKey: string, values: string[]): number => {
  const timestamp = Date.now();
  try {
    localStorage.setItem(cacheKey, JSON.stringify({ values, timestamp }));
  } catch {
    // quota / disabled storage
  }
  return timestamp;
};

export function useRecentValuesTyped(
  fieldType: string,
  options: UseRecentValuesOptions = {}
): UseRecentValuesReturn {
  const { limit = 5, cacheTimeout = 5 * 60 * 1000 } = options;
  const cacheKey = `recentValues_${fieldType}`;
  const queryClient = useQueryClient();
  const queryKey = recentValuesKey(fieldType, limit);

  const [initialCache] = useState(() => readCache(cacheKey, cacheTimeout));
  const [lastFetch, setLastFetch] = useState<number | null>(initialCache?.timestamp ?? null);

  const query = useQuery<string[], Error>({
    queryKey,
    queryFn: async () => {
      const client = getContractsClient();
      const result = await client.recentValues.getByFieldType({
        params: { fieldType },
        query: { limit: String(limit) },
      });
      if (result.status !== 200) return [];
      const values = result.body.data.map((item) => item.field_value);
      setLastFetch(writeCache(cacheKey, values));
      return values;
    },
    enabled: Boolean(fieldType),
    staleTime: cacheTimeout,
    initialData: initialCache?.values,
    initialDataUpdatedAt: initialCache?.timestamp,
  });

  const recentValues = query.data ?? [];

  const saveMutation = useMutation({
    mutationFn: async ({ value, formName }: { value: string; formName: string | null }) => {
      const client = getContractsClient();
      const result = await client.recentValues.save({
        body: {
          fieldType,
          fieldValue: value,
          ...(formName !== null && { formName }),
        },
      });
      return result.status === 201 ? value : null;
    },
    onSuccess: (savedValue) => {
      if (!savedValue) return;
      queryClient.setQueryData<string[]>(queryKey, (prev) => {
        const next = [savedValue, ...(prev ?? []).filter((v) => v !== savedValue)].slice(0, limit);
        writeCache(cacheKey, next);
        return next;
      });
    },
  });

  const clearMutation = useMutation({
    mutationFn: async () => {
      const client = getContractsClient();
      const result = await client.recentValues.clearByFieldType({ params: { fieldType } });
      return result.status === 200;
    },
    onSuccess: (ok) => {
      if (!ok) return;
      queryClient.setQueryData<string[]>(queryKey, []);
      try {
        localStorage.removeItem(cacheKey);
      } catch {
        // ignore
      }
    },
  });

  const saveRecentValue = useCallback(
    async (value: string, formName: string | null = null) => {
      const trimmed = value.trim();
      if (!fieldType || !trimmed) return;
      if (recentValues[0] === trimmed) return;
      await saveMutation.mutateAsync({ value: trimmed, formName });
    },
    [fieldType, recentValues, saveMutation]
  );

  const clearRecentValues = useCallback(async () => {
    if (!fieldType) return;
    await clearMutation.mutateAsync();
  }, [fieldType, clearMutation]);

  const refresh = useCallback(() => {
    try {
      localStorage.removeItem(cacheKey);
    } catch {
      // ignore
    }
    void query.refetch();
  }, [cacheKey, query]);

  const hasRecentValue = useCallback(
    (value: string) => recentValues.includes(value.trim()),
    [recentValues]
  );

  const errorMessage = query.error
    ? query.error.message
    : clearMutation.error instanceof Error
      ? clearMutation.error.message
      : null;

  return {
    recentValues,
    isLoading: query.isLoading,
    error: errorMessage,
    saveRecentValue,
    clearRecentValues,
    refresh,
    hasRecentValue,
    isEmpty: recentValues.length === 0,
    lastFetch,
  };
}

export default useRecentValuesTyped;
