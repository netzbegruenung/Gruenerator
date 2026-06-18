import { describe, it, expect } from 'vitest';
import * as Y from 'yjs';

import {
  applyDeckChangesToDoc,
  applyPatchToDoc,
  linkDocToBoardCard,
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

const LINKED_DOCS_FIELD = 'field-linked-docs';

/** Read a card's linked docs back as the frontend does: parse the JSON-string cell. */
function readLinkedDocs(doc: Y.Doc, cardId: string): Array<{ id: string; title: string }> {
  const rows = doc.getArray('rows').toJSON() as Array<{
    id: string;
    cells: Record<string, unknown>;
  }>;
  const row = rows.find((r) => r.id === cardId);
  const raw = row?.cells[LINKED_DOCS_FIELD];
  return typeof raw === 'string' ? (JSON.parse(raw) as Array<{ id: string; title: string }>) : [];
}

describe('linkDocToBoardCard', () => {
  it('links into a plain-object row (web-client shape — the bug case)', () => {
    const doc = new Y.Doc();
    // How useBoardState writes rows: a plain JS object, NOT a Y.Map.
    doc.getArray('rows').push([{ id: 'row-1', cells: { [LINKED_DOCS_FIELD]: '[]' } }]);

    const found = linkDocToBoardCard(doc, 'row-1', { id: 'doc-1', title: 'Recherche' });

    expect(found).toBe(true);
    expect(readLinkedDocs(doc, 'row-1')).toEqual([{ id: 'doc-1', title: 'Recherche' }]);
  });

  it('links into a row with no linked-docs cell yet', () => {
    const doc = new Y.Doc();
    doc.getArray('rows').push([{ id: 'row-1', cells: { 'field-title': 'Aufgabe' } }]);

    const found = linkDocToBoardCard(doc, 'row-1', { id: 'doc-1', title: 'Recherche' });

    expect(found).toBe(true);
    expect(readLinkedDocs(doc, 'row-1')).toEqual([{ id: 'doc-1', title: 'Recherche' }]);
  });

  it('links into a Y.Map row (API addRowsToBoard shape)', () => {
    const doc = new Y.Doc();
    doc.transact(() => {
      const row = new Y.Map<unknown>();
      row.set('id', 'row-1');
      const cells = new Y.Map<unknown>();
      cells.set(LINKED_DOCS_FIELD, '[]');
      row.set('cells', cells);
      doc.getArray('rows').push([row]);
    });

    const found = linkDocToBoardCard(doc, 'row-1', { id: 'doc-1', title: 'Recherche' });

    expect(found).toBe(true);
    expect(readLinkedDocs(doc, 'row-1')).toEqual([{ id: 'doc-1', title: 'Recherche' }]);
  });

  it('is idempotent — linking the same doc id twice yields one entry', () => {
    const doc = new Y.Doc();
    doc.getArray('rows').push([{ id: 'row-1', cells: { [LINKED_DOCS_FIELD]: '[]' } }]);

    linkDocToBoardCard(doc, 'row-1', { id: 'doc-1', title: 'Recherche' });
    linkDocToBoardCard(doc, 'row-1', { id: 'doc-1', title: 'Recherche (neu)' });

    expect(readLinkedDocs(doc, 'row-1')).toEqual([{ id: 'doc-1', title: 'Recherche' }]);
  });

  it('appends alongside an existing linked doc, leaving other rows untouched', () => {
    const doc = new Y.Doc();
    doc.getArray('rows').push([
      { id: 'row-1', cells: { [LINKED_DOCS_FIELD]: '[{"id":"doc-0","title":"Alt"}]' } },
      { id: 'row-2', cells: { [LINKED_DOCS_FIELD]: '[]' } },
    ]);

    linkDocToBoardCard(doc, 'row-1', { id: 'doc-1', title: 'Neu' });

    expect(readLinkedDocs(doc, 'row-1')).toEqual([
      { id: 'doc-0', title: 'Alt' },
      { id: 'doc-1', title: 'Neu' },
    ]);
    expect(readLinkedDocs(doc, 'row-2')).toEqual([]);
  });

  it('returns false and mutates nothing when the card is not found', () => {
    const doc = new Y.Doc();
    doc.getArray('rows').push([{ id: 'row-1', cells: { [LINKED_DOCS_FIELD]: '[]' } }]);

    const found = linkDocToBoardCard(doc, 'row-missing', { id: 'doc-1', title: 'Recherche' });

    expect(found).toBe(false);
    expect(readLinkedDocs(doc, 'row-1')).toEqual([]);
  });
});
