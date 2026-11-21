/**
 * A patch built from a stale read (#5765): the API reads, a model works for seconds, a client
 * edits meanwhile, then the patch arrives with the base it was computed from.
 */
import { readState, writeStateKeys } from '@ggraphic/core/ydoc';
import { describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';

vi.mock('./logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { CANVAS_KEY_CLASSES } from './canvasCodec.js';
import { clientDoc, stateOf } from './canvasDoc.testUtils.js';
import { mergeStalePatch } from './canvasMerge.js';
import { applyDeckChangesToDoc, applyPatchToDoc } from './internalApi.js';

const OPTIONS = { classes: CANVAS_KEY_CLASSES, lift: true };
const s = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  kind: 'rect',
  x: 1,
  ...extra,
});
const read = (doc: Y.Doc, key: string) => readState(stateOf(doc))[key];

/** The doc as the API read it: shapeInstances [s1, s2]; then a client sets s2.x=99 and adds s3. */
function scenario(stamp: 4 | null) {
  const doc = clientDoc({
    stamp,
    structured: stamp === 4,
    state: { shapeInstances: [s('s1'), s('s2')], layerOrder: ['s1', 's2'], headline: 'A' },
  });
  const base = { shapeInstances: [s('s1'), s('s2')], layerOrder: ['s1', 's2'], headline: 'A' };
  writeStateKeys(
    stateOf(doc),
    { shapeInstances: [s('s1'), s('s2', { x: 99 }), s('s3')], layerOrder: ['s1', 's2', 's3'] },
    OPTIONS
  );
  return { doc, base };
}

describe.each([4, null] as const)('stale patch into a document stamped %s', (stamp) => {
  it('reproduces #5765: patch changes s1, the client edit of s2 and the new s3 survive', () => {
    const { doc, base } = scenario(stamp);
    applyPatchToDoc(doc, { shapeInstances: [s('s1', { x: 5 }), s('s2')] }, null, {
      shapeInstances: base.shapeInstances,
    });
    expect(read(doc, 'shapeInstances')).toEqual([s('s1', { x: 5 }), s('s2', { x: 99 }), s('s3')]);
  });

  it('without a base the patch is written as given (old behaviour)', () => {
    const { doc } = scenario(stamp);
    applyPatchToDoc(doc, { shapeInstances: [s('s1', { x: 5 }), s('s2')] }, null);
    expect(read(doc, 'shapeInstances')).toEqual([s('s1', { x: 5 }), s('s2')]);
  });

  it('an element the patch dropped is deleted, one only the client has is kept', () => {
    const { doc, base } = scenario(stamp);
    applyPatchToDoc(doc, { shapeInstances: [s('s2')] }, null, {
      shapeInstances: base.shapeInstances,
    });
    expect(read(doc, 'shapeInstances')).toEqual([s('s2', { x: 99 }), s('s3')]);
  });

  it('an element new in the patch is added after its predecessor', () => {
    const { doc, base } = scenario(stamp);
    applyPatchToDoc(doc, { shapeInstances: [s('s1'), s('s2'), s('s4')] }, null, {
      shapeInstances: base.shapeInstances,
    });
    expect(read(doc, 'shapeInstances')).toEqual([s('s1'), s('s2', { x: 99 }), s('s4'), s('s3')]);
  });

  it('on the same property the patch wins; other properties of the client edit stay', () => {
    const { doc, base } = scenario(stamp);
    writeStateKeys(
      stateOf(doc),
      { shapeInstances: [s('s1'), s('s2', { x: 99, y: 7 }), s('s3')] },
      OPTIONS
    );
    applyPatchToDoc(doc, { shapeInstances: [s('s1'), s('s2', { x: 5 })] }, null, {
      shapeInstances: base.shapeInstances,
    });
    expect(read(doc, 'shapeInstances')).toEqual([s('s1'), s('s2', { x: 5, y: 7 }), s('s3')]);
  });

  it('an element the client deleted is not brought back by an edit of it', () => {
    const { doc, base } = scenario(stamp);
    writeStateKeys(stateOf(doc), { shapeInstances: [s('s1'), s('s3')] }, OPTIONS);
    applyPatchToDoc(doc, { shapeInstances: [s('s1'), s('s2', { x: 5 })] }, null, {
      shapeInstances: base.shapeInstances,
    });
    expect(read(doc, 'shapeInstances')).toEqual([s('s1'), s('s3')]);
  });

  it('an order list keeps the id a client added; scalars are left alone when unchanged', () => {
    const { doc, base } = scenario(stamp);
    applyPatchToDoc(doc, { layerOrder: ['s1', 's2'], headline: 'A' }, null, {
      layerOrder: base.layerOrder,
      headline: base.headline,
    });
    expect(read(doc, 'layerOrder')).toEqual(['s1', 's2', 's3']);
    applyPatchToDoc(doc, { headline: 'B' }, null, { headline: 'A' });
    expect(read(doc, 'headline')).toBe('B');
  });

  it('merges deck page patches by the page base', () => {
    const { doc, base } = scenario(stamp);
    applyDeckChangesToDoc(doc, {
      pagePatches: [
        {
          pageId: 'p1',
          patch: { shapeInstances: [s('s1', { x: 5 }), s('s2')] },
          base: { shapeInstances: base.shapeInstances },
        },
      ],
    });
    expect(read(doc, 'shapeInstances')).toEqual([s('s1', { x: 5 }), s('s2', { x: 99 }), s('s3')]);
  });
});

describe('mergeStalePatch', () => {
  it('takes the patch whole for a key without a base, an absent current, or duplicate ids', () => {
    const patch = {
      shapeInstances: [s('a')],
      layerOrder: ['a'],
      additionalTexts: [s('d'), s('d')],
    };
    const out = mergeStalePatch(
      { shapeInstances: undefined, additionalTexts: [s('d')] },
      patch,
      { shapeInstances: [], additionalTexts: [s('d')] },
      CANVAS_KEY_CLASSES
    );
    expect(out).toEqual(patch);
  });

  it('applies a reorder the patch made over the ids it knew, a client addition stays after its predecessor', () => {
    const out = mergeStalePatch(
      { layerOrder: ['a', 'b', 'c', 'x'] },
      { layerOrder: ['c', 'b', 'a'] },
      { layerOrder: ['a', 'b', 'c'] },
      CANVAS_KEY_CLASSES
    );
    expect(out.layerOrder).toEqual(['c', 'x', 'b', 'a']);
  });

  it('merges a record per entry', () => {
    const out = mergeStalePatch(
      { iconStates: { i1: 1, i2: 2 } },
      { iconStates: { i1: 9 } },
      { iconStates: { i1: 1, i3: 3 } },
      CANVAS_KEY_CLASSES
    );
    expect(out.iconStates).toEqual({ i1: 9, i2: 2 });
  });
});
