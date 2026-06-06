import { getAvatarDisplayProps, getRobotAvatarPath } from '@gruenerator/shared/avatar';
import { Alert, AlertDescription, Badge, Button, cn } from '@gruenerator/ui';
import { useState, useEffect, useCallback, useMemo } from 'react';

import { useDocsAdapter, createDocsApiClient } from '../../context/DocsContext';
import { GroupShareSection } from './GroupShareSection';

interface UserCollaborator {
  type?: 'user';
  user_id: string;
  display_name: string;
  email: string;
  avatar_url?: string;
  avatar_robot_id?: number;
  permission_level: 'owner' | 'editor' | 'viewer';
  granted_at: string;
  granted_by?: string;
}

interface GroupCollaborator {
  type: 'group';
  group_id: string;
  group_name: string;
  permission_level: 'editor' | 'viewer';
  shared_at: string;
  member_count: number;
}

type Collaborator = UserCollaborator | GroupCollaborator;

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

  const [templateMode, setTemplateMode] = useState<'idle' | 'editing' | 'saving' | 'saved'>('idle');
  const [templateTitle, setTemplateTitle] = useState(documentTitle ?? '');
  const [templateError, setTemplateError] = useState<string | null>(null);

  const saveAsTemplate = async () => {
    const trimmed = templateTitle.trim();
    if (!trimmed) {
      setTemplateError('Bitte gib der Vorlage einen Titel.');
      return;
    }
    try {
      setTemplateMode('saving');
      setTemplateError(null);
      await apiClient.post(`/docs/${documentId}/save-as-template`, {
        title: trimmed,
        is_private: true,
      });
      setTemplateMode('saved');
      setTimeout(() => setTemplateMode('idle'), 2500);
    } catch (err) {
      console.error('Failed to save as template:', err);
      setTemplateError('Vorlage konnte nicht gespeichert werden.');
      setTemplateMode('editing');
    }
  };

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId]);

  const copyShareLink = async () => {
    const shareUrl = `${window.location.origin}${adapter.getDocumentUrl(documentId)}`;
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
    const shareUrl = `${window.location.origin}${adapter.getDocumentUrl(documentId)}`;
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
    } catch (err: unknown) {
      if ((err as { name?: string })?.name !== 'AbortError') {
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

  const handleUpdateGroupPermission = async (groupId: string, newLevel: 'editor' | 'viewer') => {
    try {
      await apiClient.put(`/docs/${documentId}/groups/${groupId}`, { permission_level: newLevel });
      await fetchCollaborators();
    } catch (err) {
      console.error('Failed to update group permission:', err);
      setError('Fehler beim Aktualisieren der Gruppen-Berechtigung');
    }
  };

  const handleRemoveGroup = async (groupId: string) => {
    if (!window.confirm('Gruppe wirklich entfernen?')) return;
    try {
      await apiClient.delete(`/docs/${documentId}/groups/${groupId}`);
      await fetchCollaborators();
    } catch (err) {
      console.error('Failed to remove group:', err);
      setError('Fehler beim Entfernen der Gruppe');
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
      { value: 'private', label: 'Privat' },
      { value: 'authenticated', label: 'Mit Anmeldung' },
      { value: 'public', label: 'Öffentlich' },
    ],
    []
  );

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="flex max-h-[80vh] w-[880px] max-w-[90%] flex-col overflow-hidden rounded-lg bg-background shadow-lg dark:border dark:border-grey-700"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-grey-200 p-6 dark:border-grey-700">
          <span className="text-lg font-semibold">Dokument teilen</span>
          <button
            onClick={onClose}
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded border-none bg-transparent p-0 text-lg text-foreground hover:bg-black/5 dark:hover:bg-white/10"
          >
            ×
          </button>
        </div>

        {error && (
          <Alert variant="destructive" className="rounded-none">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex flex-1 flex-col overflow-hidden md:flex-row md:items-start">
          <div className="border-b border-grey-200 p-4 px-6 dark:border-grey-700 md:w-[300px] md:shrink-0 md:border-b-0 md:border-r md:p-6">
            <div className="flex flex-wrap items-end gap-2 md:flex-col md:items-stretch">
              <div className="flex min-w-0 flex-col sm:flex-row sm:items-center sm:gap-2 md:flex-col md:items-stretch md:gap-1">
                <label className="mb-1 whitespace-nowrap text-sm font-medium sm:mb-0">
                  Zugriffsmodus
                </label>
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
            <p className="mt-2 text-xs text-grey-500 dark:text-grey-400">
              {SHARE_MODE_OPTIONS.find((o) => o.value === shareSettings.share_mode)?.description}
            </p>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            <GroupShareSection documentId={documentId} apiClient={apiClient} />

            <p className="mb-3 text-base font-semibold">Zugriff</p>
            {isLoading ? (
              <div className="flex justify-center py-6">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-grey-300 border-t-primary-600" />
              </div>
            ) : collaborators.length === 0 ? (
              <p className="py-6 text-center text-grey-500 dark:text-grey-400">
                Noch niemand eingeladen
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {collaborators
                  .filter((c): c is UserCollaborator => c.type !== 'group')
                  .map((collaborator) => (
                    <div
                      key={collaborator.user_id}
                      title={`Hinzugefügt am ${formatDate(collaborator.granted_at)}`}
                      className="flex max-w-full flex-nowrap items-center gap-2 rounded-full border border-grey-200 bg-background py-1 pl-1 pr-2 dark:border-grey-700"
                    >
                      {(() => {
                        const avatar = getAvatarDisplayProps(collaborator);
                        return avatar.type === 'robot' ? (
                          <img
                            src={getRobotAvatarPath(avatar.robotId!)}
                            alt={avatar.alt}
                            width={28}
                            height={28}
                            loading="lazy"
                            decoding="async"
                            className="h-7 w-7 shrink-0 rounded-full object-cover"
                          />
                        ) : (
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-600 text-xs font-semibold text-white">
                            {avatar.initials}
                          </div>
                        );
                      })()}
                      <span className="min-w-0 max-w-[200px] truncate text-sm font-medium">
                        {collaborator.display_name}
                      </span>
                      {collaborator.permission_level === 'owner' ? (
                        <Badge className="rounded-full">
                          {getPermissionLabel(collaborator.permission_level)}
                        </Badge>
                      ) : (
                        <>
                          <select
                            className="h-7 rounded-full border border-grey-300 bg-background px-2 text-xs outline-none focus:border-primary-600 focus:ring-1 focus:ring-primary-600 dark:border-grey-600 dark:bg-grey-800"
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
                          <button
                            type="button"
                            aria-label="Entfernen"
                            onClick={() => handleRevokePermission(collaborator.user_id)}
                            className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-full border-none bg-transparent text-base leading-none text-grey-500 hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10"
                          >
                            ×
                          </button>
                        </>
                      )}
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-grey-200 px-6 py-3 dark:border-grey-700">
          {templateMode === 'idle' && (
            <button
              type="button"
              onClick={() => setTemplateMode('editing')}
              className="cursor-pointer bg-transparent border-none p-0 text-sm font-medium text-secondary-600 hover:underline"
            >
              Als Vorlage speichern
            </button>
          )}
          {templateMode === 'editing' && (
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={templateTitle}
                onChange={(e) => setTemplateTitle(e.target.value)}
                placeholder="Titel der Vorlage"
                className="flex-1 min-w-[200px] h-8 rounded-md border border-grey-300 bg-background px-2 text-sm outline-none focus:border-primary-600 dark:border-grey-600"
              />
              <Button size="xs" onClick={saveAsTemplate}>
                Speichern
              </Button>
              <Button
                variant="outline"
                size="xs"
                onClick={() => {
                  setTemplateMode('idle');
                  setTemplateError(null);
                }}
              >
                Abbrechen
              </Button>
            </div>
          )}
          {templateMode === 'saving' && (
            <p className="text-sm text-grey-500">Vorlage wird gespeichert…</p>
          )}
          {templateMode === 'saved' && (
            <p className="text-sm text-green-600">✓ Vorlage gespeichert</p>
          )}
          {templateError && <p className="mt-1 text-xs text-red-600">{templateError}</p>}
        </div>

        <div className="flex items-center border-t border-grey-200 p-4 px-6 dark:border-grey-700">
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
