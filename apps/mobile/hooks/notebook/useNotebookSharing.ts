import { getContractsClient } from '@gruenerator/shared/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export type ShareMode = 'private' | 'groups' | 'authenticated';
export type EditPolicy = 'owner_only' | 'group_admins' | 'all_members';
export type Audience = 'de-DE' | 'de-AT';

export interface ShareSettings {
  share_mode: ShareMode;
  edit_policy: EditPolicy;
  audience: Audience;
  is_public: boolean;
  public_ownership: 'owner' | 'public_data' | null;
}

export interface UserGroup {
  id: string;
  name: string;
  role: string;
}

export interface GroupShare {
  group_id: string;
  group_name: string;
  shared_at: string;
}

/**
 * Read + mutate a user notebook's share settings via the `notebookSharing` contract.
 * Mirrors web's `useNotebookSharing`: the two axes are `share_mode` (who can read) and
 * `edit_policy` (who can write); group shares live in the polymorphic shares table; the
 * Von-der-Basis toggle (`is_public`) sits on top of `share_mode='authenticated'`.
 */
export function useNotebookSharing(notebookId: string, enabled: boolean) {
  const client = getContractsClient().notebookSharing;
  const qc = useQueryClient();
  const settingsKey = ['notebook', notebookId, 'share-settings'];
  const groupSharesKey = ['notebook', notebookId, 'group-shares'];

  const settings = useQuery({
    queryKey: settingsKey,
    enabled,
    queryFn: async (): Promise<ShareSettings> => {
      const res = await client.getShareSettings({ params: { id: notebookId } });
      if (res.status !== 200) throw new Error('Freigabe-Einstellungen nicht verfügbar');
      return res.body;
    },
  });

  const myGroups = useQuery({
    queryKey: ['notebook', 'my-groups'],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<UserGroup[]> => {
      const res = await client.listMyGroups({});
      return res.status === 200 ? res.body : [];
    },
  });

  const groupShares = useQuery({
    queryKey: groupSharesKey,
    enabled: enabled && settings.data?.share_mode === 'groups',
    queryFn: async (): Promise<GroupShare[]> => {
      const res = await client.listGroupShares({ params: { id: notebookId } });
      return res.status === 200 ? res.body : [];
    },
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: settingsKey });
    void qc.invalidateQueries({ queryKey: groupSharesKey });
  };

  const setShareMode = useMutation({
    mutationFn: async (mode: ShareMode) => {
      const res = await client.setShareMode({ params: { id: notebookId }, body: { mode } });
      if (res.status !== 200) throw new Error('Freigabe konnte nicht geändert werden');
    },
    onSuccess: invalidate,
  });

  const setEditPolicy = useMutation({
    mutationFn: async (policy: EditPolicy) => {
      const res = await client.setEditPolicy({ params: { id: notebookId }, body: { policy } });
      if (res.status !== 200) throw new Error('Bearbeitungsrechte konnten nicht geändert werden');
    },
    onSuccess: invalidate,
  });

  const setAudience = useMutation({
    mutationFn: async (audience: Audience) => {
      const res = await client.setAudience({ params: { id: notebookId }, body: { audience } });
      if (res.status !== 200) throw new Error('Zielgruppe konnte nicht geändert werden');
    },
    onSuccess: invalidate,
  });

  const setIsPublic = useMutation({
    mutationFn: async (isPublic: boolean) => {
      const res = await client.setIsPublic({
        params: { id: notebookId },
        body: { is_public: isPublic, public_ownership: isPublic ? 'owner' : null },
      });
      if (res.status !== 200) throw new Error('Von-der-Basis-Freigabe fehlgeschlagen');
    },
    onSuccess: invalidate,
  });

  const addGroupShare = useMutation({
    mutationFn: async (groupId: string) => {
      const res = await client.addGroupShare({
        params: { id: notebookId },
        body: { group_id: groupId },
      });
      if (res.status !== 201) throw new Error('Gruppe konnte nicht hinzugefügt werden');
    },
    onSuccess: invalidate,
  });

  const removeGroupShare = useMutation({
    mutationFn: async (groupId: string) => {
      const res = await client.deleteGroupShare({
        params: { id: notebookId, groupId },
      });
      if (res.status !== 200) throw new Error('Gruppe konnte nicht entfernt werden');
    },
    onSuccess: invalidate,
  });

  return {
    settings: settings.data ?? null,
    isLoading: settings.isLoading,
    error: settings.error?.message ?? null,
    myGroups: myGroups.data ?? [],
    groupShares: groupShares.data ?? [],
    setShareMode: setShareMode.mutate,
    setEditPolicy: setEditPolicy.mutate,
    setAudience: setAudience.mutate,
    setIsPublic: setIsPublic.mutate,
    addGroupShare: addGroupShare.mutate,
    removeGroupShare: removeGroupShare.mutate,
  };
}
