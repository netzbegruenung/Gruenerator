import { Button, Group, Select, Stack, Text } from '@mantine/core';
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
}

export const GroupShareSection = ({ documentId, apiClient }: GroupShareSectionProps) => {
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
    } catch (err) {
      console.error('Failed to fetch group sharing data:', err);
    } finally {
      setHasLoaded(true);
    }
  }, [documentId, apiClient]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

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
    <div className="groups-section">
      <Text size="md" fw={600} mb="sm">
        Gruppen
      </Text>

      {error && (
        <Text size="xs" c="red" mb="sm">
          {error}
        </Text>
      )}

      {availableGroups.length > 0 && (
        <div className="group-share-add">
          <Group gap="xs" align="flex-end" wrap="nowrap">
            <Select
              placeholder="Gruppe auswählen"
              value={selectedGroupId}
              onChange={setSelectedGroupId}
              data={availableGroups.map((g) => ({ value: g.id, label: g.name }))}
              searchable
              comboboxProps={{ zIndex: 1100 }}
              style={{ flex: 1 }}
              size="sm"
            />
            <Select
              value={selectedPermission}
              onChange={(val) => val && setSelectedPermission(val)}
              data={[
                { value: 'viewer', label: 'Betrachter' },
                { value: 'editor', label: 'Bearbeiter' },
              ]}
              allowDeselect={false}
              comboboxProps={{ zIndex: 1100 }}
              style={{ width: 130 }}
              size="sm"
            />
            <Button
              size="sm"
              color="var(--primary-600)"
              onClick={handleShare}
              disabled={!selectedGroupId}
              loading={isSharing}
            >
              Hinzufügen
            </Button>
          </Group>
        </div>
      )}

      {groupShares.length > 0 && (
        <Stack gap="sm" mt="sm">
          {groupShares.map((share) => (
            <Group
              key={share.group_id}
              justify="space-between"
              wrap="nowrap"
              className="group-share-item"
            >
              <Text size="sm" fw={500} truncate style={{ flex: 1, minWidth: 0 }}>
                {share.group_name}
              </Text>
              <Group gap="xs" wrap="nowrap">
                <Select
                  size="xs"
                  value={share.permission_level}
                  onChange={(val) => val && handleUpdatePermission(share.group_id, val)}
                  data={[
                    { value: 'viewer', label: 'Betrachter' },
                    { value: 'editor', label: 'Bearbeiter' },
                  ]}
                  allowDeselect={false}
                  comboboxProps={{ zIndex: 1100 }}
                  style={{ width: 130 }}
                />
                <Button
                  variant="default"
                  size="xs"
                  color="red"
                  onClick={() => handleRemove(share.group_id)}
                >
                  Entfernen
                </Button>
              </Group>
            </Group>
          ))}
        </Stack>
      )}

      {groupShares.length === 0 && availableGroups.length > 0 && (
        <Text size="xs" c="dimmed" mt="xs">
          Noch keine Gruppen hinzugefügt
        </Text>
      )}
    </div>
  );
};
