import { describe, expect, it } from 'vitest';

import {
  isProfilbildShare,
  parseSavedProfilbild,
  PROFILBILD_IMAGE_TYPE,
  savedBackgroundShareToken,
  type SavedProfilbild,
} from './saved';

const SAVED: SavedProfilbild = {
  v: 1,
  person: { x: 120, y: 200, scale: 0.85 },
  background: { kind: 'id', id: 'tanne' },
  stickers: [{ id: 'teamgruen', x: 700, y: 760, width: 430, height: 120, rotation: 15 }],
};

const TOKEN = '0123456789abcdef0123456789abcdef';

describe('parseSavedProfilbild', () => {
  it('reads back what the editors write', () => {
    expect(parseSavedProfilbild({ blurhash: 'x', profilbild: SAVED })).toEqual(SAVED);
  });

  it('keeps an own background photo stored as a share file', () => {
    const custom = {
      ...SAVED,
      background: { kind: 'custom', url: '/api/share/0123456789abcdef0123456789abcdef/download' },
    };
    expect(parseSavedProfilbild({ profilbild: custom })?.background).toEqual({
      kind: 'custom',
      url: '/api/share/0123456789abcdef0123456789abcdef/download',
    });
  });

  it('refuses a background URL outside the share store', () => {
    const foreign = { ...SAVED, background: { kind: 'custom', url: 'https://evil.example/x.png' } };
    expect(parseSavedProfilbild({ profilbild: foreign })).toBeNull();
  });

  it('refuses a share path that is not a plain download', () => {
    const odd = { ...SAVED, background: { kind: 'custom', url: '/api/share/../x/download' } };
    expect(parseSavedProfilbild({ profilbild: odd })).toBeNull();
  });

  it('drops stickers it no longer knows instead of failing the reopen', () => {
    const stickers = [
      ...SAVED.stickers,
      { id: 'gibt-es-nicht', x: 1, y: 1, width: 1, height: 1, rotation: 0 },
    ];
    expect(parseSavedProfilbild({ profilbild: { ...SAVED, stickers } })?.stickers).toEqual(
      SAVED.stickers
    );
  });

  it('is null for metadata without editor state or of another version', () => {
    expect(parseSavedProfilbild({ sharepicType: 'profilbild' })).toBeNull();
    expect(parseSavedProfilbild({ profilbild: { ...SAVED, v: 2 } })).toBeNull();
    expect(parseSavedProfilbild(null)).toBeNull();
  });
});

describe('parseSavedProfilbild shop stickers', () => {
  const UUID = '0b6f3c1e-8a4d-4f5e-9c2a-7d1e5b3a9f10';
  const geo = { x: 1, y: 2, width: 3, height: 4, rotation: 0 };
  const parse = (sticker: Record<string, unknown>) =>
    parseSavedProfilbild({ profilbild: { ...SAVED, stickers: [sticker] } })?.stickers;

  it('keeps a shop sticker with a share src', () => {
    const sticker = {
      id: `asset:${UUID}`,
      src: '/api/share/0123456789abcdef0123456789abcdef/download',
      ...geo,
    };
    expect(parse(sticker)).toEqual([sticker]);
  });

  it('drops a shop sticker without or with a foreign src', () => {
    expect(parse({ id: `asset:${UUID}`, ...geo })).toEqual([]);
    expect(parse({ id: `asset:${UUID}`, src: 'https://evil/x.png', ...geo })).toEqual([]);
    expect(parse({ id: `asset:${UUID}`, src: '/images/x.png', ...geo })).toEqual([]);
  });

  it('drops a malformed asset id', () => {
    expect(
      parse({
        id: 'asset:nope',
        src: '/api/share/0123456789abcdef0123456789abcdef/download',
        ...geo,
      })
    ).toEqual([]);
    expect(
      parse({ id: UUID, src: '/api/share/0123456789abcdef0123456789abcdef/download', ...geo })
    ).toEqual([]);
  });

  it('reads legacy data without src unchanged', () => {
    expect(parseSavedProfilbild({ profilbild: SAVED })?.stickers).toEqual(SAVED.stickers);
  });
});

describe('isProfilbildShare', () => {
  it('needs the editor state, not just the image type canvas exports share', () => {
    expect(
      isProfilbildShare({ imageType: PROFILBILD_IMAGE_TYPE, imageMetadata: { profilbild: SAVED } })
    ).toBe(true);
    expect(isProfilbildShare({ imageType: PROFILBILD_IMAGE_TYPE, imageMetadata: {} })).toBe(false);
    expect(
      isProfilbildShare({ imageType: 'dreizeilen', imageMetadata: { profilbild: SAVED } })
    ).toBe(false);
  });
});

describe('savedBackgroundShareToken', () => {
  it('names the upload behind an own background photo, nothing for a swatch', () => {
    const custom: SavedProfilbild = {
      ...SAVED,
      background: { kind: 'custom', url: '/api/share/0123456789abcdef0123456789abcdef/download' },
    };
    expect(savedBackgroundShareToken(custom)).toBe(TOKEN);
    expect(savedBackgroundShareToken(SAVED)).toBeNull();
    expect(savedBackgroundShareToken(null)).toBeNull();
  });
});
