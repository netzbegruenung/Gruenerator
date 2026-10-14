import { describe, expect, it } from 'vitest';

import { galleryTarget, parseProfilbildAssetParams, profilbildAssetParams } from './galleryAsset';

const item = {
  id: '0b6f3c1e-8a4d-4f5e-9c2a-7d1e5b3a9f10',
  kind: 'sticker' as const,
  src: '/api/share/0123456789abcdef0123456789abcdef/download',
  title: 'Sonnenblume',
  width: 512,
  height: 480,
};

const fromRecord = (params: Record<string, string>) =>
  parseProfilbildAssetParams({ get: (key) => params[key] ?? null });

describe('profilbild asset params', () => {
  it('round-trips through a plain record, as a router hands them over', () => {
    expect(fromRecord(profilbildAssetParams(item))).toEqual(item);
  });

  it('round-trips through URLSearchParams', () => {
    const query = new URLSearchParams(profilbildAssetParams(item));
    expect(parseProfilbildAssetParams(query)).toEqual(item);
  });

  it('rejects anything but a gallery uuid, a known kind and a share path', () => {
    const params = profilbildAssetParams(item);
    expect(fromRecord({ ...params, asset: 'asset:nope' })).toBeNull();
    expect(fromRecord({ ...params, kind: 'font' })).toBeNull();
    expect(fromRecord({ ...params, src: 'https://evil.example/x.png' })).toBeNull();
    expect(fromRecord({})).toBeNull();
  });

  it('treats missing sizes as unknown and caps the title', () => {
    const { w: _w, h: _h, ...rest } = profilbildAssetParams(item);
    expect(fromRecord({ ...rest, title: `  ${'x'.repeat(200)}  ` })).toMatchObject({
      width: 0,
      height: 0,
      title: 'x'.repeat(120),
    });
  });
});

describe('galleryTarget', () => {
  it('names the item by its title, else by its kind', () => {
    expect(galleryTarget(item)).toBe('„Sonnenblume“');
    expect(galleryTarget({ title: '', kind: 'sticker' })).toBe('den Sticker');
    expect(galleryTarget({ title: '', kind: 'background' })).toBe('den Hintergrund');
  });
});
