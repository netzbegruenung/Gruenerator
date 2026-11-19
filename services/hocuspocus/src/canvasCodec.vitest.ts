import { createRequire } from 'node:module';
import { realpathSync } from 'node:fs';
import { dirname } from 'node:path';

import { readState, writeStateKeys } from '@ggraphic/core/ydoc';
import { CANVAS_DOCUMENT_VERSION } from '@ggraphic/schema';
import express from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';

import { CanvasDocumentNewerError, CANVAS_KEY_CLASSES } from './canvasCodec.js';
import { SAMPLE_STATE, bytesOf, clientDoc, fork, stateOf } from './canvasDoc.testUtils.js';
import {
  applyDeckChangesToDoc,
  applyPatchToDoc,
  readMergedState,
  registerInternalApi,
  type PageDef,
} from './internalApi.js';

const metaOf = (doc: Y.Doc) => doc.getMap<unknown>('meta');

/** `internalApi.ts` before it used the codec: whole values straight into the Y.Map. */
function legacyApplyPatch(doc: Y.Doc, patch: Record<string, unknown>): void {
  doc.transact(() => {
    const pages = doc.getMap<Y.Map<unknown>>('pagesById');
    // The root formState is not written next to `pagesById` pages (#5767).
    if (pages.size === 0) {
      const formState = doc.getMap<unknown>('formState');
      for (const [k, v] of Object.entries(patch)) formState.set(k, v);
    }
    pages.forEach((page) => {
      const pageState = page.get('state') as Y.Map<unknown>;
      for (const [k, v] of Object.entries(patch)) pageState.set(k, v);
    });
  });
}

const PATCH = () => ({
  headline: 'Neu',
  additionalTexts: [
    { id: 't1', text: 'Eins!', x: 10, y: 20 },
    { id: 't2', text: 'Zwei', x: 30, y: 40 },
  ],
  balkenInstances: [{ id: 'b1', mode: 'single', texts: ['A!'], offset: { x: 5, y: 5 } }],
  layerOrder: ['t2', 't1'],
});

describe('reads go through the codec', () => {
  it('returns the same JSON for a plain document and its structured form', () => {
    const plain = clientDoc({ stamp: 3, structured: false });
    const structured = clientDoc({ stamp: 4, structured: true });
    // The fixture really is structured, or the comparison proves nothing.
    expect(stateOf(structured).get('additionalTexts')).toBeInstanceOf(Y.Map);
    expect(stateOf(structured).get('balkenInstances')).toBeInstanceOf(Y.Map);
    expect(stateOf(plain).get('additionalTexts')).toBeInstanceOf(Array);

    const a = readMergedState(plain);
    const b = readMergedState(structured);
    expect(b.state).toEqual(a.state);
    expect(b.pages).toEqual(a.pages);
    expect(b.state).toEqual(SAMPLE_STATE());
    expect(b.pages[0]?.state.additionalTexts).toEqual(SAMPLE_STATE().additionalTexts);
    expect(b.pages[0]?.state.layerOrder).toEqual(['t1', 't2', 's1']);
    expect(b.pages[0]?.state.iconStates).toEqual({ i1: { color: 'red' } });
  });

  it('reads a legacy pages array through the codec too', () => {
    const doc = new Y.Doc();
    doc.transact(() => {
      const page = new Y.Map<unknown>();
      page.set('id', 'p1');
      page.set('configId', 'dreizeilen');
      const state = new Y.Map<unknown>();
      page.set('state', state);
      doc.getArray<Y.Map<unknown>>('pages').push([page]);
      state.set('additionalTexts', [{ id: 't1', text: 'x' }]);
    });
    expect(readMergedState(doc).pages[0]?.state).toEqual({
      additionalTexts: [{ id: 't1', text: 'x' }],
    });
  });
});

describe.each([
  ['unstamped (version 1)', null],
  ['version 3', 3],
])('writes into an existing %s document', (_name, stamp) => {
  it('stores what the direct writes stored: byte-identical update for a flat patch', () => {
    const base = clientDoc({ stamp, structured: false });
    const a = fork(base, 77);
    const b = fork(base, 77);
    applyPatchToDoc(a, PATCH(), null);
    legacyApplyPatch(b, PATCH());
    expect(bytesOf(a).equals(bytesOf(b))).toBe(true);
    expect(stateOf(a).get('additionalTexts')).toEqual(PATCH().additionalTexts);
    expect(stateOf(a).get('additionalTexts')).not.toBeInstanceOf(Y.Map);
  });

  it('stores what the direct writes stored: byte-identical update for page patches', () => {
    const base = clientDoc({ stamp, structured: false });
    const a = fork(base, 77);
    const b = fork(base, 77);
    applyDeckChangesToDoc(a, { pagePatches: [{ pageId: 'p1', patch: PATCH() }] });
    b.transact(() => {
      const state = stateOf(b);
      for (const [k, v] of Object.entries(PATCH())) state.set(k, v);
    });
    expect(bytesOf(a).equals(bytesOf(b))).toBe(true);
  });

  it('writes plain JSON for added and replaced pages and leaves the stamp alone', () => {
    const doc = clientDoc({ stamp, structured: false });
    const page = (id: string): PageDef => ({ id, configId: 'dreizeilen', state: SAMPLE_STATE() });
    applyDeckChangesToDoc(doc, { pageOps: [{ op: 'add', index: 1, page: page('p2') }] });
    expect(stateOf(doc, 'p2').toJSON()).toEqual(SAMPLE_STATE());
    expect(stateOf(doc, 'p2').get('additionalTexts')).not.toBeInstanceOf(Y.Map);
    applyDeckChangesToDoc(doc, { replacePages: [page('p3')] });
    expect(stateOf(doc, 'p3').toJSON()).toEqual(SAMPLE_STATE());
    expect(metaOf(doc).get('schemaVersion') ?? null).toBe(stamp);
  });

  it('never changes the stamp', () => {
    const doc = clientDoc({ stamp, structured: false });
    applyPatchToDoc(doc, PATCH(), null);
    applyDeckChangesToDoc(doc, { pagePatches: [{ pageId: 'p1', patch: PATCH() }] });
    expect(metaOf(doc).has('schemaVersion')).toBe(stamp !== null);
    expect(metaOf(doc).get('schemaVersion') ?? null).toBe(stamp);
  });
});

describe('a lower stamp stays', () => {
  it('leaves a version 2 document at version 2', () => {
    const doc = clientDoc({ stamp: 2, structured: false });
    applyPatchToDoc(doc, { headline: 'x' }, null);
    expect(metaOf(doc).get('schemaVersion')).toBe(2);
  });
});

describe('documents this service creates are stamped', () => {
  const pages = (): PageDef[] => [{ id: 'p1', configId: 'slider', state: SAMPLE_STATE() }];

  it('stamps a deck seed with the version of the schema package', () => {
    const doc = new Y.Doc();
    applyDeckChangesToDoc(doc, { seedPages: pages() });
    expect(metaOf(doc).get('schemaVersion')).toBe(CANVAS_DOCUMENT_VERSION);
    expect(metaOf(doc).get('pagesSeeded')).toBe(true);
    expect(readMergedState(doc).pages[0]?.state).toEqual(SAMPLE_STATE());
  });

  it.each([
    ['replacePages', { replacePages: pages() }],
    ['an add op', { pageOps: [{ op: 'add' as const, index: 0, page: pages()[0]! }] }],
  ])('stamps pages written by %s into a document without pages', (_name, changes) => {
    const doc = new Y.Doc();
    applyDeckChangesToDoc(doc, changes);
    expect(metaOf(doc).get('schemaVersion')).toBe(CANVAS_DOCUMENT_VERSION);
  });

  it('stamps a flat seed into a never-opened document', () => {
    const doc = new Y.Doc();
    applyPatchToDoc(doc, { line2: 'Neu' }, { line1: 'A', line2: 'B' });
    expect(metaOf(doc).get('schemaVersion')).toBe(CANVAS_DOCUMENT_VERSION);
    expect(readMergedState(doc).state).toMatchObject({ line1: 'A', line2: 'Neu' });
  });

  it('ignores a seed into a document that has pages, stamp included', () => {
    const doc = clientDoc({ stamp: 2, structured: false });
    applyDeckChangesToDoc(doc, { seedPages: pages() }); // pages exist: the seed is ignored
    expect(metaOf(doc).get('schemaVersion')).toBe(2);
  });

  it('keeps a stamp somebody else set before the seed', () => {
    const doc = new Y.Doc();
    metaOf(doc).set('schemaVersion', 2);
    applyDeckChangesToDoc(doc, { seedPages: pages() });
    expect(metaOf(doc).get('schemaVersion')).toBe(2);
  });

  it('a seed into an empty document is stamped 4 and written structured', () => {
    const doc = new Y.Doc();
    applyDeckChangesToDoc(doc, { seedPages: pages() });
    expect(metaOf(doc).get('schemaVersion')).toBe(4);
    expect(stateOf(doc).get('additionalTexts')).toBeInstanceOf(Y.Map);
  });
});

describe('a newer document is refused and left untouched', () => {
  const newer: Array<[string, (doc: Y.Doc) => void]> = [
    [
      'a newer schemaVersion',
      (doc) => metaOf(doc).set('schemaVersion', CANVAS_DOCUMENT_VERSION + 1),
    ],
    ['a malformed schemaVersion (string)', (doc) => metaOf(doc).set('schemaVersion', '4')],
    ['a malformed schemaVersion (0)', (doc) => metaOf(doc).set('schemaVersion', 0)],
    ['a malformed schemaVersion (fraction)', (doc) => metaOf(doc).set('schemaVersion', 3.5)],
    ['a newer host kind version', (doc) => metaOf(doc).set('kindVersion:balkenInstances', 2)],
    ['a malformed kind version', (doc) => metaOf(doc).set('kindVersion:balkenInstances', 'x')],
    ['a newer version of an unknown kind', (doc) => metaOf(doc).set('kindVersion:foo', 2)],
  ];

  it.each(newer)('refuses every write for %s', (_name, makeNewer) => {
    const doc = clientDoc({ stamp: 3, structured: false });
    makeNewer(doc);
    const before = bytesOf(doc);

    const writes: Array<() => void> = [
      () => applyPatchToDoc(doc, PATCH(), { headline: 'x' }),
      () => applyDeckChangesToDoc(doc, { pagePatches: [{ pageId: 'p1', patch: PATCH() }] }),
      () => applyDeckChangesToDoc(doc, { replacePages: [{ id: 'p9', configId: 'c', state: {} }] }),
      () => applyDeckChangesToDoc(doc, { seedPages: [{ id: 'p9', configId: 'c', state: {} }] }),
      () =>
        applyDeckChangesToDoc(doc, {
          pageOps: [{ op: 'add', index: 0, page: { id: 'p9', configId: 'c', state: {} } }],
        }),
      () => applyDeckChangesToDoc(doc, { pageOps: [{ op: 'remove', pageId: 'p1' }] }),
    ];
    for (const write of writes) {
      expect(write).toThrow(CanvasDocumentNewerError);
      expect(bytesOf(doc).equals(before)).toBe(true);
    }
  });

  it('refuses an empty document with a newer stamp as well', () => {
    const doc = new Y.Doc();
    metaOf(doc).set('schemaVersion', CANVAS_DOCUMENT_VERSION + 1);
    expect(() => applyPatchToDoc(doc, { a: 1 }, { b: 2 })).toThrow(CanvasDocumentNewerError);
    expect(doc.getMap('formState').size).toBe(0);
  });

  it('still lets a document at exactly this build version through', () => {
    const doc = clientDoc({ stamp: CANVAS_DOCUMENT_VERSION, structured: false });
    expect(() => applyPatchToDoc(doc, { headline: 'ok' }, null)).not.toThrow();
  });
});

describe('POST /internal/canvas/:id/state', () => {
  let close: (() => Promise<void>) | null = null;

  afterEach(async () => {
    await close?.();
    close = null;
    vi.unstubAllEnvs();
  });

  async function start(doc: Y.Doc): Promise<string> {
    vi.stubEnv('HOCUSPOCUS_INTERNAL_TOKEN', 'secret');
    const app = express();
    registerInternalApi(app, {
      db: async () => [],
      server: {
        hocuspocus: {
          documents: new Map(),
          openDirectConnection: async () => ({
            // As Hocuspocus' DirectConnection does: the callback runs inside one document.transact.
            transact: async (fn: (d: Y.Doc) => void) => doc.transact(() => fn(doc)),
            disconnect: async () => {},
          }),
        },
      } as unknown as Parameters<typeof registerInternalApi>[1]['server'],
      persistence: {} as Parameters<typeof registerInternalApi>[1]['persistence'],
    });
    const server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    close = () => new Promise<void>((resolve) => server.close(() => resolve()));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('no port');
    return `http://127.0.0.1:${address.port}/internal/canvas/doc-1/state`;
  }

  const post = (url: string, body: unknown) =>
    fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-internal-token': 'secret' },
      body: JSON.stringify(body),
    });

  it.each([
    ['a flat patch', { patch: { headline: 'x' }, seedState: { headline: 'y' } }],
    ['deck changes', { seedPages: [{ id: 'p', configId: 'c', state: {} }] }],
  ])('answers 426 with a distinct code for a newer document (%s)', async (_name, body) => {
    const doc = clientDoc({ stamp: CANVAS_DOCUMENT_VERSION + 1, structured: false });
    const before = bytesOf(doc);
    const res = await post(await start(doc), body);
    expect(res.status).toBe(426);
    expect(await res.json()).toMatchObject({
      code: 'CANVAS_DOCUMENT_NEWER',
      found: CANVAS_DOCUMENT_VERSION + 1,
      known: CANVAS_DOCUMENT_VERSION,
    });
    expect(bytesOf(doc).equals(before)).toBe(true);
  });

  it('answers 400 with a distinct code for a value the codec refuses, and writes nothing', async () => {
    const doc = clientDoc({ stamp: 4, structured: true });
    applyDeckChangesToDoc(doc, {
      pageOps: [{ op: 'add', index: 1, page: { id: 'p2', configId: 'slider', state: {} } }],
    });
    const before = bytesOf(doc);
    // Page p1 is fine, p2 is not: the first write must not survive.
    const res = await post(await start(doc), {
      pagePatches: [
        { pageId: 'p1', patch: { headline: 'zuerst' } },
        { pageId: 'p2', patch: { iconStates: JSON.parse('{"i":{"__proto__":1}}') } },
      ],
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: 'CANVAS_STATE_UNWRITABLE' });
    expect(bytesOf(doc).equals(before)).toBe(true);
  });

  it('writes and answers 200 for a document it may write', async () => {
    const doc = clientDoc({ stamp: 3, structured: false });
    const res = await post(await start(doc), { patch: { headline: 'ok' } });
    expect(res.status).toBe(200);
    expect(stateOf(doc).get('headline')).toBe('ok');
  });
});

describe('yjs is one copy for the service and the codec', () => {
  const require = createRequire(import.meta.url);
  const packageDir = (resolver: NodeJS.Require): string =>
    dirname(realpathSync(resolver.resolve('yjs/package.json')));

  it('resolves yjs to the same package from this service and from @ggraphic/core', () => {
    const coreEntry = require.resolve('@ggraphic/core/ydoc');
    const fromCore = createRequire(realpathSync(coreEntry));
    expect(packageDir(fromCore)).toBe(packageDir(require));
  });

  it('reads and writes a Y.Map this service created (instanceof holds across the codec)', () => {
    const doc = clientDoc({ stamp: 4, structured: true });
    const state = stateOf(doc);
    expect(state).toBeInstanceOf(Y.Map);
    expect((readState(state).additionalTexts as unknown[]).length).toBe(2);
    expect(() =>
      writeStateKeys(
        state,
        { additionalTexts: [{ id: 't1', text: 'x' }] },
        { classes: CANVAS_KEY_CLASSES, lift: true }
      )
    ).not.toThrow();
    expect(state.get('additionalTexts')).toBeInstanceOf(Y.Map);
    expect((readState(state).additionalTexts as unknown[]).length).toBe(1);
  });
});
