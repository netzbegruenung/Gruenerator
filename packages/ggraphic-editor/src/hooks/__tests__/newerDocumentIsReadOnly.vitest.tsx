// SPDX-License-Identifier: MPL-2.0
/**
 * A doc written by a newer build must not be written by this one: its pages
 * show read-only, nothing is seeded, lifted or edited, and the page manager
 * says why. A doc of today's version opens as before, without a write.
 */
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import { getMetaMap, seedPagesIfEmpty } from '@ggraphic/editor/collab/pagesDoc';
import { YDOC_KEYS } from '@ggraphic/editor/collab/ydocKeys';
import { readInitialDocument, usePageManager } from '@ggraphic/editor/hooks/usePageManager';

function v1Doc(): Y.Doc {
  const ydoc = new Y.Doc();
  seedPagesIfEmpty(ydoc, [{ id: 'p1', configId: 'freeform', state: { headline: 'Eins' } }]);
  // Opened before: the one-shot legacy fold has run.
  getMetaMap(ydoc).set(YDOC_KEYS.formStateFolded, true);
  return ydoc;
}

function open(ydoc: Y.Doc, isSynced = true) {
  return renderHook(
    (props: { isSynced: boolean }) =>
      usePageManager({
        initialConfigId: 'freeform',
        initialProps: { headline: 'Vorgabe' },
        collaborative: { ydoc, isSynced: props.isSynced },
      }),
    { initialProps: { isSynced } }
  );
}

const recordUpdates = (ydoc: Y.Doc) => {
  const updates: Uint8Array[] = [];
  ydoc.on('update', (u: Uint8Array) => updates.push(u));
  return updates;
};

describe('a doc of today’s version', () => {
  it('opens editable and is not written on open', () => {
    const ydoc = v1Doc();
    const updates = recordUpdates(ydoc);
    const { result } = open(ydoc);
    expect(result.current.isPreview).toBe(false);
    expect(result.current.schemaRefusal).toBeNull();
    expect(updates).toEqual([]);
  });

  it('gets stamped when this build seeds it', () => {
    const ydoc = new Y.Doc();
    open(ydoc);
    expect(getMetaMap(ydoc).get(YDOC_KEYS.schemaVersion)).toBe(1);
  });
});

describe('a doc from a newer version', () => {
  it('shows its pages read-only and writes nothing', () => {
    const ydoc = v1Doc();
    getMetaMap(ydoc).set(YDOC_KEYS.schemaVersion, 2);
    const updates = recordUpdates(ydoc);
    const { result } = open(ydoc);

    expect(result.current.isPreview).toBe(true);
    expect(result.current.schemaRefusal).toMatchObject({ status: 'newer', version: 2, known: 1 });
    expect(result.current.pages.map((p) => p.state.headline)).toEqual(['Eins']);
    expect(result.current.replaceDeck).toBeNull();

    act(() => {
      result.current.updatePageState(result.current.pages[0]!.id, { headline: 'Zwei' });
      result.current.duplicatePage(result.current.pages[0]!.id);
    });
    expect(updates).toEqual([]);
  });

  it('is not seeded when empty', () => {
    const ydoc = new Y.Doc();
    getMetaMap(ydoc).set(YDOC_KEYS.schemaVersion, 2);
    const updates = recordUpdates(ydoc);
    open(ydoc);
    expect(ydoc.getMap(YDOC_KEYS.pagesById).size).toBe(0);
    expect(updates).toEqual([]);
  });

  it('turns read-only when a newer client stamps it while open', async () => {
    const ydoc = v1Doc();
    const { result } = open(ydoc);
    expect(result.current.isPreview).toBe(false);
    await act(async () => {
      getMetaMap(ydoc).set(YDOC_KEYS.schemaVersion, 3);
      await Promise.resolve();
    });
    expect(result.current.isPreview).toBe(true);
    expect(result.current.schemaRefusal).toMatchObject({ status: 'newer', version: 3 });
  });
});

describe('readInitialDocument', () => {
  it('parses today’s document into seed pages', () => {
    const read = readInitialDocument({
      pages: [{ id: 'p1', configId: 'freeform', state: { headline: 'Eins' } }],
      currentImageSrc: 'cover.jpg',
    });
    expect(read.refusal).toBeNull();
    expect(read.pages).toEqual([{ id: 'p1', configId: 'freeform', state: { headline: 'Eins' } }]);
  });

  it('reads a document without pages as no pages', () => {
    expect(readInitialDocument({ headline: 'flat' })).toEqual({ pages: undefined, refusal: null });
  });

  it('refuses a newer document', () => {
    const read = readInitialDocument({ schemaVersion: 9, pages: [] });
    expect(read.refusal).toMatchObject({ status: 'newer', version: 9 });
    expect(read.pages).toBeUndefined();
  });
});
