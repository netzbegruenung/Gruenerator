import { SYSTEM_STICKERS } from '@gruenerator/shared/stickers';
import { describe, expect, it } from 'vitest';

import {
  ALL_ASSETS,
  createStickerInstance,
  EMOJI_ASSETS,
  getAssetById,
  getAssetBySrc,
  isStickerLikeInstance,
  resolveAssetInstanceSrc,
  STICKER_ASSETS,
  stickerAssetsForLocale,
  TEMPLATE_ASSETS,
} from './canvasAssets';

const SHOP_ID = 'asset:0b6f3c1e-8a4d-4f5e-9c2a-7d1e5b3a9f10';
const SHARE_SRC = '/api/share/0123456789abcdef0123456789abcdef/download';

describe('asset instance src', () => {
  it('draws a shop sticker from its own share path', () => {
    const inst = { assetId: SHOP_ID, src: SHARE_SRC };
    expect(resolveAssetInstanceSrc(inst)).toBe(SHARE_SRC);
    expect(isStickerLikeInstance(inst)).toBe(true);
  });

  it('ignores a foreign src and falls back to the catalogue', () => {
    expect(resolveAssetInstanceSrc({ assetId: SHOP_ID, src: 'https://evil.example/x.png' })).toBe(
      null
    );
    expect(resolveAssetInstanceSrc({ assetId: 'arrow', src: 'https://evil.example/x.png' })).toBe(
      getAssetById('arrow')!.src
    );
    expect(isStickerLikeInstance({ assetId: 'arrow', src: 'https://evil.example/x.png' })).toBe(
      false
    );
  });

  it('resolves catalogue assets without a src as before', () => {
    expect(resolveAssetInstanceSrc({ assetId: 'quote-mark' })).toBe('/quote.svg');
  });
});

describe('sticker catalogue', () => {
  it('registers every system sticker as a resolvable sticker asset', () => {
    for (const s of SYSTEM_STICKERS) {
      expect(getAssetById(s.id)).toMatchObject({ src: s.src, category: 'sticker' });
      expect(isStickerLikeInstance({ assetId: s.id })).toBe(true);
    }
  });

  it('offers de-AT no German sunflower sticker', () => {
    const at = stickerAssetsForLocale('de-AT').map((a) => a.id);
    expect(at.some((id) => id.startsWith('sonnenblume'))).toBe(false);
    expect(at).toContain('vielfalt');
    expect(stickerAssetsForLocale('de-DE').map((a) => a.id)).toContain('sonnenblume-gelb');
  });

  it('shares no id with the other asset sets', () => {
    const others = new Set([...ALL_ASSETS, ...TEMPLATE_ASSETS, ...EMOJI_ASSETS].map((a) => a.id));
    expect(STICKER_ASSETS.filter((a) => others.has(a.id))).toEqual([]);
  });

  it('leaves src lookups of shared files on the catalogue graphic', () => {
    expect(getAssetBySrc('/sonnenblume_weiss.svg')?.id).toBe('sunflower-weiss');
  });

  it('creates sticker instances for catalogue and shop refs, not for foreign ones', () => {
    expect(createStickerInstance({ id: 'teamgruen', src: '/whatever' }, 1080, 1080)).toMatchObject({
      assetId: 'teamgruen',
      x: 540,
      y: 540,
      scale: 1,
    });
    expect(
      createStickerInstance({ id: 'teamgruen', src: '/whatever' }, 1080, 1080)
    ).not.toHaveProperty('src');
    expect(createStickerInstance({ id: SHOP_ID, src: SHARE_SRC }, 1080, 1080)).toMatchObject({
      assetId: SHOP_ID,
      src: SHARE_SRC,
    });
    expect(createStickerInstance({ id: SHOP_ID, src: 'https://evil.example/x' }, 1, 1)).toBeNull();
  });
});
