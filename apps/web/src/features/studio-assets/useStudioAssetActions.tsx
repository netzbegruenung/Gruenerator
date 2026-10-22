import { type StudioAssetItem } from '@gruenerator/contracts';
import {
  STUDIO_ASSETS_QUERY_KEY,
  useStudioAssetMutations,
} from '@gruenerator/shared/studio-assets';
import { toast } from '@gruenerator/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

import { ReportDialog } from '../../components/common/ReportDialog';
import { useAuthStore } from '../../stores/authStore';
import { profilbildAssetHref } from '../studio-tools/utils/galleryAsset';
import { useTrashUndoToast } from '../trash/trashUndoToast';

import { BackgroundUploadDialog } from './BackgroundUploadDialog';
import { type StudioAssetCardProps } from './StudioAssetCard';
import { PublishDialog, RenameDialog } from './StudioAssetDialogs';

export type StudioAssetHandlers = Omit<
  StudioAssetCardProps,
  'item' | 'onToggleLike' | 'onToggleFavorite'
>;

type OpenDialog =
  { type: 'report' | 'publish' | 'rename'; item: StudioAssetItem } | { type: 'upload' } | null;

/**
 * Kartenaktionen samt ihrer Dialoge — dieselben auf der Übersicht und im
 * Entdecken-Popup. `dialogs` gehört einmal in den Baum der aufrufenden Ansicht.
 */
export function useStudioAssetActions(): {
  handlers: StudioAssetHandlers;
  openUpload: () => void;
  dialogs: ReactNode;
} {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const showTrashUndo = useTrashUndoToast();
  const [dialog, setDialog] = useState<OpenDialog>(null);
  const isInstanceAdmin = useAuthStore((s) => s.user?.is_admin === true);
  const { update, remove, setOfficial } = useStudioAssetMutations();
  const { mutate: markOfficial } = setOfficial;
  const { mutate: updateAsset } = update;
  const { mutate: removeAsset } = remove;

  const close = useCallback(() => setDialog(null), []);
  const openUpload = useCallback(() => setDialog({ type: 'upload' }), []);

  const handlers = useMemo<StudioAssetHandlers>(
    () => ({
      onUseInProfilbild: (item) => void navigate(profilbildAssetHref(item)),
      onReport: (item) => setDialog({ type: 'report', item }),
      onPublish: (item) => setDialog({ type: 'publish', item }),
      onRename: (item) => setDialog({ type: 'rename', item }),
      onMakePrivate: (item) =>
        updateAsset(
          { id: item.id, body: { visibility: 'private' } },
          { onSuccess: () => toast.success(`„${item.title}“ ist jetzt privat.`) }
        ),
      onDelete: (item) =>
        removeAsset(item.id, {
          onSuccess: () => showTrashUndo({ kind: 'studio_asset', id: item.id, title: item.title }),
        }),
      onToggleOfficial: isInstanceAdmin
        ? (item) =>
            markOfficial(
              { id: item.id, official: !item.isOfficial },
              {
                onSuccess: (updated) =>
                  toast.success(
                    updated.isOfficial
                      ? `„${item.title}“ steht jetzt im Marktplatz unter „Offiziell“.`
                      : `„${item.title}“ ist nicht mehr offiziell.`
                  ),
              }
            )
        : null,
    }),
    [navigate, updateAsset, removeAsset, showTrashUndo, isInstanceAdmin, markOfficial]
  );

  const dialogs = (
    <>
      {dialog?.type === 'upload' && <BackgroundUploadDialog onClose={close} />}
      {dialog?.type === 'report' && (
        <ReportDialog
          open
          onOpenChange={(open) => !open && close()}
          kind="studio_asset"
          targetId={dialog.item.id}
          title={dialog.item.title}
          onReported={() =>
            void queryClient.invalidateQueries({ queryKey: STUDIO_ASSETS_QUERY_KEY })
          }
        />
      )}
      {dialog?.type === 'publish' && (
        <PublishDialog
          item={dialog.item}
          busy={update.isPending}
          onClose={close}
          onConfirm={() =>
            update.mutate(
              { id: dialog.item.id, body: { visibility: 'public', rightsConfirmed: true } },
              {
                onSuccess: () => {
                  toast.success(`„${dialog.item.title}“ ist jetzt öffentlich.`);
                  close();
                },
              }
            )
          }
        />
      )}
      {dialog?.type === 'rename' && (
        <RenameDialog
          item={dialog.item}
          busy={update.isPending}
          onClose={close}
          onSave={(title) =>
            update.mutate({ id: dialog.item.id, body: { title } }, { onSuccess: close })
          }
        />
      )}
    </>
  );

  return { handlers, openUpload, dialogs };
}
