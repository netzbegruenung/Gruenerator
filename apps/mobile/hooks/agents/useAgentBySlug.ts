import {
  resolveAgentBySlug,
  useAgentLink,
  usePublicUserAgents,
  useUserAgents,
  type AgentLookupResult,
} from '@gruenerator/shared/grueneratoren';
import { shareLinkKey } from '@gruenerator/shared/utils';

import { useSharedUserAgents } from './useSharedUserAgents';

/**
 * Ein Agent der Detailseite, über denselben Verweis wie im Web (`agentRef`):
 * System, eigene, dann fremde per uuid (`resolveAgentBySlug`). „Nicht gefunden"
 * erst, wenn alle drei Listen geantwortet haben — ein geteilter Agent kommt aus
 * der zweiten oder dritten. Ein Teilen-Link, den keine Liste kennt („Mit
 * Anmeldung", nicht gelistet), fragt danach den Server (`useAgentLink`).
 */
export function useAgentBySlug(slug: string | undefined): AgentLookupResult & {
  isLoading: boolean;
  isError: boolean;
} {
  const own = useUserAgents();
  const shared = useSharedUserAgents();
  const pub = usePublicUserAgents();
  const listsLoading = own.isLoading || shared.isLoading || pub.isLoading;
  const result = slug
    ? resolveAgentBySlug(slug, {
        own: own.data ?? [],
        shared: (shared.data ?? []).map((e) => e.agent),
        public: pub.data ?? [],
      })
    : { agent: null, isUserAgent: false, isOwn: false };
  const decoded = slug ? decodeURIComponent(slug) : '';
  const askServer = !listsLoading && !result.agent && shareLinkKey(decoded) !== null;
  const link = useAgentLink(askServer ? decoded : null);

  if (link.data) {
    return { agent: link.data, isUserAgent: true, isOwn: false, isLoading: false, isError: false };
  }
  // Eine gescheiterte Liste ist kein „gibt es nicht" — sie hätte ihn liefern können.
  const isError = !result.agent && (own.isError || shared.isError || pub.isError || link.isError);
  return { ...result, isLoading: listsLoading || link.isLoading, isError };
}
