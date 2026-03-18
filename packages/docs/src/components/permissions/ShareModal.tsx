import { getAvatarDisplayProps, getRobotAvatarPath } from '@gruenerator/shared/avatar';
import { Alert, AlertDescription, Badge, Button } from '@gruenerator/ui';
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
  documentTitle?: string;
  onClose: () => void;
}

type ShareMode = 'private' | 'authenticated' | 'public';

const SHARE_MODE_OPTIONS: { value: ShareMode; label: string; description: string }[] = [
  {
    value: 'private',
    label: 'Privat',
    description: 'Nur eingeladene Personen und Gruppen haben Zugriff',
  },
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

export const ShareModal = ({ documentId, documentTitle, onClose }: ShareModalProps) => {
  const adapter = useDocsAdapter();
  const apiClient = useMemo(() => createDocsApiClient(adapter), [adapter]);
  const userDisplayName = adapter.getCurrentUserDisplayName?.() ?? null;

  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [shareSettings, setShareSettings] = useState<ShareSettings>({
    is_public: false,
    share_permission: 'editor',
    share_mode: 'authenticated',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);
  const [directShareSuccess, setDirectShareSuccess] = useState(false);
  const [isChangingMode, setIsChangingMode] = useState(false);
  const [hasGroups, setHasGroups] = useState(false);

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
        share_mode: data.share_mode || (data.is_public ? 'public' : 'authenticated'),
      });
    } catch (err) {
      console.error('Failed to fetch share settings:', err);
    }
  }, [documentId, apiClient]);

  useEffect(() => {
    void fetchCollaborators();
    void fetchShareSettings();
  }, [documentId]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const directShare = async () => {
    const shareUrl = `${window.location.origin}/document/${documentId}`;
    const title = documentTitle || 'Dokument';
    const message = userDisplayName
      ? `${userDisplayName} möchte „${title}" mit dir teilen:\n${shareUrl}`
      : shareUrl;

    try {
      if (navigator.share) {
        await navigator.share({ title, text: message });
      } else {
        await navigator.clipboard.writeText(message);
        setDirectShareSuccess(true);
        setTimeout(() => setDirectShareSuccess(false), 2000);
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        console.error('Failed to share:', err);
        setError('Fehler beim Teilen');
      }
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
        return 'Eigentümer*in';
      case 'editor':
        return 'Bearbeiter*in';
      case 'viewer':
        return 'Betrachter*in';
      default:
        return level;
    }
  };

  const showLinkSection = shareSettings.share_mode !== 'private';

  const shareModeOptions = useMemo(
    () => [
      ...(hasGroups ? [{ value: 'private', label: 'Privat' }] : []),
      { value: 'authenticated', label: 'Mit Anmeldung' },
      { value: 'public', label: 'Öffentlich' },
    ],
    [hasGroups]
  );

  return (
    <div className="share-modal-overlay" onClick={onClose}>
      <div className="share-modal-panel" onClick={(e) => e.stopPropagation()}>
        <div className="share-modal-header">
          <span className="text-lg font-semibold">Dokument teilen</span>
          <button onClick={onClose} className="close-button">
            ×
          </button>
        </div>

        {error && (
          <Alert variant="destructive" className="rounded-none">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="share-link-section">
          <div className="share-link-row">
            <div className="flex flex-col" style={{ flex: '1 1 160px', minWidth: 0 }}>
              <label className="mb-1 text-sm font-medium">Zugriffsmodus</label>
              <select
                className="h-9 rounded-md border border-grey-300 bg-background px-3 text-sm outline-none focus:border-primary-600 focus:ring-1 focus:ring-primary-600 dark:border-grey-600 dark:bg-grey-800"
                value={shareSettings.share_mode}
                onChange={(e) => changeShareMode(e.target.value as ShareMode)}
                disabled={isChangingMode}
              >
                {shareModeOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            {showLinkSection && (
              <div className="flex flex-col self-end" style={{ flex: '0 0 auto' }}>
                <select
                  className="h-9 rounded-md border border-grey-300 bg-background px-3 text-sm outline-none focus:border-primary-600 focus:ring-1 focus:ring-primary-600 dark:border-grey-600 dark:bg-grey-800"
                  value={shareSettings.share_permission}
                  onChange={(e) => updateSharePermission(e.target.value as 'viewer' | 'editor')}
                >
                  <option value="editor">Kann bearbeiten</option>
                  <option value="viewer">Kann ansehen</option>
                </select>
              </div>
            )}
          </div>
          <span className="mt-1 text-xs text-grey-500 dark:text-grey-400">
            {SHARE_MODE_OPTIONS.find((o) => o.value === shareSettings.share_mode)?.description}
          </span>
        </div>

        <GroupShareSection
          documentId={documentId}
          apiClient={apiClient}
          onGroupsLoaded={setHasGroups}
        />

        <div className="collaborators-section">
          <p className="mb-3 text-base font-semibold">Personen mit Zugriff</p>
          {isLoading ? (
            <div className="flex justify-center py-6">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-grey-300 border-t-primary-600" />
            </div>
          ) : collaborators.length === 0 ? (
            <p className="py-6 text-center text-grey-500 dark:text-grey-400">
              Noch keine Mitarbeiter
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {collaborators.map((collaborator) => (
                <div
                  key={collaborator.user_id}
                  className="collaborator-item flex flex-nowrap items-center justify-between"
                >
                  <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-3">
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
                    <div className="min-w-0">
                      <span className="block truncate text-sm font-medium">
                        {collaborator.display_name}
                      </span>
                      <span className="block truncate text-xs text-grey-500 dark:text-grey-400">
                        {collaborator.email}
                      </span>
                      <span className="block text-xs text-grey-500 dark:text-grey-400">
                        Hinzugefügt am {formatDate(collaborator.granted_at)}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-nowrap items-center gap-2">
                    {collaborator.permission_level === 'owner' ? (
                      <Badge>{getPermissionLabel(collaborator.permission_level)}</Badge>
                    ) : (
                      <>
                        <select
                          className="h-7 w-[150px] rounded-md border border-grey-300 bg-background px-2 text-xs outline-none focus:border-primary-600 focus:ring-1 focus:ring-primary-600 dark:border-grey-600 dark:bg-grey-800"
                          value={collaborator.permission_level}
                          onChange={(e) =>
                            handleUpdatePermission(
                              collaborator.user_id,
                              e.target.value as 'owner' | 'editor' | 'viewer'
                            )
                          }
                        >
                          <option value="editor">Bearbeiter*in</option>
                          <option value="viewer">Betrachter*in</option>
                        </select>
                        <Button
                          variant="outline"
                          size="xs"
                          onClick={() => handleRevokePermission(collaborator.user_id)}
                        >
                          Entfernen
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="share-modal-footer">
          <Button variant="outline" size="xs" className="rounded-full" onClick={copyShareLink}>
            {copySuccess ? '✓ Kopiert' : 'Link kopieren'}
          </Button>
          {userDisplayName && (
            <Button size="xs" className="rounded-full" onClick={directShare}>
              {directShareSuccess ? '✓ Kopiert' : 'Direkt teilen'}
            </Button>
          )}
          <Button className="ml-auto" onClick={onClose}>
            Fertig
          </Button>
        </div>
      </div>
    </div>
  );
};
