/**
 * React Query hooks for the user-agent (Agentura) sharing endpoints.
 *
 * Wraps the typed ts-rest client (`userAgentsSharing` namespace). Mirrors
 * useNotebookSharing, minus the edit-policy axis (agents are used, not
 * co-edited). The "my groups" dropdown reuses the neutral notebook endpoint
 * (`notebookSharing.listMyGroups`) — there is one canonical groups-of-mine
 * route shared across share dialogs.
 */
import {
  type NotebookAudience,
  type NotebookUserGroup,
  type PublicOwnership,
  type UserAgentGroupShare,
  type UserAgentShareMode,
  type UserAgentShareSettings,
} from '@gruenerator/contracts';
import { getContractsClient } from '@gruenerator/shared/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

const SHARE_SETTINGS_KEY = (id: string) => ['agent', 'share', 'settings', id];
const GROUP_SHARES_KEY = (id: string) => ['agent', 'share', 'groups', id];
const MY_GROUPS_KEY = ['notebook', 'share', 'my-groups']; // shared endpoint

export function useAgentShareSettings(identifier: string | null, enabled: boolean) {
  return useQuery({
    queryKey: identifier ? SHARE_SETTINGS_KEY(identifier) : ['agent', 'share', 'settings', '_'],
    enabled: enabled && !!identifier,
    retry: false,
    queryFn: async (): Promise<UserAgentShareSettings> => {
      const client = getContractsClient();
      const result = await client.userAgentsSharing.getShareSettings({
        params: { identifier: identifier as string },
      });
      if (result.status !== 200) {
        throw new Error(`Failed to fetch share settings (HTTP ${result.status})`);
      }
      return result.body;
    },
  });
}

export function useAgentGroupShares(identifier: string | null, enabled: boolean) {
  return useQuery({
    queryKey: identifier ? GROUP_SHARES_KEY(identifier) : ['agent', 'share', 'groups', '_'],
    enabled: enabled && !!identifier,
    retry: false,
    queryFn: async (): Promise<UserAgentGroupShare[]> => {
      const client = getContractsClient();
      const result = await client.userAgentsSharing.listGroupShares({
        params: { identifier: identifier as string },
      });
      if (result.status !== 200) {
        throw new Error(`Failed to fetch group shares (HTTP ${result.status})`);
      }
      return result.body;
    },
  });
}

export function useMyGroupsForSharing(enabled: boolean) {
  return useQuery({
    queryKey: MY_GROUPS_KEY,
    enabled,
    retry: false,
    queryFn: async (): Promise<NotebookUserGroup[]> => {
      const client = getContractsClient();
      const result = await client.notebookSharing.listMyGroups({});
      if (result.status !== 200) {
        throw new Error(`Failed to fetch user groups (HTTP ${result.status})`);
      }
      return result.body;
    },
  });
}

export function useSetAgentShareMode(identifier: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (mode: UserAgentShareMode) => {
      const client = getContractsClient();
      const result = await client.userAgentsSharing.setShareMode({
        params: { identifier },
        body: { mode },
      });
      if (result.status !== 200) {
        throw new Error(`Failed to set share mode (HTTP ${result.status})`);
      }
      return result.body;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: SHARE_SETTINGS_KEY(identifier) });
    },
  });
}

export function useSetAgentAudience(identifier: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (audience: NotebookAudience) => {
      const client = getContractsClient();
      const result = await client.userAgentsSharing.setAudience({
        params: { identifier },
        body: { audience },
      });
      if (result.status !== 200) {
        throw new Error(`Failed to set audience (HTTP ${result.status})`);
      }
      return result.body;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: SHARE_SETTINGS_KEY(identifier) });
    },
  });
}

export function useSetAgentIsPublic(identifier: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { is_public: boolean; public_ownership: PublicOwnership | null }) => {
      const client = getContractsClient();
      const result = await client.userAgentsSharing.setIsPublic({
        params: { identifier },
        body: input,
      });
      if (result.status !== 200) {
        throw new Error(`Failed to set Agentura listing (HTTP ${result.status})`);
      }
      return result.body;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: SHARE_SETTINGS_KEY(identifier) });
      void qc.invalidateQueries({ queryKey: ['public-user-agents'] });
    },
  });
}

export function useAddAgentGroupShare(identifier: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (groupId: string) => {
      const client = getContractsClient();
      const result = await client.userAgentsSharing.addGroupShare({
        params: { identifier },
        body: { group_id: groupId },
      });
      if (result.status !== 201) {
        throw new Error(`Failed to add group share (HTTP ${result.status})`);
      }
      return result.body;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: GROUP_SHARES_KEY(identifier) });
      void qc.invalidateQueries({ queryKey: ['shared-user-agents'] });
    },
  });
}

export function useRemoveAgentGroupShare(identifier: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (groupId: string) => {
      const client = getContractsClient();
      const result = await client.userAgentsSharing.deleteGroupShare({
        params: { identifier, groupId },
      });
      if (result.status !== 200) {
        throw new Error(`Failed to remove group share (HTTP ${result.status})`);
      }
      return result.body;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: GROUP_SHARES_KEY(identifier) });
      void qc.invalidateQueries({ queryKey: ['shared-user-agents'] });
    },
  });
}
