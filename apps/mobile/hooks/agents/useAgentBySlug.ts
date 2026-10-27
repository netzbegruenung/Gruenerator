import {
  resolveAgentBySlug,
  usePublicUserAgents,
  useUserAgents,
  type AgentLookupResult,
} from '@gruenerator/shared/grueneratoren';

import { useSharedUserAgents } from './useSharedUserAgents';

/**
 * Ein Agent der Detailseite, über denselben Verweis wie im Web (`agentRef`):
 * System, eigene, dann fremde per uuid (`resolveAgentBySlug`). „Nicht gefunden"
 * erst, wenn alle drei Listen geantwortet haben — ein geteilter Agent kommt aus
 * der zweiten oder dritten.
 */
export function useAgentBySlug(slug: string | undefined): AgentLookupResult & {
  isLoading: boolean;
  isError: boolean;
} {
  const own = useUserAgents();
  const shared = useSharedUserAgents();
  const pub = usePublicUserAgents();
  const isLoading = own.isLoading || shared.isLoading || pub.isLoading;
  if (!slug) return { agent: null, isUserAgent: false, isOwn: false, isLoading, isError: false };
  const result = resolveAgentBySlug(slug, {
    own: own.data ?? [],
    shared: (shared.data ?? []).map((e) => e.agent),
    public: pub.data ?? [],
  });
  // Eine gescheiterte Liste ist kein „gibt es nicht" — sie hätte ihn liefern können.
  const isError = !result.agent && (own.isError || shared.isError || pub.isError);
  return { ...result, isLoading, isError };
}
