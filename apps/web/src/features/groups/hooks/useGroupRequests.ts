/**
 * Typed hooks for public-group discovery + admin-moderated join requests.
 * Backed by the ts-rest groups contract via the shared contracts client.
 */
import { getContractsClient } from '@gruenerator/shared/api';
import { GROUPS_QUERY_KEY, groupDetailsKey } from '@gruenerator/shared/groups';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useOptimizedAuth } from '../../../hooks/useAuth';

import type {
  GroupAudience,
  JoinRequest,
  PublicGroup,
  SetGroupVisibilityBody,
} from '@gruenerator/contracts';

export const PUBLIC_GROUPS_QUERY_KEY = ['publicGroups'] as const;
export const groupJoinRequestsKey = (groupId: string) => ['groupJoinRequests', groupId] as const;

export type { JoinRequest, PublicGroup, GroupAudience };

export function useDiscoverPublicGroups() {
  const { user, isAuthenticated, loading } = useOptimizedAuth();
  return useQuery<PublicGroup[]>({
    queryKey: PUBLIC_GROUPS_QUERY_KEY,
    queryFn: async () => {
      const result = await getContractsClient().groups.discoverPublicGroups();
      if (result.status !== 200) {
        throw new Error('Öffentliche Spaces konnten nicht geladen werden.');
      }
      return result.body;
    },
    enabled: !!user?.id && isAuthenticated && !loading,
    staleTime: 60 * 1000,
  });
}

export function useRequestToJoin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (groupId: string) => {
      const result = await getContractsClient().groups.requestToJoin({ params: { groupId } });
      if (result.status !== 201) {
        const message =
          result.status === 409 ? result.body.message : 'Beitrittsanfrage fehlgeschlagen.';
        throw new Error(message);
      }
      return result.body;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: PUBLIC_GROUPS_QUERY_KEY });
    },
  });
}

export function useGroupJoinRequests(groupId: string, enabled: boolean) {
  return useQuery<JoinRequest[]>({
    queryKey: groupJoinRequestsKey(groupId),
    queryFn: async () => {
      const result = await getContractsClient().groups.listJoinRequests({ params: { groupId } });
      if (result.status !== 200) {
        throw new Error('Beitrittsanfragen konnten nicht geladen werden.');
      }
      return result.body;
    },
    enabled: enabled && !!groupId,
  });
}

export function useReviewJoinRequest(groupId: string) {
  const queryClient = useQueryClient();

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: groupJoinRequestsKey(groupId) });
    void queryClient.invalidateQueries({ queryKey: ['groupMembers', groupId] });
    void queryClient.invalidateQueries({ queryKey: GROUPS_QUERY_KEY });
  };

  const approve = useMutation({
    mutationFn: async (requestId: string) => {
      const result = await getContractsClient().groups.approveJoinRequest({
        params: { groupId, requestId },
      });
      if (result.status !== 200) throw new Error('Anfrage konnte nicht angenommen werden.');
      return result.body;
    },
    onSuccess: invalidate,
  });

  const deny = useMutation({
    mutationFn: async (requestId: string) => {
      const result = await getContractsClient().groups.denyJoinRequest({
        params: { groupId, requestId },
      });
      if (result.status !== 200) throw new Error('Anfrage konnte nicht abgelehnt werden.');
      return result.body;
    },
    onSuccess: invalidate,
  });

  return { approve, deny };
}

export function useSetGroupVisibility(groupId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: SetGroupVisibilityBody) => {
      const result = await getContractsClient().groups.setVisibility({
        params: { groupId },
        body,
      });
      if (result.status !== 200) throw new Error('Sichtbarkeit konnte nicht geändert werden.');
      return result.body;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: groupDetailsKey(groupId) });
      void queryClient.invalidateQueries({ queryKey: PUBLIC_GROUPS_QUERY_KEY });
    },
  });
}
