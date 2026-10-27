import { type SavedProfilbildSticker } from '@gruenerator/contracts';
import { isAssetStickerId } from '@gruenerator/contracts';

import { ASSET_TARGET_SIZE, type AssetInstance, resolveAssetInstanceSrc } from './canvasAssets';

export { type AssetInstance };

/**
 * Profilbild stickers (centre, pixel box on a `sheetSize` square) as asset
 * instances on a `canvasSize` square. An instance measures its longer side
 * against `ASSET_TARGET_SIZE`; stickers that resolve to no image are dropped.
 */
export function profilbildStickersToAssetInstances(
  stickers: readonly SavedProfilbildSticker[],
  sheetSize: number,
  canvasSize: number
): AssetInstance[] {
  const k = canvasSize / sheetSize;
  return stickers.flatMap((s, i) => {
    const instance: AssetInstance = {
      id: `asset-profilbild-${i}`,
      assetId: s.id,
      ...(isAssetStickerId(s.id) && s.src ? { src: s.src } : {}),
      x: s.x * k,
      y: s.y * k,
      scale: (Math.max(s.width, s.height) * k) / ASSET_TARGET_SIZE,
      rotation: s.rotation,
      opacity: 1,
    };
    return resolveAssetInstanceSrc(instance) ? [instance] : [];
  });
}
