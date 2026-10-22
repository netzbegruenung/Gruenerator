import { Connection, Document } from '@hocuspocus/server';
import express from 'express';
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as Y from 'yjs';

import { detectPreviewKind } from './contentPreviews.js';
import {
  BOARD_FIELD_IDS,
  appendRowsToBoardDoc,
  closeRoomConnections,
  parseRoomCloseInput,
  registerInternalApi,
  appendSheetOps,
  claimSheetOps,
  applyDeckChangesToDoc,
  applyPatchToDoc,
  docBlockCount,
  isNewBoardRow,
  isSheetOpsBatchInput,
  parsesToBlocks,
  readDocHtml,
  readMergedState,
  replaceDocHtml,
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

describe('pagesById container', () => {
  it('new decks are seeded into pagesById with pos ordering and the watermark', () => {
    const doc = new Y.Doc();
    applyDeckChangesToDoc(doc, { seedPages: deckPages() });

    const pagesMap = doc.getMap<Y.Map<unknown>>('pagesById');
    expect(pagesMap.size).toBe(3);
    expect(doc.getMap<unknown>('meta').get('pagesSeeded')).toBe(true);
    expect(doc.getArray('pages').length).toBe(0);
    for (const yMap of ['p1', 'p2', 'p3'].map((id) => pagesMap.get(id)!)) {
      expect(typeof yMap.get('pos')).toBe('string');
    }
  });

  it('page ops insert at the right position via pos keys', () => {
    const doc = new Y.Doc();
    applyDeckChangesToDoc(doc, { seedPages: deckPages() });
    applyDeckChangesToDoc(doc, {
      pageOps: [
        { op: 'add', index: 1, page: { id: 'mid', configId: 'slider', state: {} } },
        { op: 'add', index: 0, page: { id: 'first', configId: 'slider', state: {} } },
      ],
    });
    expect(readMergedState(doc).pages.map((p) => p.id)).toEqual(['first', 'p1', 'mid', 'p2', 'p3']);
  });

  it('pagesById docs ignore formState in the merged state', () => {
    const doc = new Y.Doc();
    applyDeckChangesToDoc(doc, { seedPages: deckPages() });
    doc.getMap<unknown>('formState').set('headline', 'Legacy-Müll');
    expect(readMergedState(doc).state.headline).toBe('Cover');
  });

  it('legacy-array docs keep being patched in place', () => {
    const doc = new Y.Doc();
    const legacy = doc.getArray<Y.Map<unknown>>('pages');
    doc.transact(() => {
      legacy.push([buildPage({ line1: 'Alt' })]);
    });

    applyDeckChangesToDoc(doc, {
      pagePatches: [{ pageId: 'page-1', patch: { line1: 'Neu' } }],
    });
    expect(doc.getMap('pagesById').size).toBe(0);
    expect((legacy.get(0).get('state') as Y.Map<unknown>).get('line1')).toBe('Neu');
    expect(readMergedState(doc).pages[0]?.state.line1).toBe('Neu');
  });
});

describe('isNewBoardRow', () => {
  it('accepts a minimal row and a full row', () => {
    expect(isNewBoardRow({ title: 'A' })).toBe(true);
    expect(
      isNewBoardRow({ title: 'A', status: 's1', description: 'd', dueDate: '2026-01-01' })
    ).toBe(true);
    expect(isNewBoardRow({ title: 'A', dueDate: null })).toBe(true);
    expect(isNewBoardRow({ id: 'row-1', title: 'A' })).toBe(true);
  });

  it('rejects a missing/invalid title or wrong field types', () => {
    expect(isNewBoardRow({})).toBe(false);
    expect(isNewBoardRow({ title: 42 })).toBe(false);
    expect(isNewBoardRow({ title: 'A', status: 5 })).toBe(false);
    expect(isNewBoardRow({ title: 'A', dueDate: 5 })).toBe(false);
    expect(isNewBoardRow({ id: 7, title: 'A' })).toBe(false);
    expect(isNewBoardRow({ id: '', title: 'A' })).toBe(false);
    expect(isNewBoardRow(null)).toBe(false);
  });
});

describe('appendRowsToBoardDoc', () => {
  it('keeps a caller-chosen id and generates the rest', () => {
    const doc = new Y.Doc();
    appendRowsToBoardDoc(doc, [{ id: 'row-fixed', title: 'A' }, { title: 'B' }], 'user-1');
    const ids = (doc.getArray('rows').toJSON() as Array<{ id: string }>).map((r) => r.id);
    expect(ids[0]).toBe('row-fixed');
    expect(ids[1]).toMatch(/^row-\d+-1-/);
  });

  it('appends rows with the well-known cell layout', () => {
    const doc = new Y.Doc();
    appendRowsToBoardDoc(
      doc,
      [
        { title: 'Erste Aufgabe', status: 'status-2', description: 'Kontext' },
        { title: 'Zweite', dueDate: '2026-08-01' },
      ],
      'user-1'
    );

    const rows = doc.getArray('rows').toJSON() as Array<{
      id: string;
      createdBy: string;
      cells: Record<string, unknown>;
    }>;
    expect(rows).toHaveLength(2);

    const first = rows[0];
    expect(first.createdBy).toBe('user-1');
    expect(typeof first.id).toBe('string');
    expect(first.cells[BOARD_FIELD_IDS.TITLE]).toBe('Erste Aufgabe');
    expect(first.cells[BOARD_FIELD_IDS.STATUS]).toBe('status-2');
    expect(first.cells[BOARD_FIELD_IDS.DESCRIPTION]).toBe('Kontext');
    expect(first.cells[BOARD_FIELD_IDS.DUE_DATE]).toBe(null);
    expect(first.cells[BOARD_FIELD_IDS.LABELS]).toEqual([]);
    expect(first.cells[BOARD_FIELD_IDS.LINKED_DOCS]).toBe('[]');

    const second = rows[1];
    expect(second.cells[BOARD_FIELD_IDS.STATUS]).toBe(''); // no status → uncategorised
    expect(second.cells[BOARD_FIELD_IDS.DUE_DATE]).toBe('2026-08-01');
  });

  it('appends to an existing rows array without dropping prior rows', () => {
    const doc = new Y.Doc();
    appendRowsToBoardDoc(doc, [{ title: 'A' }], 'u');
    appendRowsToBoardDoc(doc, [{ title: 'B' }], 'u');
    const rows = doc.getArray('rows').toJSON() as Array<{ cells: Record<string, unknown> }>;
    expect(rows.map((r) => r.cells[BOARD_FIELD_IDS.TITLE])).toEqual(['A', 'B']);
  });
});

/**
 * The prose-document write path. `content` is a derived 2000-char preview, so
 * the only place a chat edit can land and be seen is the Yjs fragment — these
 * pin the two properties that make that swap safe.
 */
describe('internal doc API prose helpers', () => {
  const seed = (html: string): Y.Doc => {
    const doc = new Y.Doc();
    replaceDocHtml(doc, html);
    return doc;
  };

  it('round-trips prose through the fragment', () => {
    const doc = seed('<h1>Antrag</h1><p>Erster Absatz</p>');
    expect(readDocHtml(doc)).toContain('Antrag');
    expect(readDocHtml(doc)).toContain('Erster Absatz');
    expect(docBlockCount(doc)).toBeGreaterThan(0);
  });

  it('replaces rather than appends — the old version must not survive', () => {
    const doc = seed('<p>Alte Fassung</p>');
    replaceDocHtml(doc, '<p>Neue Fassung</p>');

    const html = readDocHtml(doc);
    expect(html).toContain('Neue Fassung');
    expect(html).not.toContain('Alte Fassung');
  });

  it('recognises html that parses to nothing BEFORE anything is deleted', () => {
    // The guard the endpoint checks on a scratch doc: replaceDocHtml deletes
    // first, so an unparseable new version would otherwise empty the document
    // and the chat would report a successful edit on a blank page.
    expect(parsesToBlocks('plain text without any block tags')).toBe(false);
    expect(parsesToBlocks('<p>Ein Absatz</p>')).toBe(true);
  });

  it('leaves a sheet/board doc detectable so the endpoint can refuse it', () => {
    const sheet = new Y.Doc();
    sheet.getMap('sheetMeta').set('snapshot', '{}');
    expect(detectPreviewKind(sheet)).toBe('sheets');
    expect(detectPreviewKind(seed('<p>Prosa</p>'))).toBe('blocknote');
  });
});

describe('sheet ops queue', () => {
  const batch = (id: string) => ({ id, operations: [{ type: 'insert_rows' }], summary: id, ts: 1 });

  it('hands every queued batch out exactly once, in order', () => {
    const doc = new Y.Doc();
    expect(appendSheetOps(doc, batch('a'))).toBe(1);
    expect(appendSheetOps(doc, batch('b'))).toBe(2);
    expect(claimSheetOps(doc).map((b) => b.id)).toEqual(['a', 'b']);
    expect(claimSheetOps(doc)).toEqual([]);
  });

  it('a second tab syncing the claimed doc sees an empty queue', () => {
    const server = new Y.Doc();
    appendSheetOps(server, batch('a'));
    const tab = new Y.Doc();
    Y.applyUpdate(tab, Y.encodeStateAsUpdate(server));
    claimSheetOps(server);
    Y.applyUpdate(tab, Y.encodeStateAsUpdate(server));
    expect(tab.getArray('sheetPendingOps').length).toBe(0);
  });

  it.each([
    [{ operations: [{}] }, true],
    [{ operations: [{}], summary: 'x' }, true],
    [{ operations: [] }, false],
    [{ operations: Array.from({ length: 51 }, () => ({})) }, false],
    [{ operations: [{}], summary: 3 }, false],
    [null, false],
  ])('validates %j → %s', (input, ok) => {
    expect(isSheetOpsBatchInput(input)).toBe(ok);
  });
});

/**
 * Access changes: an open connection was authenticated once, at setup. The
 * room close takes it off the document (no further broadcasts, next frame
 * needs a fresh Auth) and closes its socket so the provider reconnects and
 * runs through `onAuthenticate` again. Uses the framework's own Document and
 * Connection classes, so the "taken off the document" part is the real one.
 */
describe('closing rooms after an access change', () => {
  const fakeSocket = () => ({ readyState: 1, send: vi.fn(), close: vi.fn() });

  function connect(document: Document, userId: string) {
    const socket = fakeSocket();
    const connection = new Connection(socket, {} as Request, document, `socket-${userId}`, {
      user: { id: userId, name: userId },
      context: { readOnly: false },
    });
    return { socket, connection };
  }

  function rooms(...documents: Document[]) {
    return { documents: new Map(documents.map((d) => [d.name, d])) };
  }

  it('closes every connection of the room and its socket', () => {
    const doc = new Document('doc-1');
    const a = connect(doc, 'user-a');
    const b = connect(doc, 'user-b');

    expect(closeRoomConnections(rooms(doc), ['doc-1'], null)).toBe(2);

    expect(doc.getConnectionsCount()).toBe(0);
    for (const { socket } of [a, b]) {
      expect(socket.close).toHaveBeenCalledWith(4205, 'Reset Connection');
      // The framework's close message went out before the socket closed.
      expect(socket.send).toHaveBeenCalled();
    }
  });

  it("with a userId closes only that user's connections", () => {
    const doc = new Document('doc-1');
    const revoked = connect(doc, 'user-a');
    const kept = connect(doc, 'user-b');

    expect(closeRoomConnections(rooms(doc), ['doc-1'], 'user-a')).toBe(1);

    expect(doc.getConnections()).toEqual([kept.connection]);
    expect(revoked.socket.close).toHaveBeenCalled();
    expect(kept.socket.close).not.toHaveBeenCalled();
  });

  it('leaves other rooms alone and skips rooms nobody has open', () => {
    const doc = new Document('doc-1');
    const other = new Document('doc-2');
    connect(doc, 'user-a');
    const bystander = connect(other, 'user-a');

    expect(closeRoomConnections(rooms(doc, other), ['doc-1', 'not-loaded'], null)).toBe(1);

    expect(other.getConnections()).toEqual([bystander.connection]);
    expect(bystander.socket.close).not.toHaveBeenCalled();
  });

  it.each([
    [{ rooms: ['doc-1'] }, { rooms: ['doc-1'], userId: null }],
    [
      { rooms: ['doc-1'], userId: null },
      { rooms: ['doc-1'], userId: null },
    ],
    [
      { rooms: ['a', 'chat-b'], userId: 'u' },
      { rooms: ['a', 'chat-b'], userId: 'u' },
    ],
    [{ rooms: [] }, null],
    [{ rooms: [''] }, null],
    [{ rooms: [1] }, null],
    [{ rooms: ['a'], userId: '' }, null],
    [{ rooms: ['a'], userId: 7 }, null],
    [null, null],
  ])('parses %j → %j', (input, expected) => {
    expect(parseRoomCloseInput(input)).toEqual(expected);
  });

  describe('POST /internal/rooms/close', () => {
    let close: (() => Promise<void>) | null = null;

    afterEach(async () => {
      await close?.();
      close = null;
      vi.unstubAllEnvs();
    });

    async function start(documents: Map<string, Document>): Promise<string> {
      vi.stubEnv('HOCUSPOCUS_INTERNAL_TOKEN', 'secret');
      const app = express();
      registerInternalApi(app, {
        server: { hocuspocus: { documents } } as unknown as Parameters<
          typeof registerInternalApi
        >[1]['server'],
        persistence: {} as Parameters<typeof registerInternalApi>[1]['persistence'],
      });
      const server = app.listen(0, '127.0.0.1');
      await new Promise<void>((resolve) => server.once('listening', resolve));
      close = () => new Promise<void>((resolve) => server.close(() => resolve()));
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('no port');
      return `http://127.0.0.1:${address.port}/internal/rooms/close`;
    }

    const post = (url: string, body: unknown, token: string | null) =>
      fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(token ? { 'x-internal-token': token } : {}),
        },
        body: JSON.stringify(body),
      });

    it('closes the room for a caller with the internal token', async () => {
      const doc = new Document('doc-1');
      const { socket } = connect(doc, 'user-a');
      const url = await start(new Map([['doc-1', doc]]));

      const res = await post(url, { rooms: ['doc-1'] }, 'secret');

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true, closed: 1 });
      expect(doc.getConnectionsCount()).toBe(0);
      expect(socket.close).toHaveBeenCalledWith(4205, 'Reset Connection');
    });

    it.each([null, 'wrong'])('refuses token %j and closes nothing', async (token) => {
      const doc = new Document('doc-1');
      const { socket } = connect(doc, 'user-a');
      const url = await start(new Map([['doc-1', doc]]));

      const res = await post(url, { rooms: ['doc-1'] }, token);

      expect(res.status).toBe(401);
      expect(doc.getConnectionsCount()).toBe(1);
      expect(socket.close).not.toHaveBeenCalled();
    });

    it('rejects a malformed body', async () => {
      const url = await start(new Map());
      const res = await post(url, { rooms: 'doc-1' }, 'secret');
      expect(res.status).toBe(400);
    });
  });
});
