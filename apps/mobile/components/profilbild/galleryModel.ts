import { type StudioAssetItem, type StudioAssetKind } from '@gruenerator/contracts';
import { assetStickerId } from '@gruenerator/shared/stickers';
import { STUDIO_ASSET_PLURAL } from '@gruenerator/shared/studio-assets';

import { type StickerSource } from './sceneModel';

export function galleryErrorText(kind: StudioAssetKind): string {
  return `${STUDIO_ASSET_PLURAL[kind]} konnten nicht geladen werden.`;
}

/** The tile image: the signed thumbnail, else the file itself (which needs auth). */
export function galleryTilePath(item: Pick<StudioAssetItem, 'thumbUrl' | 'src'>): string {
  return item.thumbUrl ?? item.src;
}

export function galleryStickerSource(item: Pick<StudioAssetItem, 'id' | 'src'>): StickerSource {
  return { id: assetStickerId(item.id), src: item.src, defaultScale: 1 };
}
