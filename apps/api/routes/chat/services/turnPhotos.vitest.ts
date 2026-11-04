import { describe, expect, it } from 'vitest';

import { collectTurnPhotos, type SharepicOwnPhotoWithUrl } from './turnPhotos.js';

const img = (n: number) => ({ name: `f${n}.jpg`, type: 'image/jpeg', data: 'AAAA' });
const prior = (id: string): SharepicOwnPhotoWithUrl =>
  ({ id, url: 'https://x/y.jpg' }) as SharepicOwnPhotoWithUrl;

describe('collectTurnPhotos', () => {
  it('numbers a first upload upload:1', () => {
    const r = collectTurnPhotos([img(1)], [], []);
    expect(r.take.map((t) => t.id)).toEqual(['upload:1']);
    expect(r.skipped).toEqual([]);
  });

  it('continues after prior photos', () => {
    const r = collectTurnPhotos([img(1)], [], [prior('upload:1')]);
    expect(r.take.map((t) => t.id)).toEqual(['upload:2']);
  });

  it('strips a data: prefix', () => {
    const r = collectTurnPhotos([{ ...img(1), data: 'data:image/jpeg;base64,AAAA' }], [], []);
    expect(r.take[0].source).toMatchObject({ kind: 'upload', data: 'AAAA' });
  });

  it('ignores non-image Wolke files, takes images case-insensitively', () => {
    const ref = (name: string) => ({ shareLinkId: 's', path: `/${name}`, name });
    const r = collectTurnPhotos([], [ref('a.pdf'), ref('B.JPG')], []);
    expect(r.take.map((t) => t.source.kind)).toEqual(['wolke']);
    expect(r.skipped).toEqual([]);
  });

  it.each([
    [5, 1, 'Ein weiteres Foto habe ich nicht verwendet – höchstens 4 Fotos pro Sharepic.'],
    [6, 2, '2 weitere Fotos habe ich nicht verwendet – höchstens 4 Fotos pro Sharepic.'],
  ])('%i uploads: 4 taken, one gestaltung entry', (count, _over, text) => {
    const r = collectTurnPhotos(
      Array.from({ length: count }, (_, i) => img(i)),
      [],
      []
    );
    expect(r.take.map((t) => t.id)).toEqual(['upload:1', 'upload:2', 'upload:3', 'upload:4']);
    expect(r.skipped).toEqual([{ art: 'gestaltung', text }]);
  });

  it('skips an oversized upload without consuming an id', () => {
    const big = { name: 'big.png', type: 'image/png', data: 'A'.repeat(34 * 1024 * 1024) };
    const r = collectTurnPhotos([big, img(1)], [], []);
    expect(r.take.map((t) => t.id)).toEqual(['upload:1']);
    expect(r.skipped).toEqual([
      { art: 'gestaltung', text: 'Ein Foto habe ich nicht verwendet – es war zu groß.' },
    ]);
  });
});
