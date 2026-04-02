import { Button } from '@gruenerator/ui';
import { useState, useEffect, useCallback } from 'react';

import { type DocsApiClient } from '../../context/DocsContext';

interface GroupInfo {
  id: string;
  name: string;
  role: string;
}

interface GroupShare {
  group_id: string;
  group_name: string;
  permission_level: 'editor' | 'viewer';
  shared_at: string;
}

interface GroupShareSectionProps {
  documentId: string;
  apiClient: DocsApiClient;
  onGroupsLoaded?: (hasGroups: boolean) => void;
}

export const GroupShareSection = ({
  documentId,
  apiClient,
  onGroupsLoaded,
}: GroupShareSectionProps) => {
  const [userGroups, setUserGroups] = useState<GroupInfo[]>([]);
  const [groupShares, setGroupShares] = useState<GroupShare[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [selectedPermission, setSelectedPermission] = useState<string>('viewer');
  const [hasLoaded, setHasLoaded] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [groups, shares] = await Promise.all([
        apiClient.get<GroupInfo[]>('/docs/user-groups'),
        apiClient.get<GroupShare[]>(`/docs/${documentId}/groups`),
      ]);
      setUserGroups(groups);
      setGroupShares(shares);
      setError(null);
      onGroupsLoaded?.(groups.length > 0);
    } catch (err) {
      console.error('Failed to fetch group sharing data:', err);
    } finally {
      setHasLoaded(true);
    }
  }, [documentId, apiClient, onGroupsLoaded]);

  useEffect(() => {
    void fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId]);

  const sharedGroupIds = new Set(groupShares.map((s) => s.group_id));
  const availableGroups = userGroups.filter((g) => !sharedGroupIds.has(g.id));

  const handleShare = async () => {
    if (!selectedGroupId) return;

    try {
      setIsSharing(true);
      await apiClient.post(`/docs/${documentId}/groups`, {
        group_id: selectedGroupId,
        permission_level: selectedPermission,
      });
      setSelectedGroupId(null);
      setSelectedPermission('viewer');
      await fetchData();
    } catch (err) {
      console.error('Failed to share with group:', err);
      setError('Fehler beim Teilen mit der Gruppe');
    } finally {
      setIsSharing(false);
    }
  };

  const handleUpdatePermission = async (groupId: string, permissionLevel: string) => {
    try {
      await apiClient.put(`/docs/${documentId}/groups/${groupId}`, {
        permission_level: permissionLevel,
      });
      await fetchData();
    } catch (err) {
      console.error('Failed to update group permission:', err);
      setError('Fehler beim Ändern der Gruppenberechtigung');
    }
  };

  const handleRemove = async (groupId: string) => {
    try {
      await apiClient.delete(`/docs/${documentId}/groups/${groupId}`);
      await fetchData();
    } catch (err) {
      console.error('Failed to remove group share:', err);
      setError('Fehler beim Entfernen der Gruppenfreigabe');
    }
  };

  if (!hasLoaded || userGroups.length === 0) {
    return null;
  }

  return (
    <div className="mb-md">
      <p className="mb-3 text-base font-semibold">Gruppen</p>

      {error && <span className="mb-3 block text-xs text-red-600 dark:text-red-400">{error}</span>}

      {availableGroups.length > 0 && (
        <div className="flex flex-nowrap items-end gap-2">
          <select
            className="h-9 flex-1 rounded-md border border-grey-300 bg-background px-3 text-sm outline-none focus:border-primary-600 focus:ring-1 focus:ring-primary-600 dark:border-grey-600 dark:bg-grey-800"
            value={selectedGroupId ?? ''}
            onChange={(e) => setSelectedGroupId(e.target.value || null)}
          >
            <option value="">Gruppe auswählen</option>
            {availableGroups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
          <select
            className="h-9 w-[130px] rounded-md border border-grey-300 bg-background px-3 text-sm outline-none focus:border-primary-600 focus:ring-1 focus:ring-primary-600 dark:border-grey-600 dark:bg-grey-800"
            value={selectedPermission}
            onChange={(e) => setSelectedPermission(e.target.value)}
          >
            <option value="viewer">Betrachter*in</option>
            <option value="editor">Bearbeiter*in</option>
          </select>
          <Button size="sm" onClick={handleShare} disabled={!selectedGroupId || isSharing}>
            {isSharing ? (
              <span className="flex items-center gap-2">
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-grey-300 border-t-white" />
              </span>
            ) : (
              'Hinzufügen'
            )}
          </Button>
        </div>
      )}

      {groupShares.length > 0 && (
        <div className="mt-3 flex flex-col gap-2">
          {groupShares.map((share) => (
            <div
              key={share.group_id}
              className="flex flex-nowrap items-center justify-between rounded-md border border-grey-200 bg-background p-3 dark:border-grey-700"
            >
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-grey-100 text-sm dark:bg-grey-800">
                  👥
                </div>
                <span className="min-w-0 truncate text-sm font-medium">{share.group_name}</span>
              </div>
              <div className="flex flex-nowrap items-center gap-2">
                <select
                  className="h-7 w-[130px] rounded-md border border-grey-300 bg-background px-2 text-xs outline-none focus:border-primary-600 focus:ring-1 focus:ring-primary-600 dark:border-grey-600 dark:bg-grey-800"
                  value={share.permission_level}
                  onChange={(e) => handleUpdatePermission(share.group_id, e.target.value)}
                >
                  <option value="viewer">Betrachter*in</option>
                  <option value="editor">Bearbeiter*in</option>
                </select>
                <Button variant="outline" size="xs" onClick={() => handleRemove(share.group_id)}>
                  Entfernen
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {groupShares.length === 0 && availableGroups.length > 0 && (
        <span className="mt-2 block text-xs text-grey-500 dark:text-grey-400">
          Noch keine Gruppen hinzugefügt
        </span>
      )}
    </div>
  );
};
