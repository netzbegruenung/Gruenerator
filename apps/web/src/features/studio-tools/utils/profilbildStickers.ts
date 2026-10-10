import { type ProfilbildStickerPlacement } from './composeProfilbild';

export interface PlacedSticker extends ProfilbildStickerPlacement {
  uid: string;
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
