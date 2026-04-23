import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { getGlobalApiClient } from '../api/index.js';

import {
  GROUPS_QUERY_KEY,
  groupDetailsKey,
  groupMembersKey,
  type GroupDetail,
  type GroupLink,
  type GroupMember,
  type GroupMembership,
  type GroupSummary,
  type VerifyTokenResult,
} from './types.js';

export const useUserGroups = (options: { enabled?: boolean } = {}) =>
  useQuery({
    queryKey: GROUPS_QUERY_KEY,
    queryFn: async (): Promise<GroupSummary[]> => {
      const res = await getGlobalApiClient().get<{ groups?: GroupSummary[] }>('/auth/groups');
      return res.data.groups ?? [];
    },
    staleTime: 2 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    enabled: options.enabled ?? true,
  });

export const useGroupDetails = (groupId: string | null | undefined) =>
  useQuery({
    queryKey: groupDetailsKey(groupId ?? ''),
    queryFn: async (): Promise<{ group: GroupDetail; membership: GroupMembership }> => {
      const res = await getGlobalApiClient().get<{
        group: GroupDetail;
        membership: GroupMembership;
      }>(`/auth/groups/${groupId}/details`);
      return { group: res.data.group, membership: res.data.membership };
    },
    enabled: !!groupId,
    staleTime: 60 * 1000,
  });

export const useGroupMembers = (groupId: string | null | undefined) =>
  useQuery({
    queryKey: groupMembersKey(groupId ?? ''),
    queryFn: async (): Promise<GroupMember[]> => {
      const res = await getGlobalApiClient().get<{ members?: GroupMember[] }>(
        `/auth/groups/${groupId}/members`
      );
      return res.data.members ?? [];
    },
    enabled: !!groupId,
    staleTime: 2 * 60 * 1000,
  });

export const useCreateGroup = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; description?: string }) => {
      const res = await getGlobalApiClient().post<{ group: GroupSummary }>('/auth/groups', input);
      return res.data.group;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: GROUPS_QUERY_KEY });
    },
  });
};

export const useDeleteGroup = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (groupId: string) => {
      await getGlobalApiClient().delete(`/auth/groups/${groupId}`);
      return groupId;
    },
    onSuccess: (groupId) => {
      void qc.invalidateQueries({ queryKey: GROUPS_QUERY_KEY });
      qc.removeQueries({ queryKey: groupDetailsKey(groupId) });
      qc.removeQueries({ queryKey: groupMembersKey(groupId) });
    },
  });
};

export const useUpdateGroupInfo = (groupId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      name?: string;
      description?: string | null;
      settings?: Record<string, unknown>;
    }) => {
      await getGlobalApiClient().put(`/auth/groups/${groupId}/info`, input);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: GROUPS_QUERY_KEY });
      void qc.invalidateQueries({ queryKey: groupDetailsKey(groupId) });
    },
  });
};

export const useUpdateGroupName = (groupId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      await getGlobalApiClient().put(`/auth/groups/${groupId}/name`, { name });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: GROUPS_QUERY_KEY });
      void qc.invalidateQueries({ queryKey: groupDetailsKey(groupId) });
    },
  });
};

export const useVerifyJoinToken = (joinToken: string | null | undefined) =>
  useQuery({
    queryKey: ['groupVerifyToken', joinToken],
    queryFn: async (): Promise<VerifyTokenResult> => {
      const res = await getGlobalApiClient().get<{
        group: { id: string; name: string };
        alreadyMember: boolean;
      }>(`/auth/groups/verify-token/${joinToken}`);
      return { group: res.data.group, alreadyMember: res.data.alreadyMember };
    },
    enabled: !!joinToken,
    retry: false,
    staleTime: 0,
    gcTime: 0,
  });

export const useJoinGroup = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (joinToken: string) => {
      const res = await getGlobalApiClient().post<{
        group: { id: string; name: string };
        alreadyMember?: boolean;
      }>('/auth/groups/join', { joinToken });
      return res.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: GROUPS_QUERY_KEY });
    },
  });
};

export const useLeaveGroup = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (groupId: string) => {
      await getGlobalApiClient().delete(`/auth/groups/${groupId}/members/self`);
      return groupId;
    },
    onSuccess: (groupId) => {
      void qc.invalidateQueries({ queryKey: GROUPS_QUERY_KEY });
      qc.removeQueries({ queryKey: groupDetailsKey(groupId) });
      qc.removeQueries({ queryKey: groupMembersKey(groupId) });
    },
  });
};

export const useUpdateMemberRole = (groupId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { memberId: string; role: 'admin' | 'member' }) => {
      await getGlobalApiClient().put(`/auth/groups/${groupId}/members/${input.memberId}/role`, {
        role: input.role,
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: groupMembersKey(groupId) });
    },
  });
};

export const useAddGroupLink = (groupId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (link: Omit<GroupLink, 'id'>) => {
      const res = await getGlobalApiClient().post<{ link: GroupLink }>(
        `/auth/groups/${groupId}/links`,
        link
      );
      return res.data.link;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: groupDetailsKey(groupId) });
    },
  });
};

export const useUpdateGroupLink = (groupId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { linkId: string } & Omit<GroupLink, 'id'>) => {
      const { linkId, ...link } = input;
      const res = await getGlobalApiClient().put<{ link: GroupLink }>(
        `/auth/groups/${groupId}/links/${linkId}`,
        link
      );
      return res.data.link;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: groupDetailsKey(groupId) });
    },
  });
};

export const useDeleteGroupLink = (groupId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (linkId: string) => {
      await getGlobalApiClient().delete(`/auth/groups/${groupId}/links/${linkId}`);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: groupDetailsKey(groupId) });
    },
  });
};

/**
 * Upload a group avatar. Accepts either a `FormData` (already built by the
 * caller) or a web `File`. Mobile builds FormData with `{ uri, name, type }`
 * objects; web passes a `File` directly.
 */
export const useUploadGroupAvatar = (groupId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: FormData | File) => {
      const formData = input instanceof FormData ? input : new FormData();
      if (!(input instanceof FormData)) {
        formData.append('avatar', input);
      }
      const res = await getGlobalApiClient().post<{ avatarUrl?: string }>(
        `/auth/groups/${groupId}/avatar`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );
      return res.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: GROUPS_QUERY_KEY });
      void qc.invalidateQueries({ queryKey: groupDetailsKey(groupId) });
    },
  });
};

export const useDeleteGroupAvatar = (groupId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await getGlobalApiClient().delete(`/auth/groups/${groupId}/avatar`);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: GROUPS_QUERY_KEY });
      void qc.invalidateQueries({ queryKey: groupDetailsKey(groupId) });
    },
  });
};
