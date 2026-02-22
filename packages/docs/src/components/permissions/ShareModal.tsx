import { getAvatarDisplayProps, getRobotAvatarPath } from '@gruenerator/shared/avatar';
import { Alert, Badge, Button, Group, Loader, Select, Stack, Text } from '@mantine/core';
import { useState, useEffect, useCallback, useMemo } from 'react';

import { useDocsAdapter, createDocsApiClient } from '../../context/DocsContext';
import { GroupShareSection } from './GroupShareSection';
import './ShareModal.css';

interface Collaborator {
  user_id: string;
  display_name: string;
  email: string;
  avatar_url?: string;
  avatar_robot_id?: number;
  permission_level: 'owner' | 'editor' | 'viewer';
  granted_at: string;
  granted_by?: string;
}

interface ShareSettings {
  is_public: boolean;
  share_permission: 'viewer' | 'editor';
  share_mode: 'private' | 'authenticated' | 'public';
}

interface ShareModalProps {
  documentId: string;
  onClose: () => void;
}

type ShareMode = 'private' | 'authenticated' | 'public';

const SHARE_MODE_OPTIONS: { value: ShareMode; label: string; description: string }[] = [
  { value: 'private', label: 'Privat', description: 'Nur eingeladene Personen haben Zugriff' },
  {
    value: 'authenticated',
    label: 'Mit Anmeldung',
    description: 'Jeder angemeldete Nutzer mit dem Link kann zugreifen',
  },
  {
    value: 'public',
    label: 'Öffentlich',
    description: 'Jeder mit dem Link kann ohne Anmeldung zugreifen',
  },
];

export const ShareModal = ({ documentId, onClose }: ShareModalProps) => {
  const adapter = useDocsAdapter();
  const apiClient = useMemo(() => createDocsApiClient(adapter), [adapter]);

  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [shareSettings, setShareSettings] = useState<ShareSettings>({
    is_public: false,
    share_permission: 'editor',
    share_mode: 'private',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);
  const [isChangingMode, setIsChangingMode] = useState(false);

  const fetchCollaborators = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await apiClient.get<Collaborator[]>(`/docs/${documentId}/permissions`);
      setCollaborators(data);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch collaborators:', err);
      setError('Fehler beim Laden der Mitarbeiter');
    } finally {
      setIsLoading(false);
    }
  }, [documentId, apiClient]);

  const fetchShareSettings = useCallback(async () => {
    try {
      const data = await apiClient.get<ShareSettings>(`/docs/${documentId}/share`);
      setShareSettings({
        is_public: data.is_public,
        share_permission: data.share_permission || 'editor',
        share_mode: data.share_mode || (data.is_public ? 'public' : 'private'),
      });
    } catch (err) {
      console.error('Failed to fetch share settings:', err);
    }
  }, [documentId, apiClient]);

  useEffect(() => {
    void fetchCollaborators();
    void fetchShareSettings();
  }, [fetchCollaborators, fetchShareSettings]);

  const copyShareLink = async () => {
    const shareUrl = `${window.location.origin}/document/${documentId}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      console.error('Failed to copy link:', err);
      setError('Fehler beim Kopieren des Links');
    }
  };

  const changeShareMode = async (mode: ShareMode) => {
    try {
      setIsChangingMode(true);
      const data = await apiClient.put<ShareSettings>(`/docs/${documentId}/share/mode`, { mode });
      setShareSettings({
        is_public: data.is_public,
        share_permission: data.share_permission || 'editor',
        share_mode: data.share_mode,
      });
    } catch (err) {
      console.error('Failed to change share mode:', err);
      setError('Fehler beim Ändern der Freigabe');
    } finally {
      setIsChangingMode(false);
    }
  };

  const updateSharePermission = async (permission: 'viewer' | 'editor') => {
    try {
      const data = await apiClient.put<ShareSettings>(`/docs/${documentId}/share/permission`, {
        permission,
      });
      setShareSettings((prev) => ({
        ...prev,
        share_permission: data.share_permission,
      }));
    } catch (err) {
      console.error('Failed to update share permission:', err);
      setError('Fehler beim Ändern der Berechtigung');
    }
  };

  const handleUpdatePermission = async (
    userId: string,
    newLevel: 'owner' | 'editor' | 'viewer'
  ) => {
    try {
      await apiClient.put(`/docs/${documentId}/permissions/${userId}`, {
        permission_level: newLevel,
      });
      await fetchCollaborators();
    } catch (err) {
      console.error('Failed to update permission:', err);
      setError('Fehler beim Aktualisieren der Berechtigung');
    }
  };

  const handleRevokePermission = async (userId: string) => {
    if (!window.confirm('Berechtigung wirklich entziehen?')) {
      return;
    }

    try {
      await apiClient.delete(`/docs/${documentId}/permissions/${userId}`);
      await fetchCollaborators();
    } catch (err) {
      console.error('Failed to revoke permission:', err);
      setError('Fehler beim Entziehen der Berechtigung');
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(date);
  };

  const getPermissionLabel = (level: string) => {
    switch (level) {
      case 'owner':
        return 'Eigentümer';
      case 'editor':
        return 'Bearbeiter';
      case 'viewer':
        return 'Betrachter';
      default:
        return level;
    }
  };

  const showLinkSection = shareSettings.share_mode !== 'private';

  return (
    <div className="share-modal-overlay" onClick={onClose}>
      <div className="share-modal-panel" onClick={(e) => e.stopPropagation()}>
        <div className="share-modal-header">
          <Text size="lg" fw={600}>
            Dokument teilen
          </Text>
          <button onClick={onClose} className="close-button">
            ×
          </button>
        </div>

        {error && (
          <Alert color="red" variant="light" style={{ borderRadius: 0 }}>
            {error}
          </Alert>
        )}

        <div className="share-link-section">
          <div className="share-link-row">
            <Select
              label="Zugriff über Link"
              value={shareSettings.share_mode}
              onChange={(val) => val && changeShareMode(val as ShareMode)}
              data={[
                { value: 'private', label: 'Privat' },
                { value: 'authenticated', label: 'Mit Anmeldung' },
                { value: 'public', label: 'Öffentlich' },
              ]}
              disabled={isChangingMode}
              allowDeselect={false}
              comboboxProps={{ zIndex: 1100 }}
              style={{ flex: '1 1 160px', minWidth: 0 }}
            />
            {showLinkSection && (
              <Select
                value={shareSettings.share_permission}
                onChange={(val) => val && updateSharePermission(val as 'viewer' | 'editor')}
                data={[
                  { value: 'editor', label: 'Kann bearbeiten' },
                  { value: 'viewer', label: 'Kann ansehen' },
                ]}
                allowDeselect={false}
                comboboxProps={{ zIndex: 1100 }}
                style={{ flex: '0 0 auto', alignSelf: 'flex-end' }}
              />
            )}
          </div>
          <Text size="xs" c="dimmed" mt={4}>
            {SHARE_MODE_OPTIONS.find((o) => o.value === shareSettings.share_mode)?.description}
          </Text>
        </div>

        <GroupShareSection documentId={documentId} apiClient={apiClient} />

        <div className="collaborators-section">
          <Text size="md" fw={600} mb="sm">
            Personen mit Zugriff
          </Text>
          {isLoading ? (
            <Group justify="center" py="xl">
              <Loader size="sm" />
            </Group>
          ) : collaborators.length === 0 ? (
            <Text c="dimmed" ta="center" py="xl">
              Noch keine Mitarbeiter
            </Text>
          ) : (
            <Stack gap="sm">
              {collaborators.map((collaborator) => (
                <Group
                  key={collaborator.user_id}
                  justify="space-between"
                  wrap="nowrap"
                  className="collaborator-item"
                >
                  <Group gap="sm" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
                    {(() => {
                      const avatar = getAvatarDisplayProps(collaborator);
                      return avatar.type === 'robot' ? (
                        <img
                          src={getRobotAvatarPath(avatar.robotId!)}
                          alt={avatar.alt}
                          className="collaborator-avatar"
                        />
                      ) : (
                        <div className="collaborator-avatar collaborator-avatar-initials">
                          {avatar.initials}
                        </div>
                      );
                    })()}
                    <div style={{ minWidth: 0 }}>
                      <Text size="sm" fw={500} truncate>
                        {collaborator.display_name}
                      </Text>
                      <Text size="xs" c="dimmed" truncate>
                        {collaborator.email}
                      </Text>
                      <Text size="xs" c="dimmed">
                        Hinzugefügt am {formatDate(collaborator.granted_at)}
                      </Text>
                    </div>
                  </Group>
                  <Group gap="xs" wrap="nowrap">
                    {collaborator.permission_level === 'owner' ? (
                      <Badge variant="filled" color="var(--primary-600)" size="md">
                        {getPermissionLabel(collaborator.permission_level)}
                      </Badge>
                    ) : (
                      <>
                        <Select
                          size="xs"
                          value={collaborator.permission_level}
                          onChange={(val) =>
                            val &&
                            handleUpdatePermission(
                              collaborator.user_id,
                              val as 'owner' | 'editor' | 'viewer'
                            )
                          }
                          data={[
                            { value: 'editor', label: 'Bearbeiter' },
                            { value: 'viewer', label: 'Betrachter' },
                          ]}
                          allowDeselect={false}
                          comboboxProps={{ zIndex: 1100 }}
                          style={{ width: 130 }}
                        />
                        <Button
                          variant="default"
                          size="xs"
                          color="red"
                          onClick={() => handleRevokePermission(collaborator.user_id)}
                        >
                          Entfernen
                        </Button>
                      </>
                    )}
                  </Group>
                </Group>
              ))}
            </Stack>
          )}
        </div>

        <div className="share-modal-footer">
          {showLinkSection && (
            <Button
              variant="outline"
              size="xs"
              radius="xl"
              color="var(--primary-600)"
              onClick={copyShareLink}
            >
              {copySuccess ? '✓ Kopiert' : 'Link kopieren'}
            </Button>
          )}
          <Button ml="auto" color="var(--primary-600)" onClick={onClose}>
            Fertig
          </Button>
        </div>
      </div>
    </div>
  );
};
