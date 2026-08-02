/**
 * The depth registry against the wire enum it presents.
 *
 * These two lists are the seam where a tier goes missing: the backend enum is
 * what `/notebook/stream` accepts, this registry is what a person can pick. A
 * tier added to one and not the other is either an option that always 400s or a
 * retrieval profile nobody can reach — neither shows up as a type error, because
 * `NOTEBOOK_DEPTHS` is an array of the union, not a map over it.
 */
import { notebookDepthSchema, type NotebookDepth } from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import { DEFAULT_NOTEBOOK_DEPTH, NOTEBOOK_DEPTHS, notebookDepthDef } from './notebookDepth';

describe('NOTEBOOK_DEPTHS', () => {
  it('covers the wire enum exactly, in retrieval order', () => {
    expect(NOTEBOOK_DEPTHS.map((d) => d.depth)).toEqual(notebookDepthSchema.options);
  });

  it('labels every tier and says what it costs', () => {
    for (const tier of NOTEBOOK_DEPTHS) {
      expect(tier.label).not.toBe('');
      expect(tier.description).not.toBe('');
    }
  });

  it('gives each tier its own label and icon', () => {
    expect(new Set(NOTEBOOK_DEPTHS.map((d) => d.label)).size).toBe(NOTEBOOK_DEPTHS.length);
    expect(new Set(NOTEBOOK_DEPTHS.map((d) => d.icon)).size).toBe(NOTEBOOK_DEPTHS.length);
  });

  it('defaults to a tier that exists', () => {
    expect(notebookDepthSchema.safeParse(DEFAULT_NOTEBOOK_DEPTH).success).toBe(true);
    expect(NOTEBOOK_DEPTHS.some((d) => d.depth === DEFAULT_NOTEBOOK_DEPTH)).toBe(true);
  });
});

describe('notebookDepthDef', () => {
  it.each(notebookDepthSchema.options)('resolves %s to its own entry', (depth) => {
    expect(notebookDepthDef(depth).depth).toBe(depth);
  });

  it('falls back to the default for a tier this build does not know', () => {
    // The choice is persisted, so storage can hand back an id a later release
    // dropped. Putting that on the wire would fail the whole request.
    expect(notebookDepthDef('gigantisch' as NotebookDepth).depth).toBe(DEFAULT_NOTEBOOK_DEPTH);
    expect(notebookDepthDef(undefined).depth).toBe(DEFAULT_NOTEBOOK_DEPTH);
  });
});
