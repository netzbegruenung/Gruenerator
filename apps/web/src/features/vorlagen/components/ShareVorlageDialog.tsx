import { CollaboratorList, GroupShareControls, ShareModeSelect } from '@gruenerator/docs';
import {
  Button,
  CopyLinkRow,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@gruenerator/ui';
import { Share2 } from 'lucide-react';
import { useCallback } from 'react';
import { toast } from 'sonner';

import { grueneratorCanvasId } from '../hooks/useGrueneratorVorlage';
import { type Template } from '../types';

import { useUserTemplates } from '@/features/auth/hooks/useProfileData';
import { useDocumentSharing } from '@/hooks/useDocumentSharing';
import { canShare, shareContent } from '@/utils/shareUtils';

export interface VorlageShareTarget {
  title: string;
  /** The viewer's own Vorlage — only its owner may change who gets access. */
  owned?: Template | null;
  /** A gallery Vorlage that may be the viewer's own; checked once the dialog opens. */
  templateId?: string;
  /** The link anyone may pass on: catalogue deep link, Canva URL … */
  url?: string;
}

interface ShareVorlageDialogProps extends VorlageShareTarget {
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
 *
 * Everyone else's Vorlagen (catalogue, Canva, community) get the same dialog
 * with just their link: access to them is not the viewer's to change.
 */
export function ShareVorlageDialog({
  title,
  owned: ownedProp,
  templateId,
  url,
  open,
  onOpenChange,
}: ShareVorlageDialogProps) {
  const lookup = open && !ownedProp && Boolean(templateId);
  const { query: ownTemplates } = useUserTemplates({ isActive: lookup });
  const owned =
    ownedProp ??
    ((ownTemplates.data?.find((t) => String(t.id) === templateId) as Template | undefined) || null);
  const checkingOwner = lookup && ownTemplates.isLoading;
  const canvasId = (owned && grueneratorCanvasId(owned.content_data)) ?? '';
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

  const shareUrl = canvasId && owned ? `${window.location.origin}/vorlagen/v/${owned.id}` : url;
  const linkVisible = canvasId ? shareSettings?.share_mode !== 'private' : Boolean(url);

  const directShare = () => {
    if (!shareUrl) return;
    shareContent({ title, url: shareUrl }).catch(() => toast.error('Teilen ist fehlgeschlagen.'));
  };

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
            {canvasId
              ? `Teile „${title}“ mit deinen Gruppen oder per Link. Wer sie öffnet, kann sich eine eigene Kopie erstellen.`
              : `Schick „${title}“ per Link weiter.`}
          </DialogDescription>
        </DialogHeader>

        {checkingOwner ? (
          <p className="py-md text-sm text-grey-500">Laden…</p>
        ) : !canvasId ? (
          url ? (
            <div>
              <p className="mb-1 text-xs font-medium text-grey-500">Link zur Vorlage</p>
              <CopyLinkRow value={url} />
            </div>
          ) : (
            <p className="py-md text-sm text-grey-500">
              {owned
                ? 'Diese Vorlage lässt sich nicht per Link teilen — nur Grünerator-Vorlagen haben eine teilbare Kopiervorlage.'
                : 'Nur wer diese Vorlage erstellt hat, kann sie teilen.'}
            </p>
          )
        ) : isLoading || !shareSettings || !shareUrl ? (
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

        {linkVisible && canShare() && (
          <DialogFooter>
            <Button variant="outline" size="sm" className="rounded-full" onClick={directShare}>
              <Share2 aria-hidden />
              Direkt teilen
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
