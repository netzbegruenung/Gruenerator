import { type AssetStickerId, type SystemSticker } from './catalog.js';

export interface SavedProfilbildSticker {
  id: SystemSticker['id'] | AssetStickerId;
  /** Only for shop stickers (`asset:<uuid>`): the `/api/share/<token>/download` path. */
  src?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}
