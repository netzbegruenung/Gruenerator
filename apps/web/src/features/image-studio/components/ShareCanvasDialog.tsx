import { CollaboratorList, GroupShareControls } from '@gruenerator/docs';
import { getContractsClient } from '@gruenerator/shared/api';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@gruenerator/ui';
import { useCallback, useState } from 'react';
import { FiCheckCircle } from 'react-icons/fi';

import { useCanvasSharing } from '../hooks/useCanvasSharing';

interface ShareCanvasDialogProps {
  canvasId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Giving other people access to *this* canvas — collaborators and groups.
 * Minting a frozen copy for the Vorlagen-Galerie is a different act with a
 * different lifecycle and lives in {@link SaveAsTemplateDialog}.
 */
export function ShareCanvasDialog({ canvasId, open, onOpenChange }: ShareCanvasDialogProps) {
  const [vorlageGroupId, setVorlageGroupId] = useState('');
  const [vorlageStatus, setVorlageStatus] = useState<'idle' | 'sharing' | 'shared' | 'error'>(
    'idle'
  );
  const [vorlageError, setVorlageError] = useState<string | null>(null);
  const [vorlageSharedGroupName, setVorlageSharedGroupName] = useState<string | null>(null);

  const {
    collaborators,
    shareSettings,
    userGroups,
    canvasGroups,
    isLoading,
    revokeAccess,
    updatePermission,
    shareWithGroup,
    updateGroupPermission,
    unshareFromGroup,
  } = useCanvasSharing(canvasId);

  const handleShareAsVorlage = useCallback(async () => {
    if (!vorlageGroupId) return;
    const targetGroup = userGroups.find((g) => g.id === vorlageGroupId);
    setVorlageStatus('sharing');
    setVorlageError(null);
    try {
      const res = await getContractsClient().groups.shareContent({
        params: { groupId: vorlageGroupId },
        body: {
          contentType: 'canvas_template',
          contentId: canvasId,
          permissions: { read: true },
        },
      });
      if (res.status !== 200) throw new Error('share failed');
      setVorlageStatus('shared');
      setVorlageSharedGroupName(targetGroup?.name ?? null);
      setVorlageGroupId('');
    } catch (err) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        (err as Error).message ||
        'Fehler beim Teilen';
      setVorlageStatus('error');
      setVorlageError(message);
    }
  }, [vorlageGroupId, userGroups, canvasId]);

  if (isLoading || !shareSettings) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Teilen</DialogTitle>
            <DialogDescription>Lade Freigabe-Einstellungen...</DialogDescription>
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
          <DialogTitle>Canvas teilen</DialogTitle>
          <DialogDescription>
            Teile diesen Canvas mit deinen Gruppen, um gemeinsam zu bearbeiten.
          </DialogDescription>
        </DialogHeader>

        <GroupShareControls
          userGroups={userGroups}
          groupShares={canvasGroups}
          onShare={(groupId, permissionLevel) =>
            shareWithGroup.mutate({ groupId, permissionLevel })
          }
          onUpdatePermission={(groupId, permissionLevel) =>
            updateGroupPermission.mutate({ groupId, permissionLevel })
          }
          onRemove={(groupId) => unshareFromGroup.mutate(groupId)}
          isSharing={shareWithGroup.isPending}
        />

        {userGroups.length > 0 && (
          <div className="border-t border-grey-200 dark:border-grey-700 pt-md">
            <label
              htmlFor="share-canvas-vorlage-group"
              className="text-xs font-medium text-grey-500 mb-1 block"
            >
              Als Vorlage in Gruppe teilen
            </label>
            <p className="text-[11px] text-grey-500 mb-1.5">
              Gruppenmitglieder*innen können dieses Sharepic als Vorlage nutzen.
            </p>
            <div className="flex gap-2">
              <select
                id="share-canvas-vorlage-group"
                value={vorlageGroupId}
                onChange={(e) => {
                  setVorlageGroupId(e.target.value);
                  if (vorlageStatus !== 'idle') {
                    setVorlageStatus('idle');
                    setVorlageError(null);
                  }
                }}
                className="flex-1 rounded-md border border-grey-200 dark:border-grey-700 bg-background px-2 py-1.5 text-sm outline-none focus:border-primary-500"
              >
                <option value="">Gruppe auswählen...</option>
                {userGroups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
              <Button
                size="sm"
                onClick={handleShareAsVorlage}
                disabled={!vorlageGroupId || vorlageStatus === 'sharing'}
              >
                {vorlageStatus === 'sharing' ? 'Teile...' : 'Als Vorlage teilen'}
              </Button>
            </div>
            {vorlageStatus === 'shared' && vorlageSharedGroupName && (
              <div className="mt-1.5 flex items-center gap-1.5 text-xs text-primary-600">
                <FiCheckCircle size={13} />
                <span>Als Vorlage in „{vorlageSharedGroupName}" geteilt.</span>
              </div>
            )}
            {vorlageStatus === 'error' && vorlageError && (
              <p className="mt-1.5 text-xs text-red-600">{vorlageError}</p>
            )}
          </div>
        )}

        <CollaboratorList
          collaborators={collaborators}
          onUpdatePermission={(userId, permissionLevel) =>
            updatePermission.mutate({ userId, permissionLevel })
          }
          onRevoke={(userId) => revokeAccess.mutate(userId)}
        />
      </DialogContent>
    </Dialog>
  );
}
