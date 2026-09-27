import { useHiddenAgentIdentifiers } from '@gruenerator/chat';
import { type Agent } from '@gruenerator/shared/agents';
import { useMemo } from 'react';

import { useUserAgents } from '../agents/api';

import { buildFeatureIndex, type FeatureHit } from './featureIndex';

import { useAuthStore } from '@/stores/authStore';

/** Stable reference: a `= []` default would rebuild the index on every render. */
const NO_AGENTS: Agent[] = [];

/**
 * The client-side feature/tool/agent index, memoized per locale + user agents.
 * Shared by the sidebar palette and the "Arbeiten" composer so both match tools
 * (e.g. "reel" → Reel) from one source of truth.
 */
export function useFeatureIndex(): FeatureHit[] {
  const locale = useAuthStore((state) => state.locale);
  const { data: userAgents = NO_AGENTS } = useUserAgents();
  const hiddenAgentIdentifiers = useHiddenAgentIdentifiers();
  const hiddenKey = hiddenAgentIdentifiers.join(',');
  return useMemo(
    () =>
      buildFeatureIndex({
        isAustrian: locale === 'de-AT',
        locale,
        userAgents,
        hiddenAgentIdentifiers,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- die Array-Identität wechselt bei jedem Abruf; `hiddenKey` ist die stabile Abhängigkeit
    [locale, userAgents, hiddenKey]
  );
}
