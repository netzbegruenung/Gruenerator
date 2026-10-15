import { useSharedUserAgents as useSharedUserAgentsFor } from '@gruenerator/shared/grueneratoren';

import { useUserGroups } from '../useGroups';

/** Agents, die andere in eines der eigenen Projekte geteilt haben. */
export function useSharedUserAgents() {
  const { data: groups = [] } = useUserGroups();
  return useSharedUserAgentsFor(groups);
}
