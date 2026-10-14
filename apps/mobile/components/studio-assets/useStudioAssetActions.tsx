import { type StudioAssetItem } from '@gruenerator/contracts';
import { profilbildAssetParams } from '@gruenerator/shared/stickers';
import {
  STUDIO_ASSET_RIGHTS_LABEL,
  STUDIO_ASSETS_QUERY_KEY,
  useStudioAssetMutations,
} from '@gruenerator/shared/studio-assets';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Alert } from 'react-native';

import { ReportSheet, type ReportTarget } from '../common/ReportSheet';

import { StudioAssetRenameSheet } from './StudioAssetRenameSheet';
import { type StudioAssetAction } from './StudioAssetTile';

const failed = (title: string) => (error: Error) => Alert.alert(title, error.message);

/**
 * The tile actions with their sheets — the same on the overview and under
 * Entdecken. `sheets` goes once into the calling screen's tree.
 */
export function useStudioAssetActions(): {
  onAction: (action: StudioAssetAction, item: StudioAssetItem) => void;
  sheets: ReactNode;
} {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);
  const [renaming, setRenaming] = useState<StudioAssetItem | null>(null);
  const { update, remove } = useStudioAssetMutations();

  const publish = (item: StudioAssetItem) =>
    Alert.alert(
      'Öffentlich machen',
      `„${item.title}“ erscheint dann unter „Entdecken“ und alle können es in ihren Bildern verwenden.\n\nMit „Öffentlich machen“ bestätigst du: ${STUDIO_ASSET_RIGHTS_LABEL}`,
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Öffentlich machen',
          onPress: () =>
            update.mutate(
              { id: item.id, body: { visibility: 'public', rightsConfirmed: true } },
              { onError: failed('Nicht veröffentlicht') }
            ),
        },
      ]
    );

  const confirmDelete = (item: StudioAssetItem) =>
    Alert.alert(
      'Löschen?',
      `„${item.title}“ landet im Papierkorb. Dort kannst du es 30 Tage lang wiederherstellen.`,
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Löschen',
          style: 'destructive',
          onPress: () => remove.mutate(item.id, { onError: failed('Nicht gelöscht') }),
        },
      ]
    );

  const onAction = (action: StudioAssetAction, item: StudioAssetItem) => {
    switch (action) {
      case 'use':
        router.push({ pathname: '/(focused)/profilbild', params: profilbildAssetParams(item) });
        return;
      case 'report':
        setReportTarget({ kind: 'studio_asset', targetId: item.id });
        return;
      case 'publish':
        publish(item);
        return;
      case 'private':
        update.mutate(
          { id: item.id, body: { visibility: 'private' } },
          { onError: failed('Nicht gespeichert') }
        );
        return;
      case 'rename':
        setRenaming(item);
        return;
      case 'delete':
        confirmDelete(item);
    }
  };

  const rename = (item: StudioAssetItem, title: string) =>
    update.mutate({ id: item.id, body: { title } }, { onError: failed('Nicht umbenannt') });

  const sheets = (
    <>
      <ReportSheet
        target={reportTarget}
        onClose={() => setReportTarget(null)}
        onReported={() => void queryClient.invalidateQueries({ queryKey: STUDIO_ASSETS_QUERY_KEY })}
      />
      <StudioAssetRenameSheet item={renaming} onSave={rename} onClose={() => setRenaming(null)} />
    </>
  );

  return { onAction, sheets };
}
