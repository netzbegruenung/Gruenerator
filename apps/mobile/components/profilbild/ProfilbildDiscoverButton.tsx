import { type StudioAssetKind } from '@gruenerator/contracts';
import { tabForKind, toGalleryAsset } from '@gruenerator/shared/marketplace';
import { type GalleryAsset } from '@gruenerator/shared/stickers';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useState } from 'react';

import { useTheme } from '../../hooks/useTheme';
import { MarketplaceSheet } from '../marketplace/MarketplaceSheet';

import { ActionTile } from './GalleryTiles';

/**
 * Tile at the end of a picker row: opens the Marktplatz for this kind as a
 * picker. A choice closes it and lands in the Profilbild.
 */
export function ProfilbildDiscoverButton({
  kind,
  size,
  onPick,
}: {
  kind: StudioAssetKind;
  size?: number;
  onPick(item: GalleryAsset): void;
}) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const tab = tabForKind(kind);
  return (
    <>
      <ActionTile label={`${tab.label} im Marktplatz`} size={size} onPress={() => setOpen(true)}>
        <Ionicons name="storefront-outline" size={22} color={theme.textSecondary} />
      </ActionTile>
      <MarketplaceSheet
        visible={open}
        onClose={() => setOpen(false)}
        kinds={[kind]}
        initialTab={tab.slug}
        title={`${tab.label} im Marktplatz`}
        description="Was andere öffentlich teilen. Tippe ein Bild an, um es zu verwenden."
        onPick={(item) => {
          if (item.kind === 'sticker' || item.kind === 'background') onPick(toGalleryAsset(item));
        }}
      />
    </>
  );
}
