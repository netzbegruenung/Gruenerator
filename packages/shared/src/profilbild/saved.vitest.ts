import { describe, expect, it } from 'vitest';

import {
  isProfilbildShare,
  parseSavedProfilbild,
  PROFILBILD_IMAGE_TYPE,
  type SavedProfilbild,
} from './saved';

const SAVED: SavedProfilbild = {
  v: 1,
  person: { x: 120, y: 200, scale: 0.85 },
  background: { kind: 'id', id: 'tanne' },
  stickers: [{ id: 'teamgruen', x: 700, y: 760, width: 430, height: 120, rotation: 15 }],
};

describe('parseSavedProfilbild', () => {
  it('reads back what the editors write', () => {
    expect(parseSavedProfilbild({ blurhash: 'x', profilbild: SAVED })).toEqual(SAVED);
  });

  it('keeps an own background photo stored as a share file', () => {
    const custom = { ...SAVED, background: { kind: 'custom', url: '/api/share/abc/download' } };
    expect(parseSavedProfilbild({ profilbild: custom })?.background).toEqual({
      kind: 'custom',
      url: '/api/share/abc/download',
    });
  });

  it('refuses a background URL outside the share store', () => {
    const foreign = { ...SAVED, background: { kind: 'custom', url: 'https://evil.example/x.png' } };
    expect(parseSavedProfilbild({ profilbild: foreign })).toBeNull();
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
