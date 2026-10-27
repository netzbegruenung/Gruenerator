import { type MarketplaceCollectionId } from '@gruenerator/contracts';
import { Button, cn, toast } from '@gruenerator/ui';
import { type JSX } from 'react';
import { FiLoader } from 'react-icons/fi';

import { useSettingsDialogStore } from '../../settings/settingsDialogStore';
import { useCanvaStatus, useExportCollectionToCanva } from '../hooks/useCanva';

import { CANVA_BUTTON_BORDER, CanvaLogo } from './CanvaLogo';

import { useAuthStore } from '@/stores/authStore';

/**
 * „Zu Canva hinzufügen" for a Marktplatz collection: its stickers and
 * backgrounds land as one folder in the viewer's Canva uploads.
 *
 * Instance admins only, like the connector itself. Outlined and neutral on
 * purpose: collection pages sit on green-tinted covers, and the Canva mark
 * keeps its own colours inside the button (brand guidelines: mark plus text,
 * at least 8px around it).
 */
export function AddCollectionToCanvaButton({
  collectionId,
  folderName,
}: {
  collectionId: MarketplaceCollectionId;
  folderName: string;
}): JSX.Element | null {
  const isInstanceAdmin = useAuthStore((s) => s.user?.is_admin === true);
  const status = useCanvaStatus(isInstanceAdmin);
  const exportCollection = useExportCollectionToCanva();
  const openSettings = useSettingsDialogStore((s) => s.openSettings);

  if (!isInstanceAdmin) return null;

  const ready = status.data?.connected === true && !status.data.needsReconnect;

  const onClick = () => {
    if (!ready) {
      openSettings('konnektoren');
      return;
    }
    exportCollection.mutate(collectionId, {
      onSuccess: ({ uploaded, failed }) => {
        const done = `${uploaded} Sticker im Canva-Ordner „${folderName}“ abgelegt`;
        if (failed.length === 0) toast.success(done);
        else toast.warning(`${done}, ${failed.length} nicht übertragen`);
      },
      onError: () => toast.error('Die Sticker konnten nicht zu Canva hinzugefügt werden.'),
    });
  };

  return (
    <Button
      variant="outline"
      size="lg"
      className={cn('rounded-full gap-2', CANVA_BUTTON_BORDER)}
      onClick={onClick}
      disabled={status.isPending || exportCollection.isPending}
    >
      {exportCollection.isPending ? (
        <FiLoader className="animate-spin" aria-hidden />
      ) : (
        <CanvaLogo size={20} variant="icon" decorative />
      )}
      {exportCollection.isPending
        ? 'Wird zu Canva hinzugefügt …'
        : ready
          ? 'Sticker zu Canva hinzufügen'
          : 'Canva verbinden'}
    </Button>
  );
}
