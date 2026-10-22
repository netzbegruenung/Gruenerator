import { type StudioAssetItem } from '@gruenerator/contracts';

import { RenameSheet } from '../common/RenameSheet';

interface StudioAssetRenameSheetProps {
  /** null = closed. */
  item: StudioAssetItem | null;
  onSave: (item: StudioAssetItem, title: string) => void;
  onClose: () => void;
}

export function StudioAssetRenameSheet({ item, onSave, onClose }: StudioAssetRenameSheetProps) {
  return (
    <RenameSheet
      title={item?.title ?? null}
      onSave={(title) => {
        if (item) onSave(item, title);
      }}
      onClose={onClose}
    />
  );
}
