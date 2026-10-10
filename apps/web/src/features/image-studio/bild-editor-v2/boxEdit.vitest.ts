import { describe, expect, it } from 'vitest';

import { buildBoxEdit, clampBox, moveBox, newBoxId, resizeBox } from './boxEdit';
import { type BevBox } from './types';

const detected = (id: string, bbox: BevBox['bbox']): BevBox => ({
  id,
  bbox,
  source: bbox,
  desc: `${id} desc`,
  action: 'keep',
  change: '',
});

describe('buildBoxEdit', () => {
  it('returns null while nothing changed', () => {
    expect(buildBoxEdit([detected('a', [0, 0, 500, 500])], 'egal')).toBeNull();
  });

  it('writes keep, change, remove, move and new rows in BFL shape', () => {
    const edit = buildBoxEdit(
      [
        detected('sky_1', [0, 0, 400, 1000]),
        { ...detected('car_1', [500, 100, 800, 400]), action: 'change', change: 'a green tram' },
        { ...detected('cat_1', [600, 600, 900, 900]), action: 'remove' },
        { ...detected('dog_1', [500, 450, 700, 550]), bbox: [300, 450, 500, 550] },
        {
          ...detected('neu_1', [100, 100, 300, 300]),
          source: null,
          change: 'a bird',
          action: 'change',
        },
      ],
      ''
    );
    expect(edit?.rows).toEqual([
      {
        id: 'sky_1',
        from: 'ref_image_0',
        src_bbox: [0, 0, 400, 1000],
        tgt_bbox: [0, 0, 400, 1000],
        desc: 'sky_1 desc',
      },
      {
        id: 'car_1',
        from: null,
        src_bbox: null,
        tgt_bbox: [500, 100, 800, 400],
        desc: 'a green tram',
      },
      {
        id: 'cat_1',
        from: 'ref_image_0',
        src_bbox: [600, 600, 900, 900],
        tgt_bbox: null,
        desc: 'cat_1 desc',
      },
      {
        id: 'dog_1',
        from: 'ref_image_0',
        src_bbox: [500, 450, 700, 550],
        tgt_bbox: [300, 450, 500, 550],
        desc: 'dog_1 desc',
      },
      { id: 'neu_1', from: null, src_bbox: null, tgt_bbox: [100, 100, 300, 300], desc: 'a bird' },
    ]);
    // Every change is named in the instruction too ("say it twice").
    for (const id of ['car_1', 'cat_1', 'dog_1', 'neu_1'])
      expect(edit?.instruction).toContain(`<${id}>`);
    expect(edit?.instruction).not.toContain('<sky_1>');
  });

  it('removes the old spot when a changed element was also moved', () => {
    const edit = buildBoxEdit(
      [
        {
          ...detected('car_1', [500, 100, 800, 400]),
          bbox: [100, 100, 400, 400],
          action: 'change',
          change: 'tram',
        },
      ],
      ''
    );
    expect(edit?.rows.map((r) => [r.id, r.tgt_bbox])).toEqual([
      ['car_1_old', null],
      ['car_1', [100, 100, 400, 400]],
    ]);
  });

  it('puts the user text before the generated sentence', () => {
    const edit = buildBoxEdit(
      [{ ...detected('a', [0, 0, 500, 500]), action: 'remove' }],
      'Mach es abends.'
    );
    expect(edit?.instruction.startsWith('Mach es abends. In <ref_image_0>,')).toBe(true);
  });
});

describe('box geometry', () => {
  it('keeps moved boxes inside the grid without shrinking them', () => {
    expect(moveBox([900, 900, 1000, 1000], 50, 50)).toEqual([900, 900, 1000, 1000]);
    expect(moveBox([0, 0, 100, 100], -20, 30)).toEqual([0, 30, 100, 130]);
  });

  it('never resizes below the minimum edge', () => {
    expect(resizeBox([100, 100, 200, 200], -200, -200)).toEqual([100, 100, 130, 130]);
  });

  it('rounds drag results to integers', () => {
    expect(clampBox([10.4, 20.6, 110.4, 120.6])).toEqual([10, 21, 110, 121]);
  });

  it('numbers new boxes without collisions', () => {
    expect(newBoxId([{ ...detected('neu_1', [0, 0, 50, 50]) }])).toBe('neu_2');
  });
});
