// SPDX-License-Identifier: MPL-2.0
/**
 * A remote stamp change queues a re-lift for the next microtask. If the
 * editor unmounts in between, that queued lift must not write to the doc.
 */
import { documentMigrations } from '@ggraphic/schema';
import { STAMP_STATE_KEY, STAMP_V2_STEP } from '@ggraphic/schema/document/__fixtures__/v2Fixture';
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import { getMetaMap, seedPagesIfEmpty } from '@ggraphic/editor/collab/pagesDoc';
import { useYjsPages } from '@ggraphic/editor/collab/useYjsPages';
import { YDOC_KEYS } from '@ggraphic/editor/collab/ydocKeys';

const KIND_KEY = `${YDOC_KEYS.kindVersionPrefix}${STAMP_STATE_KEY}`;

afterEach(() => documentMigrations.unregisterStateKey(STAMP_STATE_KEY));

function stampDoc(): Y.Doc {
  const ydoc = new Y.Doc();
  seedPagesIfEmpty(ydoc, [
    {
      id: 'p1',
      configId: 'freeform',
      state: { [STAMP_STATE_KEY]: [{ id: 's1', offset: { x: 1, y: 2 } }] },
    },
  ]);
  getMetaMap(ydoc).set(YDOC_KEYS.formStateFolded, true);
  return ydoc;
}

describe('a version re-lift queued before unmount', () => {
  it('lifts a stamp raced down while mounted', async () => {
    documentMigrations.registerStateKey(STAMP_STATE_KEY, [STAMP_V2_STEP]);
    const ydoc = stampDoc();
    renderHook(() => useYjsPages(ydoc, true));
    expect(getMetaMap(ydoc).get(KIND_KEY)).toBe(2);
    await act(async () => {
      getMetaMap(ydoc).set(KIND_KEY, 1);
      await Promise.resolve();
    });
    expect(getMetaMap(ydoc).get(KIND_KEY)).toBe(2);
  });

  it('writes nothing once unmounted', async () => {
    documentMigrations.registerStateKey(STAMP_STATE_KEY, [STAMP_V2_STEP]);
    const ydoc = stampDoc();
    const hook = renderHook(() => useYjsPages(ydoc, true));
    const updates: Uint8Array[] = [];
    await act(async () => {
      getMetaMap(ydoc).set(KIND_KEY, 1);
      hook.unmount();
      ydoc.on('update', (u: Uint8Array) => updates.push(u));
      await Promise.resolve();
    });
    expect(updates).toEqual([]);
    expect(getMetaMap(ydoc).get(KIND_KEY)).toBe(1);
  });
});
