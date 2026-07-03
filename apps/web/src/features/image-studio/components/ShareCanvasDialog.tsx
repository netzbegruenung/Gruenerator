import { getContractsClient } from '@gruenerator/shared/api';
import { CollaboratorList, GroupShareControls } from '@gruenerator/shared/collab-share';
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
import { renderSharepicToImage } from '../renderSharepicToImage';
import { uploadBlobToMediaLibrary } from '../services/mediaUploadService';

interface ShareCanvasDialogProps {
  canvasId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Template type + state used to render the gallery thumbnail on publish. */
  canvasType: string;
  initialState: Record<string, unknown>;
  defaultTitle?: string;
}

const parseTags = (raw: string): string[] => [
  ...new Set(
    raw
      .split(/[,\s]+/)
      .map((t) => t.replace(/^#/, '').trim().toLowerCase())
      .filter(Boolean)
  ),
];

export function ShareCanvasDialog({
  canvasId,
  open,
  onOpenChange,
  canvasType,
  initialState,
  defaultTitle,
}: ShareCanvasDialogProps) {
  const [vorlageGroupId, setVorlageGroupId] = useState('');
  const [vorlageStatus, setVorlageStatus] = useState<'idle' | 'sharing' | 'shared' | 'error'>(
    'idle'
  );
  const [vorlageError, setVorlageError] = useState<string | null>(null);
  const [vorlageSharedGroupName, setVorlageSharedGroupName] = useState<string | null>(null);

  // Publish-to-public-gallery (Grünerator-Vorlage) state.
  const [publishTitle, setPublishTitle] = useState(defaultTitle ?? '');
  const [publishTagsRaw, setPublishTagsRaw] = useState('');
  const [publishStatus, setPublishStatus] = useState<'idle' | 'publishing' | 'published' | 'error'>(
    'idle'
  );
  const [publishError, setPublishError] = useState<string | null>(null);

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

  const handlePublishVorlage = useCallback(async () => {
    setPublishStatus('publishing');
    setPublishError(null);
    try {
      // Prefer the freshest live state for the thumbnail; fall back to the
      // state passed in if the live read fails.
      let stateForThumb: Record<string, unknown> = initialState;
      try {
        const st = await getContractsClient().canvas.getState({ params: { id: canvasId } });
        if (st.status === 200) stateForThumb = st.body.state;
      } catch {
        /* fall back to initialState */
      }

      const dataUrl = await renderSharepicToImage(canvasType, stateForThumb);
      if (!dataUrl) throw new Error('Vorschaubild konnte nicht erstellt werden.');
      const blob = await (await fetch(dataUrl)).blob();
      const previewUrl = await uploadBlobToMediaLibrary(blob, {
        uploadSource: 'gruenerator-vorlage',
      });
      if (!previewUrl) throw new Error('Vorschaubild konnte nicht hochgeladen werden.');

      const res = await getContractsClient().userTemplates.fromCanvas({
        body: {
          canvasId,
          title: publishTitle.trim() || undefined,
          tags: parseTags(publishTagsRaw),
          preview_image_url: previewUrl,
        },
      });
      if (res.status !== 201) throw new Error('Einreichen fehlgeschlagen.');
      setPublishStatus('published');
    } catch (err) {
      setPublishStatus('error');
      setPublishError(err instanceof Error ? err.message : 'Fehler beim Einreichen.');
    }
  }, [canvasId, canvasType, initialState, publishTitle, publishTagsRaw]);

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
            <label className="text-xs font-medium text-grey-500 mb-1 block">
              Als Vorlage in Gruppe teilen
            </label>
            <p className="text-[11px] text-grey-500 mb-1.5">
              Gruppenmitglieder*innen können dieses Sharepic als Vorlage nutzen.
            </p>
            <div className="flex gap-2">
              <select
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

        <div className="border-t border-grey-200 dark:border-grey-700 pt-md">
          <label className="text-xs font-medium text-grey-500 mb-1 block">
            Als Grünerator-Vorlage veröffentlichen
          </label>
          <p className="text-[11px] text-grey-500 mb-2">
            Reiche dieses Sharepic für die öffentliche Vorlagen-Galerie ein. Nach einer kurzen
            Prüfung können es alle als Vorlage verwenden.
          </p>
          {publishStatus === 'published' ? (
            <div className="flex items-center gap-1.5 text-xs text-primary-600">
              <FiCheckCircle size={13} />
              <span>Eingereicht — wird geprüft.</span>
            </div>
          ) : (
            <div className="space-y-2">
              <input
                type="text"
                value={publishTitle}
                onChange={(e) => setPublishTitle(e.target.value)}
                placeholder="Titel der Vorlage"
                className="w-full rounded-md border border-grey-200 dark:border-grey-700 bg-background px-2 py-1.5 text-sm outline-none focus:border-primary-500"
              />
              <input
                type="text"
                value={publishTagsRaw}
                onChange={(e) => setPublishTagsRaw(e.target.value)}
                placeholder="Schlagwörter (mit Komma getrennt)"
                className="w-full rounded-md border border-grey-200 dark:border-grey-700 bg-background px-2 py-1.5 text-sm outline-none focus:border-primary-500"
              />
              <Button
                size="sm"
                onClick={() => void handlePublishVorlage()}
                disabled={publishStatus === 'publishing'}
              >
                {publishStatus === 'publishing' ? 'Wird eingereicht...' : 'Zur Galerie einreichen'}
              </Button>
              {publishStatus === 'error' && publishError && (
                <p className="text-xs text-red-600">{publishError}</p>
              )}
            </div>
          )}
        </div>

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
