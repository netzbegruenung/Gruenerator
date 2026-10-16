import {
  useSharedSystemAgents as useSharedSystemAgentsFor,
  useSharedUserAgents as useSharedUserAgentsFor,
  useUserAgents as useUserAgentsQuery,
} from '@gruenerator/shared/grueneratoren';

import { useOptimizedAuth } from '../../hooks/useAuth';
import { useGroups } from '../groups/hooks/useGroups';

// The hooks live in `@gruenerator/shared/grueneratoren` (shared with mobile).
// This file binds the three that need web state — the auth gate and the
// group list — and stays the import (and `vi.mock`) seat for web callers.
export {
  useCreateUserAgent,
  useDeleteUserAgent,
  useDraftAgent,
  usePublicUserAgents,
  useShareSystemAgentWithGroup,
  useUpdateUserAgent,
  useUserAgent,
  type ForeignAgent,
  type SharedAgentEntry,
  type UserAgentInput,
  type UserAgentPatch,
} from '@gruenerator/shared/grueneratoren';

export function useUserAgents() {
  const { user, isAuthenticated, loading: authLoading } = useOptimizedAuth();
  return useUserAgentsQuery(!!user?.id && isAuthenticated && !authLoading);
}

export function useSharedSystemAgents() {
  const { userGroups } = useGroups({ isActive: true });
  return useSharedSystemAgentsFor(userGroups);
}

export function useSharedUserAgents() {
  const { userGroups } = useGroups({ isActive: true });
  return useSharedUserAgentsFor(userGroups);
}
