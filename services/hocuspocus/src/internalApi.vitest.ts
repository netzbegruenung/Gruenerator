import { describe, it, expect } from 'vitest';
import * as Y from 'yjs';

import {
  applyDeckChangesToDoc,
  applyPatchToDoc,
  readMergedState,
  type PageDef,
} from './internalApi.js';

function buildPage(state: Record<string, unknown>): Y.Map<unknown> {
  const page = new Y.Map<unknown>();
  page.set('id', 'page-1');
  page.set('configId', 'dreizeilen');
  const stateMap = new Y.Map<unknown>();
  page.set('state', stateMap);
  // Y types must be attached to a doc before entries are set via transact
  // in real flows, but bare construction works for plain values too.
  for (const [k, v] of Object.entries(state)) stateMap.set(k, v);
  return page;
}

describe('internal canvas API doc helpers', () => {
  it('seeds formState with the full state on a never-opened doc', () => {
    const doc = new Y.Doc();
    applyPatchToDoc(doc, { line2: 'Neu' }, { line1: 'A', line2: 'B', line3: 'C' });

    const { state, hasYState } = readMergedState(doc);
    expect(hasYState).toBe(true);
    expect(state).toMatchObject({ line1: 'A', line2: 'Neu', line3: 'C' });
  });

  it('patches both formState and every page state map', () => {
    const doc = new Y.Doc();
    const pages = doc.getArray<Y.Map<unknown>>('pages');
    doc.transact(() => {
      pages.push([buildPage({ line1: 'Alt', line2: 'Alt2' })]);
      doc.getMap<unknown>('formState').set('line1', 'Alt');
    });

    applyPatchToDoc(doc, { line1: 'Frisch' }, null);

    const pageState = pages.get(0).get('state') as Y.Map<unknown>;
    expect(pageState.get('line1')).toBe('Frisch');
    expect(doc.getMap<unknown>('formState').get('line1')).toBe('Frisch');
  });

  it('merges page state under formState (formState wins)', () => {
    const doc = new Y.Doc();
    const pages = doc.getArray<Y.Map<unknown>>('pages');
    doc.transact(() => {
      pages.push([buildPage({ line1: 'Seed', colorSchemeId: 'tanne-sand' })]);
      doc.getMap<unknown>('formState').set('line1', 'Editiert');
    });

    const { state } = readMergedState(doc);
    expect(state.line1).toBe('Editiert');
    expect(state.colorSchemeId).toBe('tanne-sand');
  });

  it('reports hasYState=false for an empty doc', () => {
    const doc = new Y.Doc();
    expect(readMergedState(doc).hasYState).toBe(false);
  });
});

const deckPages = (): PageDef[] => [
  { id: 'p1', configId: 'slider', state: { headline: 'Cover', slideVariant: 'cover' } },
  { id: 'p2', configId: 'slider', state: { headline: 'Fakt 1', slideVariant: 'content' } },
  { id: 'p3', configId: 'slider', state: { headline: 'Ende', slideVariant: 'last' } },
];

describe('applyDeckChangesToDoc', () => {
  it('seeds pages only when the doc has none', () => {
    const doc = new Y.Doc();
    applyDeckChangesToDoc(doc, { seedPages: deckPages() });
    expect(readMergedState(doc).pages.map((p) => p.id)).toEqual(['p1', 'p2', 'p3']);

    // Re-seeding with different content is a no-op.
    applyDeckChangesToDoc(doc, {
      seedPages: [{ id: 'x', configId: 'slider', state: {} }],
    });
    expect(readMergedState(doc).pages.map((p) => p.id)).toEqual(['p1', 'p2', 'p3']);
  });

  it('patches a single page by id and leaves the others untouched', () => {
    const doc = new Y.Doc();
    applyDeckChangesToDoc(doc, { seedPages: deckPages() });
    applyDeckChangesToDoc(doc, {
      pagePatches: [{ pageId: 'p2', patch: { headline: 'Gepatcht' } }],
    });

    const { pages } = readMergedState(doc);
    expect(pages[1].state.headline).toBe('Gepatcht');
    expect(pages[0].state.headline).toBe('Cover');
    expect(pages[2].state.headline).toBe('Ende');
  });

  it('never touches formState (deck writes are page-scoped)', () => {
    const doc = new Y.Doc();
    applyDeckChangesToDoc(doc, { seedPages: deckPages() });
    applyDeckChangesToDoc(doc, {
      pagePatches: [{ pageId: 'p1', patch: { headline: 'Neu' } }],
    });
    expect(doc.getMap<unknown>('formState').size).toBe(0);
  });

  it('adds and removes pages by id', () => {
    const doc = new Y.Doc();
    applyDeckChangesToDoc(doc, { seedPages: deckPages() });
    applyDeckChangesToDoc(doc, {
      pageOps: [
        {
          op: 'add',
          index: 2,
          page: { id: 'p4', configId: 'slider', state: { headline: 'Fakt 2' } },
        },
        { op: 'remove', pageId: 'p2' },
      ],
    });

    const { pages } = readMergedState(doc);
    expect(pages.map((p) => p.id)).toEqual(['p1', 'p4', 'p3']);
  });

  it('replacePages swaps the whole deck (restore)', () => {
    const doc = new Y.Doc();
    applyDeckChangesToDoc(doc, { seedPages: deckPages() });
    applyDeckChangesToDoc(doc, {
      replacePages: [{ id: 'r1', configId: 'slider', state: { headline: 'Restored' } }],
    });

    const { pages } = readMergedState(doc);
    expect(pages).toHaveLength(1);
    expect(pages[0].state.headline).toBe('Restored');
  });

  it('flat-patch regression: applyPatchToDoc still mirrors into every page', () => {
    const doc = new Y.Doc();
    applyDeckChangesToDoc(doc, { seedPages: deckPages() });
    applyPatchToDoc(doc, { headline: 'Überall' }, null);

    const { pages } = readMergedState(doc);
    for (const p of pages) expect(p.state.headline).toBe('Überall');
  });
});
