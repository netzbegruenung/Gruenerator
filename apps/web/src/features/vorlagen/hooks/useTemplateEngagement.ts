import { type TemplateEngagementResponse } from '@gruenerator/contracts';
import { ApiError, getContractsClient } from '@gruenerator/shared/api';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { useAuthStore } from '../../../stores/authStore';

/** Prefix of every engagement query; likes patch all of them. */
export const TEMPLATE_ENGAGEMENT_KEY = ['templateEngagement'] as const;

/**
 * Like counts for a set of Vorlagen — user templates and
 * Grünerator catalogue entries alike, keyed by their gallery id.
 */
export function useTemplateEngagement(ids: readonly string[]) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const joined = ids.join(',');
  const queryKey = useMemo(() => [...TEMPLATE_ENGAGEMENT_KEY, joined] as const, [joined]);
  const query = useQuery({
    queryKey,
    enabled: isAuthenticated && joined.length > 0,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
    queryFn: async (): Promise<TemplateEngagementResponse> => {
      const res = await getContractsClient().templateInteractions.getTemplateEngagement({
        query: { ids: joined },
      });
      if (res.status !== 200) {
        throw new ApiError(res.status, 'Reaktionen konnten nicht geladen werden.');
      }
      return res.body;
    },
  });

  const byId = useMemo(
    () => new Map((query.data?.items ?? []).map((item) => [item.id, item])),
    [query.data]
  );

  return { byId };
}
