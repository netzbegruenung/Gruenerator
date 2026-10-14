import { describe, expect, it } from 'vitest';

import { ASSET_TARGET_SIZE } from './canvasAssets';
import { profilbildStickersToAssetInstances } from './profilbildStickerInstances';

const SHARE = '/api/share/0123456789abcdef0123456789abcdef/download';
const SHOP_ID = 'asset:0b6f3c1e-8a4d-4f5e-9c2a-7d1e5b3a9f10' as const;

describe('profilbildStickersToAssetInstances', () => {
  it('keeps the centre and measures the longer side against the asset target size', () => {
    const [inst] = profilbildStickersToAssetInstances(
      [{ id: 'teamgruen', x: 700, y: 760, width: 432, height: 216, rotation: 15 }],
      1080,
      1080
    );
    expect(inst).toMatchObject({
      assetId: 'teamgruen',
      x: 700,
      y: 760,
      scale: 432 / ASSET_TARGET_SIZE,
      rotation: 15,
      opacity: 1,
    });
    expect(inst).not.toHaveProperty('src');
  });

  it('rescales from the 1080 sheet to another canvas size', () => {
    const [inst] = profilbildStickersToAssetInstances(
      [{ id: 'vielfalt', x: 540, y: 270, width: 200, height: 300, rotation: 0 }],
      1080,
      540
    );
    expect(inst).toMatchObject({ x: 270, y: 135, scale: 150 / ASSET_TARGET_SIZE });
  });

  it('carries a shop sticker with its share path', () => {
    const [inst] = profilbildStickersToAssetInstances(
      [{ id: SHOP_ID, src: SHARE, x: 100, y: 100, width: 150, height: 150, rotation: -30 }],
      1080,
      1080
    );
    expect(inst).toMatchObject({ assetId: SHOP_ID, src: SHARE, scale: 1, rotation: -30 });
  });

  it('drops stickers that resolve to no image and gives the rest unique ids', () => {
    const box = { x: 1, y: 1, width: 10, height: 10, rotation: 0 };
    const list = profilbildStickersToAssetInstances(
      [
        { id: SHOP_ID, ...box },
        { id: 'regenbogen', ...box },
        { id: 'regenbogen', ...box },
      ],
      1080,
      1080
    );
    expect(list.map((i) => i.assetId)).toEqual(['regenbogen', 'regenbogen']);
    expect(new Set(list.map((i) => i.id)).size).toBe(2);
  });
});
