import { describe, expect, it } from 'vitest';

import { parseProfilbildAssetParams, profilbildAssetHref } from './galleryAsset';

const item = {
  id: '0b6f3c1e-8a4d-4f5e-9c2a-7d1e5b3a9f10',
  kind: 'background' as const,
  src: '/api/share/0123456789abcdef0123456789abcdef/download',
  title: 'Wiese & Himmel',
  width: 2160,
  height: 1440,
};

const parse = (href: string) => parseProfilbildAssetParams(new URL(href, 'http://x').searchParams);

describe('gallery deep link', () => {
  it('round-trips a gallery item through the Profilbild URL', () => {
    const href = profilbildAssetHref(item);
    expect(href.startsWith('/studio/profilbild?')).toBe(true);
    expect(parse(href)).toEqual(item);
  });

  it('ignores links that are not a gallery uuid plus a share path', () => {
    const href = (over: Record<string, string>) =>
      `/?${new URLSearchParams({ asset: item.id, kind: 'sticker', src: item.src, ...over }).toString()}`;
    expect(parse(href({ asset: 'nope' }))).toBeNull();
    expect(parse(href({ kind: 'font' }))).toBeNull();
    expect(parse(href({ src: 'https://evil.example/x.png' }))).toBeNull();
    expect(parse(href({ src: '/api/share/../download' }))).toBeNull();
  });

  it('treats missing or broken sizes as unknown', () => {
    expect(parse(`/?asset=${item.id}&kind=sticker&src=${item.src}&w=-3`)).toMatchObject({
      width: 0,
      height: 0,
      title: '',
    });
  });
});
