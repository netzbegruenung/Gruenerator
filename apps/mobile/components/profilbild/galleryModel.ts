import {
  type StudioAssetItem,
  type StudioAssetKind,
  type StudioAssetScope,
} from '@gruenerator/contracts';
import { assetStickerId } from '@gruenerator/shared/stickers';

import { type StickerSource } from './sceneModel';

/** The gallery lists a picker offers, in tab order. */
export const GALLERY_SCOPES: { value: StudioAssetScope; label: string }[] = [
  { value: 'shop', label: 'Entdecken' },
  { value: 'mine', label: 'Meine' },
  { value: 'saved', label: 'Gemerkt' },
];

const NOUN: Record<StudioAssetKind, string> = { sticker: 'Sticker', background: 'Hintergründe' };

const EMPTY: Record<StudioAssetScope, (noun: string) => string> = {
  shop: (noun) => `Unter „Entdecken“ gibt es noch keine ${noun}.`,
  mine: (noun) => `Du hast noch keine eigenen ${noun}.`,
  saved: (noun) => `Du hast dir noch keine ${noun} gemerkt.`,
};

export function galleryEmptyText(kind: StudioAssetKind, scope: StudioAssetScope): string {
  return EMPTY[scope](NOUN[kind]);
}

export function galleryErrorText(kind: StudioAssetKind): string {
  return `${NOUN[kind]} konnten nicht geladen werden.`;
}

/** The tile image: the signed thumbnail, else the file itself (which needs auth). */
export function galleryTilePath(item: Pick<StudioAssetItem, 'thumbUrl' | 'src'>): string {
  return item.thumbUrl ?? item.src;
}

export function galleryStickerSource(item: Pick<StudioAssetItem, 'id' | 'src'>): StickerSource {
  return { id: assetStickerId(item.id), src: item.src, defaultScale: 1 };
}
