import { type SavedProfilbildSticker } from '@gruenerator/shared/profilbild';
import { type AssetStickerId, type SystemSticker } from '@gruenerator/shared/stickers';

import { type ProfilbildStickerPlacement } from './composeProfilbild';

export interface PlacedSticker extends ProfilbildStickerPlacement {
  uid: string;
  id: SystemSticker['id'] | AssetStickerId;
  /** The catalog image, or a shop sticker's `/api/share/<token>/download` path. */
  src: string;
  label: string;
}

export type StickerChange = Pick<PlacedSticker, 'x' | 'y' | 'width' | 'height' | 'rotation'>;

export interface StickerNodeState {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
}

/** Bakes a node's scale into the sticker's width/height; the caller resets the node scale to 1. */
export function stickerBox(
  sticker: Pick<PlacedSticker, 'width' | 'height'>,
  node: StickerNodeState
): StickerChange {
  return {
    x: node.x,
    y: node.y,
    width: sticker.width * node.scaleX,
    height: sticker.height * node.scaleY,
    rotation: node.rotation,
  };
}

/**
 * Loads each saved sticker on its own. One that fails stays saved but undrawn,
 * so the next save keeps it instead of one failure dropping every sticker.
 */
export async function restoreSavedStickers<T>(
  saved: readonly SavedProfilbildSticker[],
  load: (sticker: SavedProfilbildSticker) => Promise<T | null>,
  onError: (cause: unknown) => void
): Promise<{ placed: T[]; unrestored: SavedProfilbildSticker[] }> {
  const results = await Promise.all(
    saved.map((s) =>
      load(s).then(
        (value) => ({ ok: true as const, value }),
        (cause: unknown) => {
          onError(cause);
          return { ok: false as const };
        }
      )
    )
  );
  const placed: T[] = [];
  const unrestored: SavedProfilbildSticker[] = [];
  results.forEach((r, i) => {
    if (!r.ok) unrestored.push(saved[i]!);
    else if (r.value !== null) placed.push(r.value);
  });
  return { placed, unrestored };
}
