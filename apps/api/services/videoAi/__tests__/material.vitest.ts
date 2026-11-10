import { describe, expect, it } from 'vitest';

import { checkMaterial } from '../material.js';
import { type MediaForInput } from '../projectRepository.js';

const ID = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;

function row(n: number, media_type: string, extra: Partial<MediaForInput> = {}): MediaForInput {
  return {
    id: ID(n),
    media_type,
    title: `Datei ${n}`,
    original_filename: null,
    duration: media_type === 'video' ? 60 : null,
    status: 'ready',
    file_path: `tok${n}/media`,
    ...extra,
  };
}

describe('checkMaterial', () => {
  it('numbers clips and assets separately and sums the clip seconds', () => {
    const result = checkMaterial(
      [
        { mediaId: ID(1), role: 'footage' },
        { mediaId: ID(2), role: 'image' },
        { mediaId: ID(3), role: 'broll' },
        { mediaId: ID(4), role: 'audio' },
      ],
      [row(1, 'video'), row(2, 'image'), row(3, 'video', { duration: 8 }), row(4, 'audio')]
    );
    expect(result).toEqual({
      ok: true,
      clipSeconds: 68,
      inputs: [
        { id: 'c1', mediaId: ID(1), role: 'footage', title: 'Datei 1' },
        { id: 'a1', mediaId: ID(2), role: 'image', title: 'Datei 2' },
        { id: 'c2', mediaId: ID(3), role: 'broll', title: 'Datei 3' },
        { id: 'a2', mediaId: ID(4), role: 'audio', title: 'Datei 4' },
      ],
    });
  });

  it('refuses foreign or missing items, wrong kinds and footage-less sets', () => {
    expect(checkMaterial([{ mediaId: ID(1), role: 'footage' }], [])).toEqual({
      ok: false,
      error: expect.stringContaining('gibt es nicht mehr'),
    });
    expect(checkMaterial([{ mediaId: ID(1), role: 'footage' }], [row(1, 'image')])).toEqual({
      ok: false,
      error: '„Datei 1“ ist nicht ein Video.',
    });
    expect(checkMaterial([{ mediaId: ID(1), role: 'broll' }], [row(1, 'video')])).toEqual({
      ok: false,
      error: expect.stringContaining('gesprochen'),
    });
  });

  it('uses a probed length when the row has none, and refuses an unknown one', () => {
    const noLength = row(1, 'video', { duration: null });
    expect(checkMaterial([{ mediaId: ID(1), role: 'footage' }], [noLength])).toEqual({
      ok: false,
      error: expect.stringContaining('Länge'),
    });
    expect(
      checkMaterial([{ mediaId: ID(1), role: 'footage' }], [noLength], new Map([[ID(1), 42]]))
    ).toMatchObject({ ok: true, clipSeconds: 42 });
  });

  it('keeps the raw footage under fifteen minutes', () => {
    const result = checkMaterial(
      [
        { mediaId: ID(1), role: 'footage' },
        { mediaId: ID(2), role: 'footage' },
      ],
      [row(1, 'video', { duration: 600 }), row(2, 'video', { duration: 301 })]
    );
    expect(result).toEqual({ ok: false, error: expect.stringContaining('15 Minuten') });
  });
});

describe('checkMaterial with database rows', () => {
  it('counts lengths as numbers', () => {
    // loadOwnMedia converts NUMERIC; this pins the arithmetic it feeds.
    const result = checkMaterial(
      [{ mediaId: ID(1), role: 'footage' }],
      [row(1, 'video', { duration: 68.644 })]
    );
    expect(result.ok && typeof result.clipSeconds).toBe('number');
  });
});
