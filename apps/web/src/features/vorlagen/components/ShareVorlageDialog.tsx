import { CollaboratorList, GroupShareControls, ShareModeSelect } from '@gruenerator/docs';
import {
  CopyLinkRow,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@gruenerator/ui';
import { useCallback } from 'react';

import { grueneratorCanvasId } from '../hooks/useGrueneratorVorlage';
import { type Template } from '../types';

import { useDocumentSharing } from '@/hooks/useDocumentSharing';

interface ShareVorlageDialogProps {
  template: Template;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Share a Grünerator-Vorlage the way documents are shared: Gruppen, plus a link
 * that is either login-gated or fully public.
 *
 * The controls write to the Vorlage's frozen SNAPSHOT canvas through the very
 * same `/api/docs/:id/...` endpoints the document share dialog uses. That is
 * not a shortcut — cloning the snapshot is what "Vorlage verwenden" does, so
 * the snapshot's access rules ARE the Vorlage's access rules, and reusing the
 * endpoints keeps one implementation instead of a parallel one that drifts.
 *
 * Listing it in the öffentliche Vorlagen-Galerie is a different, reviewed act
 * and lives on the `is_private`/`status` axis (see useTemplateActions) — none
 * of what happens here needs an admin.
 */
export function ShareVorlageDialog({ template, open, onOpenChange }: ShareVorlageDialogProps) {
  const canvasId = grueneratorCanvasId(template.content_data) ?? '';
  const sharing = useDocumentSharing(canvasId, { namespace: 'vorlage' });
  const {
    collaborators,
    shareSettings,
    userGroups,
    documentGroups,
    isLoading,
    setShareMode,
    setSharePermission,
    updatePermission,
    revokeAccess,
    shareWithGroup,
    updateGroupPermission,
    unshareFromGroup,
  } = sharing;

  const shareUrl = `${window.location.origin}/vorlagen/v/${template.id}`;

  const changeMode = useCallback(
    (mode: 'private' | 'authenticated' | 'public') => {
      setShareMode.mutate(mode, {
        // A Vorlage is a frozen snapshot: whoever follows the link may copy it,
        // never edit it. The generic docs endpoint keeps the previous
        // permission when switching to 'authenticated', which defaults to
        // 'editor' — that would hand every logged-in link visitor write access
        // to the original. Pin it down as soon as a link exists.
        onSuccess: () => {
          if (mode !== 'private') setSharePermission.mutate('viewer');
        },
      });
    },
    [setShareMode, setSharePermission]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[28rem]">
        <DialogHeader>
          <DialogTitle>Vorlage teilen</DialogTitle>
          <DialogDescription>
            Teile {`„${template.title}“`} mit deinen Gruppen oder per Link. Wer sie öffnet, kann
            sich eine eigene Kopie erstellen.
          </DialogDescription>
        </DialogHeader>

        {!canvasId ? (
          <p className="py-md text-sm text-grey-500">
            Diese Vorlage lässt sich nicht per Link teilen — nur Grünerator-Vorlagen haben eine
            teilbare Kopiervorlage.
          </p>
        ) : isLoading || !shareSettings ? (
          <p className="py-md text-sm text-grey-500">Laden…</p>
        ) : (
          <div className="flex w-full flex-col gap-md">
            <ShareModeSelect
              value={shareSettings.share_mode}
              onChange={changeMode}
              disabled={setShareMode.isPending}
            />

            {shareSettings.share_mode !== 'private' && (
              <div>
                <p className="mb-1 text-xs font-medium text-grey-500">Link zur Vorlage</p>
                <CopyLinkRow value={shareUrl} />
                <p className="mt-1 text-xs text-grey-500 dark:text-grey-400">
                  Nur zum Ansehen und Kopieren — deine Vorlage selbst bleibt unverändert.
                </p>
              </div>
            )}

            <GroupShareControls
              userGroups={userGroups}
              groupShares={documentGroups}
              onShare={(groupId, permissionLevel) =>
                shareWithGroup.mutate({ groupId, permissionLevel })
              }
              onUpdatePermission={(groupId, permissionLevel) =>
                updateGroupPermission.mutate({ groupId, permissionLevel })
              }
              onRemove={(groupId) => unshareFromGroup.mutate(groupId)}
              isSharing={shareWithGroup.isPending}
            />

            <CollaboratorList
              collaborators={collaborators}
              onUpdatePermission={(userId, permissionLevel) =>
                updatePermission.mutate({ userId, permissionLevel })
              }
              onRevoke={(userId) => revokeAccess.mutate(userId)}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
