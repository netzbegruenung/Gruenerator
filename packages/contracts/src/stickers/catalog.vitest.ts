import { describe, expect, it } from 'vitest';

import {
  assetStickerId,
  isAssetStickerId,
  isShareSrc,
  stickersForCollection,
  stickersForLocale,
  SYSTEM_STICKERS,
  systemStickerById,
} from './catalog';

describe('sticker catalog', () => {
  it('has unique ids and srcs', () => {
    expect(new Set(SYSTEM_STICKERS.map((s) => s.id)).size).toBe(SYSTEM_STICKERS.length);
    expect(new Set(SYSTEM_STICKERS.map((s) => s.src)).size).toBe(SYSTEM_STICKERS.length);
  });

  it('never collides with the asset id namespace', () => {
    expect(SYSTEM_STICKERS.some((s) => isAssetStickerId(s.id) || s.id.startsWith('asset:'))).toBe(
      false
    );
  });

  it('offers de-AT its own badges plus the shared stickers, never the German sunflowers', () => {
    expect(stickersForLocale('de-AT').map((s) => s.id)).toEqual([
      'teamgruen',
      'regenbogen',
      'regenbogen-herz',
      'progress-pride',
      'eu-flagge',
      'europa-sterne',
      'vielfalt',
      'at-gruen-waehlen',
      'at-klima-schuetzen',
      'at-jetzt-gruen',
    ]);
  });

  it('offers de-DE the sunflowers plus the shared stickers, never the Austrian badges', () => {
    expect(stickersForLocale('de-DE').map((s) => s.id)).toEqual([
      'sonnenblume-gelb',
      'sonnenblume-gruen',
      'sonnenblume-weiss',
      'teamgruen',
      'regenbogen',
      'regenbogen-herz',
      'progress-pride',
      'eu-flagge',
      'europa-sterne',
      'vielfalt',
    ]);
  });

  it('offers the Grüne Jugend stickers only through each country’s collection', () => {
    const de = stickersForCollection('gruene-jugend');
    const at = stickersForCollection('gruene-jugend-oesterreich');
    expect(de.length).toBeGreaterThan(0);
    expect(at.length).toBeGreaterThan(0);
    expect(de.every((s) => s.audience === 'de-DE')).toBe(true);
    expect(at.every((s) => s.audience === 'de-AT')).toBe(true);
    const offered = [...stickersForLocale('de-DE'), ...stickersForLocale('de-AT')];
    expect(offered.some((s) => 'kollektion' in s)).toBe(false);
    // A saved Profilbild still finds them.
    expect(systemStickerById('gj-zackenstern')?.label).toContain('Zackenstern');
  });

  it('looks stickers up by id', () => {
    expect(systemStickerById('teamgruen')?.defaultScale).toBe(1.6);
    expect(systemStickerById('nope')).toBeNull();
  });

  it('round-trips asset ids', () => {
    const id = assetStickerId('0b6f3c1e-8a4d-4f5e-9c2a-7d1e5b3a9f10');
    expect(isAssetStickerId(id)).toBe(true);
    expect(isAssetStickerId('asset:x')).toBe(false);
  });

  it('accepts only exact share download paths', () => {
    expect(isShareSrc('/api/share/0123456789abcdef0123456789abcdef/download')).toBe(true);
    expect(isShareSrc('/api/share/tok_en-1tok_en-1tok/download')).toBe(true);
    expect(isShareSrc('/api/share/short/download')).toBe(false);
    for (const src of [
      '/api/share/tok/preview',
      '/api/share/tok/download?x=1',
      '/api/share/../download',
      '/api/share/a/b/download',
      '/api/share//download',
      'https://evil.example/api/share/tok/download',
      '/api/share/tok/download/',
    ]) {
      expect(isShareSrc(src)).toBe(false);
    }
  });
});
