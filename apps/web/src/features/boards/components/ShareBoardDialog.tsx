import { saveCollaborativeDocAsTemplate } from '@gruenerator/shared';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@gruenerator/ui';
import { useState, useCallback } from 'react';
import { FiCheck, FiCopy, FiTrash2, FiUsers } from 'react-icons/fi';

import { useBoardSharing } from '../hooks/useBoardSharing';

interface ShareBoardDialogProps {
  boardId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

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

export function ShareBoardDialog({ boardId, open, onOpenChange }: ShareBoardDialogProps) {
  const [copied, setCopied] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [groupPermission, setGroupPermission] = useState<'viewer' | 'editor'>('viewer');
  const [templateMode, setTemplateMode] = useState<'idle' | 'editing' | 'saving' | 'saved'>('idle');
  const [templateTitle, setTemplateTitle] = useState('');
  const [templateError, setTemplateError] = useState<string | null>(null);

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
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Teilen</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-grey-500 py-md">Laden...</p>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[28rem]">
        <DialogHeader>
          <DialogTitle>Board teilen</DialogTitle>
          <DialogDescription>Verwalte, wer auf dieses Board zugreifen kann.</DialogDescription>
        </DialogHeader>

        {/* Share mode */}
        <div>
          <label className="text-xs font-medium text-grey-500 mb-1 block">Zugriffsmodus</label>
          <select
            value={shareSettings.share_mode}
            onChange={(e) =>
              setShareMode.mutate(e.target.value as 'private' | 'authenticated' | 'public')
            }
            className="w-full rounded-md border border-grey-200 dark:border-grey-700 bg-background px-2.5 py-2 text-sm outline-none focus:border-primary-500"
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
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-grey-500">Link-Berechtigung</label>
              <select
                value={shareSettings.share_permission}
                onChange={(e) => setSharePermission.mutate(e.target.value as 'viewer' | 'editor')}
                className="rounded-md border border-grey-200 dark:border-grey-700 bg-background px-2 py-1 text-xs outline-none focus:border-primary-500"
              >
                <option value="viewer">Betrachter*in</option>
                <option value="editor">Bearbeiter*in</option>
              </select>
            </div>
            <div className="flex gap-2">
              <input
                readOnly
                value={shareUrl}
                className="flex-1 rounded-md border border-grey-200 dark:border-grey-700 bg-grey-50 dark:bg-grey-800 px-2.5 py-1.5 text-xs text-grey-600 outline-none"
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
            <label className="text-xs font-medium text-grey-500 mb-1 block">
              Mit Gruppe teilen
            </label>
            <div className="flex gap-2">
              <select
                value={selectedGroupId}
                onChange={(e) => setSelectedGroupId(e.target.value)}
                className="flex-1 rounded-md border border-grey-200 dark:border-grey-700 bg-background px-2 py-1.5 text-sm outline-none focus:border-primary-500"
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
                className="rounded-md border border-grey-200 dark:border-grey-700 bg-background px-2 py-1.5 text-xs outline-none"
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
            <label className="text-xs font-medium text-grey-500 mb-1 block">Gruppen</label>
            <div className="space-y-1.5">
              {boardGroups.map((share) => (
                <div
                  key={share.group_id}
                  className="flex items-center justify-between rounded-md border border-grey-200 dark:border-grey-700 px-2.5 py-1.5"
                >
                  <div className="flex items-center gap-2">
                    <FiUsers size={13} className="text-grey-400" />
                    <span className="text-sm">{share.group_name}</span>
                    <Badge variant="outline" className="text-[10px] py-0">
                      {share.permission_level === 'editor' ? 'Bearbeiter*in' : 'Betrachter*in'}
                    </Badge>
                  </div>
                  <button
                    onClick={() => unshareFromGroup.mutate(share.group_id)}
                    className="text-grey-400 hover:text-red-600 bg-transparent border-none cursor-pointer p-0.5"
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
            <label className="text-xs font-medium text-grey-500 mb-1 block">
              Personen mit Zugriff
            </label>
            <div className="space-y-1.5">
              {collaborators.map((collab) => (
                <div
                  key={collab.user_id}
                  className="flex items-center justify-between rounded-md border border-grey-200 dark:border-grey-700 px-2.5 py-1.5"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-6 h-6 rounded-full bg-primary-100 dark:bg-primary-900 flex items-center justify-center text-xs font-medium text-primary-700 dark:text-primary-300 shrink-0">
                      {(collab.display_name || collab.email || '?').charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm truncate">{collab.display_name || collab.email}</p>
                    </div>
                  </div>
                  {collab.permission_level === 'owner' ? (
                    <Badge variant="outline" className="text-[10px] py-0 shrink-0">
                      Eigentümer*in
                    </Badge>
                  ) : (
                    <div className="flex items-center gap-1 shrink-0">
                      <select
                        value={collab.permission_level}
                        onChange={(e) =>
                          updatePermission.mutate({
                            userId: collab.user_id,
                            permissionLevel: e.target.value,
                          })
                        }
                        className="rounded border border-grey-200 dark:border-grey-700 bg-background px-1 py-0.5 text-[10px] outline-none"
                      >
                        <option value="viewer">Betrachter*in</option>
                        <option value="editor">Bearbeiter*in</option>
                      </select>
                      <button
                        onClick={() => revokeAccess.mutate(collab.user_id)}
                        className="text-grey-400 hover:text-red-600 bg-transparent border-none cursor-pointer p-0.5"
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
        <div className="border-t border-grey-200 dark:border-grey-700 pt-3">
          {templateMode === 'idle' && (
            <button
              type="button"
              onClick={() => {
                setTemplateMode('editing');
                setTemplateError(null);
              }}
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
                className="flex-1 min-w-[180px] h-8 rounded-md border border-grey-300 dark:border-grey-600 bg-background px-2 text-sm outline-none focus:border-primary-500"
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
      </DialogContent>
    </Dialog>
  );
}
