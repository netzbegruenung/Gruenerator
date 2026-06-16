import { saveCollaborativeDocAsTemplate } from '@gruenerator/shared';
import { Badge, Button } from '@gruenerator/ui';
import { memo, useCallback, useState } from 'react';
import { FiCheck, FiCopy, FiTrash2, FiUsers } from 'react-icons/fi';

import { useBoardSharing } from '../../../hooks/useBoardSharing';

const SHARE_MODE_OPTIONS = [
  {
    value: 'private' as const,
    label: 'Privat',
    description: 'Nur eingeladene Personen und Gruppen',
  },
  {
    value: 'authenticated' as const,
    label: 'Mit Link (angemeldet)',
    description: 'Alle angemeldeten Nutzer*innen mit dem Link',
  },
  {
    value: 'public' as const,
    label: 'Öffentlich',
    description: 'Alle mit dem Link, ohne Anmeldung',
  },
];

interface ShareSectionProps {
  boardId: string;
  /** Hidden when embedded in a dialog that supplies its own title. */
  showHeading?: boolean;
}

/**
 * Sharing, permissions and save-as-template for the board settings overlay.
 * Extracted from the former ShareBoardDialog so it lives alongside the rest of
 * board configuration; driven by {@link useBoardSharing}.
 */
export const ShareSection = memo(function ShareSection({
  boardId,
  showHeading = true,
}: ShareSectionProps) {
  const [copied, setCopied] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [groupPermission, setGroupPermission] = useState<'viewer' | 'editor'>('viewer');
  const [templateMode, setTemplateMode] = useState<'idle' | 'editing' | 'saving' | 'saved'>('idle');
  const [templateTitle, setTemplateTitle] = useState('');
  const [templateError, setTemplateError] = useState<string | null>(null);

  const {
    collaborators,
    shareSettings,
    userGroups,
    boardGroups,
    isLoading,
    setShareMode,
    setSharePermission,
    revokeAccess,
    updatePermission,
    shareWithGroup,
    unshareFromGroup,
  } = useBoardSharing(boardId);

  const handleSaveAsTemplate = useCallback(async () => {
    const trimmed = templateTitle.trim();
    if (!trimmed) {
      setTemplateError('Bitte gib der Vorlage einen Titel.');
      return;
    }
    try {
      setTemplateMode('saving');
      setTemplateError(null);
      await saveCollaborativeDocAsTemplate({
        documentId: boardId,
        title: trimmed,
        isPrivate: true,
      });
      setTemplateMode('saved');
      setTimeout(() => setTemplateMode('idle'), 2500);
    } catch (err) {
      console.error('Failed to save board as template:', err);
      setTemplateError('Vorlage konnte nicht gespeichert werden.');
      setTemplateMode('editing');
    }
  }, [boardId, templateTitle]);

  const isPublicOrAuth = shareSettings?.share_mode && shareSettings.share_mode !== 'private';
  const shareUrl = isPublicOrAuth
    ? `${window.location.origin}/boards/public/${boardId}`
    : `${window.location.origin}/boards/${boardId}`;
  const availableGroups = userGroups.filter((g) => !boardGroups.some((bg) => bg.group_id === g.id));

  const handleCopy = useCallback(() => {
    void navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [shareUrl]);

  const handleShareWithGroup = useCallback(() => {
    if (!selectedGroupId) return;
    shareWithGroup.mutate(
      { groupId: selectedGroupId, permissionLevel: groupPermission },
      { onSuccess: () => setSelectedGroupId('') }
    );
  }, [selectedGroupId, groupPermission, shareWithGroup]);

  if (isLoading || !shareSettings) {
    return (
      <section className="w-full max-w-[42rem]">
        {showHeading && <h2 className="text-base font-semibold text-foreground">Teilen</h2>}
        <p className="py-md text-sm text-grey-500">Laden…</p>
      </section>
    );
  }

  return (
    <section className="flex w-full max-w-[42rem] flex-col gap-md">
      {showHeading && (
        <div>
          <h2 className="text-base font-semibold text-foreground">Teilen &amp; Berechtigungen</h2>
          <p className="mt-0.5 text-sm text-grey-500">
            Verwalte, wer auf dieses Board zugreifen kann.
          </p>
        </div>
      )}

      {/* Share mode */}
      <div>
        <label className="mb-1 block text-xs font-medium text-grey-500">Zugriffsmodus</label>
        <select
          value={shareSettings.share_mode}
          onChange={(e) =>
            setShareMode.mutate(e.target.value as 'private' | 'authenticated' | 'public')
          }
          className="w-full rounded-md border border-grey-200 bg-background px-2.5 py-2 text-sm outline-none focus:border-primary-500 dark:border-grey-700"
        >
          {SHARE_MODE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label} — {opt.description}
            </option>
          ))}
        </select>
      </div>

      {/* Share link (when not private) */}
      {shareSettings.share_mode !== 'private' && (
        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="text-xs font-medium text-grey-500">Link-Berechtigung</label>
            <select
              value={shareSettings.share_permission}
              onChange={(e) => setSharePermission.mutate(e.target.value as 'viewer' | 'editor')}
              className="rounded-md border border-grey-200 bg-background px-2 py-1 text-xs outline-none focus:border-primary-500 dark:border-grey-700"
            >
              <option value="viewer">Betrachter*in</option>
              <option value="editor">Bearbeiter*in</option>
            </select>
          </div>
          <div className="flex gap-2">
            <input
              readOnly
              value={shareUrl}
              className="flex-1 rounded-md border border-grey-200 bg-grey-50 px-2.5 py-1.5 text-xs text-grey-600 outline-none dark:border-grey-700 dark:bg-grey-800"
            />
            <Button size="sm" variant="outline" onClick={handleCopy}>
              {copied ? <FiCheck size={14} /> : <FiCopy size={14} />}
            </Button>
          </div>
        </div>
      )}

      {/* Group sharing */}
      {availableGroups.length > 0 && (
        <div>
          <label className="mb-1 block text-xs font-medium text-grey-500">Mit Gruppe teilen</label>
          <div className="flex gap-2">
            <select
              value={selectedGroupId}
              onChange={(e) => setSelectedGroupId(e.target.value)}
              className="flex-1 rounded-md border border-grey-200 bg-background px-2 py-1.5 text-sm outline-none focus:border-primary-500 dark:border-grey-700"
            >
              <option value="">Gruppe auswählen...</option>
              {availableGroups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
            <select
              value={groupPermission}
              onChange={(e) => setGroupPermission(e.target.value as 'viewer' | 'editor')}
              className="rounded-md border border-grey-200 bg-background px-2 py-1.5 text-xs outline-none dark:border-grey-700"
            >
              <option value="viewer">Betrachter*in</option>
              <option value="editor">Bearbeiter*in</option>
            </select>
            <Button size="sm" onClick={handleShareWithGroup} disabled={!selectedGroupId}>
              Teilen
            </Button>
          </div>
        </div>
      )}

      {/* Current group shares */}
      {boardGroups.length > 0 && (
        <div>
          <label className="mb-1 block text-xs font-medium text-grey-500">Gruppen</label>
          <div className="space-y-1.5">
            {boardGroups.map((share) => (
              <div
                key={share.group_id}
                className="flex items-center justify-between rounded-md border border-grey-200 px-2.5 py-1.5 dark:border-grey-700"
              >
                <div className="flex items-center gap-2">
                  <FiUsers size={13} className="text-grey-400" />
                  <span className="text-sm">{share.group_name}</span>
                  <Badge variant="outline" className="py-0 text-[10px]">
                    {share.permission_level === 'editor' ? 'Bearbeiter*in' : 'Betrachter*in'}
                  </Badge>
                </div>
                <button
                  onClick={() => unshareFromGroup.mutate(share.group_id)}
                  className="cursor-pointer border-none bg-transparent p-0.5 text-grey-400 hover:text-red-600"
                >
                  <FiTrash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Collaborators */}
      {collaborators.length > 0 && (
        <div>
          <label className="mb-1 block text-xs font-medium text-grey-500">
            Personen mit Zugriff
          </label>
          <div className="space-y-1.5">
            {collaborators.map((collab) => (
              <div
                key={collab.user_id}
                className="flex items-center justify-between rounded-md border border-grey-200 px-2.5 py-1.5 dark:border-grey-700"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-100 text-xs font-medium text-primary-700 dark:bg-primary-900 dark:text-primary-300">
                    {(collab.display_name || collab.email || '?').charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm">{collab.display_name || collab.email}</p>
                  </div>
                </div>
                {collab.permission_level === 'owner' ? (
                  <Badge variant="outline" className="shrink-0 py-0 text-[10px]">
                    Eigentümer*in
                  </Badge>
                ) : (
                  <div className="flex shrink-0 items-center gap-1">
                    <select
                      value={collab.permission_level}
                      onChange={(e) =>
                        updatePermission.mutate({
                          userId: collab.user_id,
                          permissionLevel: e.target.value,
                        })
                      }
                      className="rounded border border-grey-200 bg-background px-1 py-0.5 text-[10px] outline-none dark:border-grey-700"
                    >
                      <option value="viewer">Betrachter*in</option>
                      <option value="editor">Bearbeiter*in</option>
                    </select>
                    <button
                      onClick={() => revokeAccess.mutate(collab.user_id)}
                      className="cursor-pointer border-none bg-transparent p-0.5 text-grey-400 hover:text-red-600"
                    >
                      <FiTrash2 size={12} />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Save as template */}
      <div className="border-t border-grey-200 pt-3 dark:border-grey-700">
        {templateMode === 'idle' && (
          <button
            type="button"
            onClick={() => {
              setTemplateMode('editing');
              setTemplateError(null);
            }}
            className="cursor-pointer border-none bg-transparent p-0 text-sm font-medium text-secondary-600 hover:underline"
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
              className="h-8 min-w-[180px] flex-1 rounded-md border border-grey-300 bg-background px-2 text-sm outline-none focus:border-primary-500 dark:border-grey-600"
            />
            <Button size="sm" onClick={handleSaveAsTemplate}>
              Speichern
            </Button>
            <Button
              size="sm"
              variant="outline"
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
    </section>
  );
});
