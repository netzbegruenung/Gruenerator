import { type GroupPostCreatedResponse, type GroupShareComment } from '@gruenerator/contracts';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { apiErrorFromResponse, getContractsClient, getGlobalApiClient } from '../api/index.js';

import {
  GROUPS_QUERY_KEY,
  groupContentKey,
  groupDetailsKey,
  groupMembersKey,
  groupShareCommentsKey,
  type GroupDetail,
  type GroupLink,
  type GroupMember,
  type GroupMembership,
  type GroupSummary,
  type VerifyTokenResult,
} from './types.js';

// `errMessage` moved next to `ApiError`, where `apiErrorFromResponse` uses it.
// Re-exported so the groups barrel and its consumers resolve it unchanged.
export { errMessage } from '../api/index.js';

export const useUserGroups = (options: { enabled?: boolean } = {}) =>
  useQuery({
    queryKey: GROUPS_QUERY_KEY,
    queryFn: async (): Promise<GroupSummary[]> => {
      const res = await getContractsClient().groups.listUserGroups();
      if (res.status !== 200) throw apiErrorFromResponse(res, 'Fehler beim Laden der Gruppen.');
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
      if (res.status !== 200)
        throw apiErrorFromResponse(res, 'Fehler beim Laden der Gruppendetails.');
      return {
        group: res.body.group,
        membership: res.body.membership as GroupMembership,
      };
    },
    enabled: !!groupId,
    staleTime: 60 * 1000,
    // Opening a Projekt must not show a name/role from an earlier visit.
    refetchOnMount: 'always',
    // Callers render this failure inline (GroupDetailSection has its own 403
    // panel, ChatPage only loses a greeting name), so the global query toast
    // stays out of it.
    meta: { silent: true },
  });

export const useGroupMembers = (groupId: string | null | undefined) =>
  useQuery({
    queryKey: groupMembersKey(groupId ?? ''),
    queryFn: async (): Promise<GroupMember[]> => {
      const res = await getContractsClient().groups.listMembers({
        params: { groupId: groupId ?? '' },
      });
      if (res.status !== 200)
        throw apiErrorFromResponse(res, 'Fehler beim Laden der Gruppenmitglieder.');
      return res.body.members as GroupMember[];
    },
    enabled: !!groupId,
    staleTime: 2 * 60 * 1000,
  });

export const useCreateGroup = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      name: string;
      description?: string;
      groupType?: 'standard' | 'personal';
    }) => {
      const res = await getContractsClient().groups.createGroup({
        body: {
          name: input.name,
          description: input.description,
          ...(input.groupType ? { groupType: input.groupType } : {}),
        },
      });
      if (res.status !== 200) throw apiErrorFromResponse(res, 'Fehler beim Erstellen des Space.');
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
      if (res.status !== 200) throw apiErrorFromResponse(res);
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
      if (res.status !== 200) throw apiErrorFromResponse(res);
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
      if (res.status !== 200) throw apiErrorFromResponse(res);
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
      if (res.status !== 200) throw apiErrorFromResponse(res);
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
      if (res.status !== 200) throw apiErrorFromResponse(res);
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
      if (res.status !== 200) throw apiErrorFromResponse(res);
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
      if (res.status !== 200) throw apiErrorFromResponse(res);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: groupMembersKey(groupId) });
    },
  });
};

/**
 * Mute/unmute the caller's own email + push notifications for a group. In-app
 * notifications are unaffected. Operates on the caller's membership, so any
 * member (not just admins) can toggle it.
 */
export const useSetGroupMute = (groupId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (muted: boolean) => {
      const res = await getContractsClient().groups.setGroupMute({
        params: { groupId },
        body: { muted },
      });
      if (res.status !== 200) throw apiErrorFromResponse(res);
      return res.body.muted;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: groupDetailsKey(groupId) });
    },
  });
};

export const useAddGroupLink = (groupId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (link: Omit<GroupLink, 'id'>) => {
      const res = await getContractsClient().groups.addLink({ params: { groupId }, body: link });
      if (res.status !== 200) throw apiErrorFromResponse(res);
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
      if (res.status !== 200) throw apiErrorFromResponse(res);
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
      if (res.status !== 200) throw apiErrorFromResponse(res, 'Fehler beim Löschen des Links.');
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

// ── Feed: eigene Beiträge ───────────────────────────────────────────────────

/**
 * Beitrag mit Text und Dateien schreiben. Multipart, daher der rohe Client
 * wie beim Avatar. Web übergibt `File`s; eine fertige `FormData` (Felder
 * `body` und `files`) geht unverändert durch.
 */
export const useCreateGroupPost = (groupId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      body: string;
      files: File[];
      onProgress?: (fraction: number) => void;
    }): Promise<GroupPostCreatedResponse> => {
      const formData = new FormData();
      formData.append('body', input.body);
      for (const file of input.files) formData.append('files', file, file.name);
      const res = await getGlobalApiClient().post<GroupPostCreatedResponse>(
        `/auth/groups/${groupId}/posts`,
        formData,
        {
          headers: { 'Content-Type': 'multipart/form-data' },
          onUploadProgress: (e: { loaded: number; total?: number }) => {
            if (e.total) input.onProgress?.(e.loaded / e.total);
          },
        }
      );
      return res.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: groupContentKey(groupId) });
    },
  });
};

export const useUpdateGroupPost = (groupId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { postId: string; body: string }) => {
      const res = await getContractsClient().groups.updateGroupPost({
        params: { groupId, postId: input.postId },
        body: { body: input.body },
      });
      if (res.status !== 200)
        throw apiErrorFromResponse(res, 'Beitrag konnte nicht geändert werden.');
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: groupContentKey(groupId) });
    },
  });
};

export const useDeleteGroupPost = (groupId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (postId: string) => {
      const res = await getContractsClient().groups.deleteGroupPost({
        params: { groupId, postId },
      });
      if (res.status !== 200)
        throw apiErrorFromResponse(res, 'Beitrag konnte nicht gelöscht werden.');
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: groupContentKey(groupId) });
    },
  });
};

// ── Feed: Anheften, Notiz, Kommentare ────────────────────────────────────────

export const useUpdateGroupShare = (groupId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { shareId: string; pinned?: boolean; note?: string }) => {
      const res = await getContractsClient().groups.updateGroupShare({
        params: { groupId, shareId: input.shareId },
        body: { pinned: input.pinned ?? null, note: input.note ?? null },
      });
      if (res.status !== 200)
        throw apiErrorFromResponse(res, 'Beitrag konnte nicht geändert werden.');
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: groupContentKey(groupId) });
    },
  });
};

// The groups client does not validate responses, so the schema default never runs:
// a server from before reactions sends comments without the field.
const withReactions = (c: GroupShareComment): GroupShareComment => ({
  ...c,
  reactions: (c.reactions as GroupShareComment['reactions'] | undefined) ?? [],
});

export const useGroupShareComments = (
  groupId: string,
  shareId: string,
  options: { enabled?: boolean } = {}
) =>
  useQuery({
    queryKey: groupShareCommentsKey(groupId, shareId),
    queryFn: async (): Promise<GroupShareComment[]> => {
      const res = await getContractsClient().groups.listGroupShareComments({
        params: { groupId, shareId },
      });
      if (res.status !== 200)
        throw apiErrorFromResponse(res, 'Kommentare konnten nicht geladen werden.');
      return res.body.comments.map(withReactions);
    },
    enabled: (options.enabled ?? true) && !!groupId && !!shareId,
    staleTime: 30 * 1000,
  });

export const useAddGroupShareComment = (groupId: string, shareId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { body: string; parentId?: string | null }) => {
      const res = await getContractsClient().groups.createGroupShareComment({
        params: { groupId, shareId },
        body: input,
      });
      if (res.status !== 201)
        throw apiErrorFromResponse(res, 'Kommentar konnte nicht gesendet werden.');
      return withReactions(res.body.comment);
    },
    onSuccess: (comment) => {
      qc.setQueryData<GroupShareComment[]>(groupShareCommentsKey(groupId, shareId), (prev) => [
        ...(prev ?? []),
        comment,
      ]);
      void qc.invalidateQueries({ queryKey: groupContentKey(groupId) });
    },
  });
};

export const useDeleteGroupShareComment = (groupId: string, shareId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (commentId: string) => {
      const res = await getContractsClient().groups.deleteGroupShareComment({
        params: { groupId, shareId, commentId },
      });
      if (res.status !== 200)
        throw apiErrorFromResponse(res, 'Kommentar konnte nicht gelöscht werden.');
      return commentId;
    },
    onSuccess: (commentId) => {
      // Wie der Server (ON DELETE SET NULL): Antworten bleiben und rücken nach oben.
      qc.setQueryData<GroupShareComment[]>(groupShareCommentsKey(groupId, shareId), (prev) =>
        (prev ?? [])
          .filter((c) => c.id !== commentId)
          .map((c) => (c.parentId === commentId ? { ...c, parentId: null } : c))
      );
      void qc.invalidateQueries({ queryKey: groupContentKey(groupId) });
    },
  });
};
