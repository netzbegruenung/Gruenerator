import { describe, expect, it } from 'vitest';

import {
  editRowKind,
  serializeBoxEdit,
  serializeLayout,
  validateBoxEdit,
  validateElements,
  validateLayout,
} from '../flux3Boxes.js';

import type { Flux3EditRow } from '@gruenerator/contracts';

// The runner from docs.bfl.ai/flux_3/flux3_image_bounding_boxes#generate-a-layout.
const runner = {
  caption:
    'Minimalist graphic illustration featuring a black silhouette of a person <silhouette_1> centered against a solid, vibrant chartreuse background <background_1>.',
  rows: [
    { id: 'background_1', bbox: [0, 0, 1000, 1000], desc: 'A flat field of neon yellow-green.' },
    { id: 'silhouette_1', bbox: [150, 150, 850, 850], desc: 'A black silhouette of a runner.' },
  ],
};

const keep = (id: string, box: [number, number, number, number]): Flux3EditRow => ({
  id,
  from: 'ref_image_0',
  src_bbox: box,
  tgt_bbox: box,
  desc: id,
});

describe('validateLayout', () => {
  it('accepts the documented example', () => {
    expect(validateLayout(runner)).toEqual({ ok: true, value: runner });
  });

  it('rejects a caption token without a row and a row the caption never names', () => {
    const extraToken = { ...runner, caption: `${runner.caption} A title <title_1>.` };
    expect(validateLayout(extraToken)).toMatchObject({
      ok: false,
      error: expect.stringContaining('<title_1>'),
    });
    const unnamed = { ...runner, caption: 'A runner <silhouette_1>.' };
    expect(validateLayout(unnamed)).toMatchObject({
      ok: false,
      error: expect.stringContaining('background_1'),
    });
  });

  it('rejects x-first or inverted boxes', () => {
    const inverted = {
      ...runner,
      rows: [runner.rows[0], { ...runner.rows[1], bbox: [850, 150, 150, 850] }],
    };
    expect(validateLayout(inverted).ok).toBe(false);
  });

  it('rejects boxes too small for a new element to appear', () => {
    const tiny = {
      ...runner,
      rows: [runner.rows[0], { ...runner.rows[1], bbox: [100, 100, 120, 400] }],
    };
    expect(validateLayout(tiny)).toMatchObject({
      ok: false,
      error: expect.stringContaining('smaller'),
    });
  });

  it('rejects coordinates outside the 0–1000 grid', () => {
    const outside = {
      ...runner,
      rows: [{ ...runner.rows[0], bbox: [0, 0, 1080, 1920] }, runner.rows[1]],
    };
    expect(validateLayout(outside).ok).toBe(false);
  });
});

describe('validateElements', () => {
  it('lets detection report small elements', () => {
    const result = validateElements({
      elements: [{ id: 'insect_1', bbox: [740, 352, 789, 376], desc: 'small insect' }],
    });
    expect(result.ok).toBe(true);
  });

  it('rejects duplicate ids', () => {
    const element = { id: 'moth_1', bbox: [1, 1, 50, 50], desc: 'moth' };
    expect(validateElements({ elements: [element, element] }).ok).toBe(false);
  });
});

describe('editRowKind', () => {
  it('reads the four documented row shapes', () => {
    const box: [number, number, number, number] = [10, 10, 200, 200];
    expect(editRowKind(keep('a', box))).toBe('keep');
    expect(editRowKind({ ...keep('a', box), tgt_bbox: [300, 300, 500, 500] })).toBe('move');
    expect(editRowKind({ ...keep('a', box), from: null, src_bbox: null })).toBe('new');
    expect(editRowKind({ ...keep('a', box), tgt_bbox: null })).toBe('remove');
  });

  it('rejects a new row that still names a source box', () => {
    expect(editRowKind({ ...keep('a', [1, 1, 50, 50]), from: null })).toBeNull();
  });
});

describe('validateBoxEdit', () => {
  const moth: Flux3EditRow = {
    id: 'moth_1',
    from: null,
    src_bbox: null,
    tgt_bbox: [350, 150, 480, 300],
    desc: 'A moth with leopard print wings.',
  };
  const lamp = keep('light_fixture_1', [0, 0, 850, 1000]);

  it('accepts a recolor with anchors', () => {
    const edit = {
      instruction: 'Replace the moth <moth_1>, keep <light_fixture_1>.',
      rows: [lamp, moth],
    };
    expect(validateBoxEdit(edit).ok).toBe(true);
  });

  it('allows <ref_image_0> in the instruction', () => {
    const edit = { instruction: 'In <ref_image_0>, replace <moth_1>.', rows: [moth] };
    expect(validateBoxEdit(edit).ok).toBe(true);
  });

  it('rejects an edit where every row is a keep', () => {
    const edit = { instruction: 'Keep <light_fixture_1>.', rows: [lamp] };
    expect(validateBoxEdit(edit)).toMatchObject({
      ok: false,
      error: expect.stringContaining('keep'),
    });
  });

  it('rejects an instruction token without a row', () => {
    const edit = { instruction: 'Replace <moth_9>.', rows: [moth] };
    expect(validateBoxEdit(edit).ok).toBe(false);
  });
});

describe('wire format', () => {
  it('appends the rows to the caption after one space', () => {
    expect(serializeLayout(runner as Parameters<typeof serializeLayout>[0])).toBe(
      `${runner.caption} [{"id":"background_1","bbox":[0,0,1000,1000],"desc":"A flat field of neon yellow-green."},{"id":"silhouette_1","bbox":[150,150,850,850],"desc":"A black silhouette of a runner."}]`
    );
  });

  it('writes edit rows in the documented field order', () => {
    const prompt = serializeBoxEdit({
      instruction: 'Remove <cat_1>.',
      rows: [
        {
          desc: 'An orange cat.',
          tgt_bbox: null,
          src_bbox: [265, 40, 855, 400],
          from: 'ref_image_0',
          id: 'cat_1',
        },
      ],
    });
    expect(prompt).toBe(
      'Remove <cat_1>. [{"id":"cat_1","from":"ref_image_0","src_bbox":[265,40,855,400],"tgt_bbox":null,"desc":"An orange cat."}]'
    );
  });
});
