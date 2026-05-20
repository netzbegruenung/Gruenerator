import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { getContractsClient, getGlobalApiClient } from '../api/index.js';

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

/**
 * Safely read a `message` off a ts-rest error body. The client response type
 * widens the body to `unknown` for non-2xx (undeclared) statuses, so we extract
 * defensively rather than asserting the error-schema shape.
 */
export function errMessage(body: unknown, fallback = 'Aktion fehlgeschlagen.'): string {
  if (body && typeof body === 'object' && 'message' in body) {
    const m = (body as { message?: unknown }).message;
    if (typeof m === 'string') return m;
  }
  return fallback;
}

export const useUserGroups = (options: { enabled?: boolean } = {}) =>
  useQuery({
    queryKey: GROUPS_QUERY_KEY,
    queryFn: async (): Promise<GroupSummary[]> => {
      const res = await getContractsClient().groups.listUserGroups();
      if (res.status !== 200) throw new Error('Fehler beim Laden der Gruppen.');
      return res.body.groups as GroupSummary[];
    },
    staleTime: 2 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    enabled: options.enabled ?? true,
  });

export const useGroupDetails = (groupId: string | null | undefined) =>
  useQuery({
    queryKey: groupDetailsKey(groupId ?? ''),
    queryFn: async (): Promise<{ group: GroupDetail; membership: GroupMembership }> => {
      const res = await getContractsClient().groups.getDetails({
        params: { groupId: groupId ?? '' },
      });
      if (res.status !== 200) throw new Error('Fehler beim Laden der Gruppendetails.');
      return {
        group: res.body.group as GroupDetail,
        membership: res.body.membership as GroupMembership,
      };
    },
    enabled: !!groupId,
    staleTime: 60 * 1000,
  });

export const useGroupMembers = (groupId: string | null | undefined) =>
  useQuery({
    queryKey: groupMembersKey(groupId ?? ''),
    queryFn: async (): Promise<GroupMember[]> => {
      const res = await getContractsClient().groups.listMembers({
        params: { groupId: groupId ?? '' },
      });
      if (res.status !== 200) throw new Error('Fehler beim Laden der Gruppenmitglieder.');
      return res.body.members as GroupMember[];
    },
    enabled: !!groupId,
    staleTime: 2 * 60 * 1000,
  });

export const useCreateGroup = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; description?: string }) => {
      const res = await getContractsClient().groups.createGroup({
        body: { name: input.name, description: input.description },
      });
      if (res.status !== 200) throw new Error('Fehler beim Erstellen der Gruppe.');
      return res.body.group as GroupSummary;
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
      const res = await getContractsClient().groups.deleteGroup({ params: { groupId } });
      if (res.status !== 200) throw new Error(errMessage(res.body));
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
      const res = await getContractsClient().groups.updateInfo({
        params: { groupId },
        body: input,
      });
      if (res.status !== 200) throw new Error(errMessage(res.body));
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
      const res = await getContractsClient().groups.updateName({
        params: { groupId },
        body: { name },
      });
      if (res.status !== 200) throw new Error(errMessage(res.body));
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
      const res = await getContractsClient().groups.verifyToken({
        params: { joinToken: joinToken ?? '' },
      });
      if (res.status !== 200) throw new Error(errMessage(res.body));
      return { group: res.body.group, alreadyMember: res.body.alreadyMember };
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
      const res = await getContractsClient().groups.joinByToken({ body: { joinToken } });
      if (res.status !== 200) throw new Error(errMessage(res.body));
      return { group: res.body.group, alreadyMember: res.body.alreadyMember ?? false };
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
      const res = await getContractsClient().groups.leaveGroup({ params: { groupId } });
      if (res.status !== 200) throw new Error(errMessage(res.body));
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
      const res = await getContractsClient().groups.updateMemberRole({
        params: { groupId, memberId: input.memberId },
        body: { role: input.role },
      });
      if (res.status !== 200) throw new Error(errMessage(res.body));
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
      const res = await getContractsClient().groups.addLink({ params: { groupId }, body: link });
      if (res.status !== 200) throw new Error(errMessage(res.body));
      return res.body.link as GroupLink;
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
      const res = await getContractsClient().groups.updateLink({
        params: { groupId, linkId },
        body: link,
      });
      if (res.status !== 200) throw new Error(errMessage(res.body));
      return res.body.link as GroupLink;
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
      const res = await getContractsClient().groups.deleteLink({ params: { groupId, linkId } });
      if (res.status !== 200)
        throw new Error(errMessage(res.body, 'Fehler beim Löschen des Links.'));
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
 *
 * Stays on the raw axios client: ts-rest models `multipart/form-data` poorly,
 * so the avatar endpoints remain on the legacy router.
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
