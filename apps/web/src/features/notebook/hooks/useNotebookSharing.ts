/**
 * React Query hooks for the notebook sharing endpoints.
 *
 * Wraps the typed ts-rest client (`notebookSharing` namespace) — the body
 * shapes are inferred from the contract, so request payloads are checked
 * at compile time and responses are status-narrowed.
 */
import {
  type NotebookAudience,
  type NotebookEditPolicy,
  type NotebookShareMode,
  type NotebookUserGroup,
  type NotebookGroupShare,
  type NotebookShareSettings,
  type PublicOwnership,
} from '@gruenerator/contracts';
import { getContractsClient } from '@gruenerator/shared/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

const SHARE_SETTINGS_KEY = (id: string) => ['notebook', 'share', 'settings', id];
const GROUP_SHARES_KEY = (id: string) => ['notebook', 'share', 'groups', id];
const MY_GROUPS_KEY = ['notebook', 'share', 'my-groups'];

export function useNotebookShareSettings(notebookId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: notebookId ? SHARE_SETTINGS_KEY(notebookId) : ['notebook', 'share', 'settings', '_'],
    enabled: enabled && !!notebookId,
    retry: false,
    queryFn: async (): Promise<NotebookShareSettings> => {
      const client = getContractsClient();
      const result = await client.notebookSharing.getShareSettings({
        params: { id: notebookId as string },
      });
      if (result.status !== 200) {
        throw new Error(`Failed to fetch share settings (HTTP ${result.status})`);
      }
      return result.body;
    },
  });
}

export function useNotebookGroupShares(notebookId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: notebookId ? GROUP_SHARES_KEY(notebookId) : ['notebook', 'share', 'groups', '_'],
    enabled: enabled && !!notebookId,
    retry: false,
    queryFn: async (): Promise<NotebookGroupShare[]> => {
      const client = getContractsClient();
      const result = await client.notebookSharing.listGroupShares({
        params: { id: notebookId as string },
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

export function useSetNotebookShareMode(notebookId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (mode: NotebookShareMode) => {
      const client = getContractsClient();
      const result = await client.notebookSharing.setShareMode({
        params: { id: notebookId },
        body: { mode },
      });
      if (result.status !== 200) {
        throw new Error(`Failed to set share mode (HTTP ${result.status})`);
      }
      return result.body;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: SHARE_SETTINGS_KEY(notebookId) });
      void qc.invalidateQueries({ queryKey: ['notebookCollections'] });
      void qc.invalidateQueries({ queryKey: ['notebook', 'collection'] });
    },
  });
}

export function useSetNotebookAudience(notebookId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (audience: NotebookAudience) => {
      const client = getContractsClient();
      const result = await client.notebookSharing.setAudience({
        params: { id: notebookId },
        body: { audience },
      });
      if (result.status !== 200) {
        throw new Error(`Failed to set audience (HTTP ${result.status})`);
      }
      return result.body;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: SHARE_SETTINGS_KEY(notebookId) });
      void qc.invalidateQueries({ queryKey: ['notebookCollections'] });
      void qc.invalidateQueries({ queryKey: ['notebook', 'collection'] });
    },
  });
}

export function useSetNotebookIsPublic(notebookId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { is_public: boolean; public_ownership: PublicOwnership | null }) => {
      const client = getContractsClient();
      const result = await client.notebookSharing.setIsPublic({
        params: { id: notebookId },
        body: input,
      });
      if (result.status !== 200) {
        throw new Error(`Failed to set Von-der-Basis discovery (HTTP ${result.status})`);
      }
      return result.body;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: SHARE_SETTINGS_KEY(notebookId) });
      void qc.invalidateQueries({ queryKey: ['notebookCollections'] });
      void qc.invalidateQueries({ queryKey: ['notebook', 'collection'] });
    },
  });
}

export function useSetNotebookEditPolicy(notebookId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (policy: NotebookEditPolicy) => {
      const client = getContractsClient();
      const result = await client.notebookSharing.setEditPolicy({
        params: { id: notebookId },
        body: { policy },
      });
      if (result.status !== 200) {
        throw new Error(`Failed to set edit policy (HTTP ${result.status})`);
      }
      return result.body;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: SHARE_SETTINGS_KEY(notebookId) });
    },
  });
}

export function useAddNotebookGroupShare(notebookId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (groupId: string) => {
      const client = getContractsClient();
      const result = await client.notebookSharing.addGroupShare({
        params: { id: notebookId },
        body: { group_id: groupId },
      });
      if (result.status !== 201) {
        throw new Error(`Failed to add group share (HTTP ${result.status})`);
      }
      return result.body;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: GROUP_SHARES_KEY(notebookId) });
    },
  });
}

export function useRemoveNotebookGroupShare(notebookId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (groupId: string) => {
      const client = getContractsClient();
      const result = await client.notebookSharing.deleteGroupShare({
        params: { id: notebookId, groupId },
      });
      if (result.status !== 200) {
        throw new Error(`Failed to remove group share (HTTP ${result.status})`);
      }
      return result.body;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: GROUP_SHARES_KEY(notebookId) });
    },
  });
}
