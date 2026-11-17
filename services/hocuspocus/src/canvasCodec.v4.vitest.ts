/**
 * The next ggraphic release raises `CANVAS_DOCUMENT_VERSION` to 4 (element-level storage). This
 * file runs the service as that build will: the schema package's constant is mocked to 4.
 * `canvasCodec.vitest.ts` covers the build as it is today (3), including the refusal of a
 * version 4 document.
 */
import { readState, writeStateKeys } from '@ggraphic/core/ydoc';
import { describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';

vi.mock('@ggraphic/schema', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@ggraphic/schema')>()),
  CANVAS_DOCUMENT_VERSION: 4,
}));

import { CANVAS_KEY_CLASSES, CanvasDocumentNewerError } from './canvasCodec.js';
import { SAMPLE_STATE, bytesOf, clientDoc, fork, stateOf, sync } from './canvasDoc.testUtils.js';
import {
  applyDeckChangesToDoc,
  applyPatchToDoc,
  readMergedState,
  type PageDef,
} from './internalApi.js';

const OPTIONS = { classes: CANVAS_KEY_CLASSES, lift: true };
const metaOf = (doc: Y.Doc) => doc.getMap<unknown>('meta');
const texts = (doc: Y.Doc) => readState(stateOf(doc)).additionalTexts;
const balken = (doc: Y.Doc) => readState(stateOf(doc)).balkenInstances;

describe('version 4 document: concurrent edits to different elements both survive', () => {
  const t = SAMPLE_STATE().additionalTexts as Array<Record<string, unknown>>;
  const b = SAMPLE_STATE().balkenInstances as Array<Record<string, unknown>>;

  it('a server patch to one additionalTexts entry and a replica editing another', () => {
    const base = clientDoc({ stamp: 4, structured: true });
    const server = fork(base);
    const client = fork(base);

    applyPatchToDoc(server, { additionalTexts: [{ ...t[0], text: 'Server' }, t[1]] }, null);
    writeStateKeys(
      stateOf(client),
      { additionalTexts: [t[0], { ...t[1], text: 'Client' }] },
      OPTIONS
    );
    sync(server, client);

    const merged = [
      { ...t[0], text: 'Server' },
      { ...t[1], text: 'Client' },
    ];
    expect(texts(server)).toEqual(merged);
    expect(texts(client)).toEqual(merged);
    // Still element structure after the server's write.
    expect(stateOf(server).get('additionalTexts')).toBeInstanceOf(Y.Map);
  });

  it('the same for a host collection key (balkenInstances)', () => {
    const base = clientDoc({ stamp: 4, structured: true });
    const server = fork(base);
    const client = fork(base);

    applyPatchToDoc(server, { balkenInstances: [{ ...b[0], texts: ['A!'] }, b[1]] }, null);
    writeStateKeys(
      stateOf(client),
      { balkenInstances: [b[0], { ...b[1], texts: ['B?'] }] },
      OPTIONS
    );
    sync(server, client);

    const merged = [
      { ...b[0], texts: ['A!'] },
      { ...b[1], texts: ['B?'] },
    ];
    expect(balken(server)).toEqual(merged);
    expect(balken(client)).toEqual(merged);
    expect(stateOf(server).get('balkenInstances')).toBeInstanceOf(Y.Map);
  });

  it('the same through deck page patches', () => {
    const base = clientDoc({ stamp: 4, structured: true });
    const server = fork(base);
    const client = fork(base);

    applyDeckChangesToDoc(server, {
      pagePatches: [{ pageId: 'p1', patch: { additionalTexts: [{ ...t[0], x: 99 }, t[1]] } }],
    });
    writeStateKeys(stateOf(client), { additionalTexts: [t[0], { ...t[1], y: 7 }] }, OPTIONS);
    sync(server, client);

    const merged = [
      { ...t[0], x: 99 },
      { ...t[1], y: 7 },
    ];
    expect(texts(server)).toEqual(merged);
    expect(texts(client)).toEqual(merged);
  });

  it('contrast: in a version 3 document (plain JSON per key) one of the two edits is lost', () => {
    const base = clientDoc({ stamp: 3, structured: false });
    const server = fork(base);
    const client = fork(base);

    applyPatchToDoc(server, { additionalTexts: [{ ...t[0], text: 'Server' }, t[1]] }, null);
    writeStateKeys(
      stateOf(client),
      { additionalTexts: [t[0], { ...t[1], text: 'Client' }] },
      { classes: CANVAS_KEY_CLASSES, lift: false }
    );
    sync(server, client);

    expect(texts(server)).toEqual(texts(client));
    const texts_ = texts(server) as Array<Record<string, unknown>>;
    expect([texts_[0]?.text, texts_[1]?.text]).not.toEqual(['Server', 'Client']);
  });

  it('a patch writes only what changed: an unchanged element sends no update for itself', () => {
    const base = clientDoc({ stamp: 4, structured: true });
    const server = fork(base);
    const before = Y.encodeStateVector(server);
    applyPatchToDoc(server, { additionalTexts: [t[0], t[1]] }, null);
    // The flat formState mirror is written (as before); the page state is not.
    const delta = Y.encodeStateAsUpdate(server, before);
    const probe = fork(base);
    Y.applyUpdate(probe, delta);
    expect(readState(stateOf(probe))).toEqual(SAMPLE_STATE());
    expect(stateOf(server).get('additionalTexts')).toBeInstanceOf(Y.Map);
  });
});

describe('version 4 build writing documents', () => {
  const pages = (): PageDef[] => [{ id: 'p1', configId: 'slider', state: SAMPLE_STATE() }];

  it('a created document is stamped 4 in the creating transaction and written structured', () => {
    const doc = new Y.Doc();
    let stampedWhenPagesArrived: unknown = null;
    doc.getMap('pagesById').observe(() => {
      stampedWhenPagesArrived = metaOf(doc).get('schemaVersion');
    });
    applyDeckChangesToDoc(doc, { seedPages: pages() });

    expect(metaOf(doc).get('schemaVersion')).toBe(4);
    expect(stampedWhenPagesArrived).toBe(4);
    expect(stateOf(doc).get('additionalTexts')).toBeInstanceOf(Y.Map);
    expect(stateOf(doc).get('balkenInstances')).toBeInstanceOf(Y.Map);
    expect(readMergedState(doc).pages[0]?.state).toEqual(SAMPLE_STATE());
  });

  it('a flat seed creates a stamped document', () => {
    const doc = new Y.Doc();
    applyPatchToDoc(doc, { line1: 'x' }, { line1: 'A', line2: 'B' });
    expect(metaOf(doc).get('schemaVersion')).toBe(4);
  });

  it('replacePages and page ops write structure into a version 4 document', () => {
    const doc = clientDoc({ stamp: 4, structured: true });
    applyDeckChangesToDoc(doc, {
      pageOps: [{ op: 'add', index: 1, page: { ...pages()[0]!, id: 'p2' } }],
    });
    expect(stateOf(doc, 'p2').get('additionalTexts')).toBeInstanceOf(Y.Map);
    applyDeckChangesToDoc(doc, { replacePages: [{ ...pages()[0]!, id: 'p3' }] });
    expect(stateOf(doc, 'p3').get('additionalTexts')).toBeInstanceOf(Y.Map);
    expect(readMergedState(doc).pages[0]?.state).toEqual(SAMPLE_STATE());
    expect(metaOf(doc).get('schemaVersion')).toBe(4);
  });

  it('never raises the stamp of an existing document and writes it plain below 4', () => {
    for (const stamp of [null, 2, 3]) {
      const doc = clientDoc({ stamp, structured: false });
      applyPatchToDoc(doc, { additionalTexts: [{ id: 'n', text: 'x' }] }, null);
      applyDeckChangesToDoc(doc, {
        pagePatches: [{ pageId: 'p1', patch: { layerOrder: ['n'] } }],
        pageOps: [{ op: 'add', index: 1, page: { ...pages()[0]!, id: 'p2' } }],
      });
      expect(metaOf(doc).get('schemaVersion') ?? null).toBe(stamp);
      expect(stateOf(doc).get('additionalTexts')).not.toBeInstanceOf(Y.Map);
      expect(stateOf(doc, 'p2').get('additionalTexts')).not.toBeInstanceOf(Y.Map);
    }
  });

  it('refuses a version 5 document and leaves it byte-identical', () => {
    const doc = clientDoc({ stamp: 5, structured: true });
    const before = bytesOf(doc);
    expect(() => applyPatchToDoc(doc, { headline: 'x' }, null)).toThrow(CanvasDocumentNewerError);
    expect(() =>
      applyDeckChangesToDoc(doc, { pagePatches: [{ pageId: 'p1', patch: { headline: 'x' } }] })
    ).toThrow(CanvasDocumentNewerError);
    expect(bytesOf(doc).equals(before)).toBe(true);
  });
});
