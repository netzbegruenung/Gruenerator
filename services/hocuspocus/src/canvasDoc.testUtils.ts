/** Helpers for the canvas Y.Doc tests: documents built the way an editor builds them. */
import { buildStateMap, stateKeyClasses } from '@ggraphic/core/ydoc';
import { CANVAS_HOST_COLLECTION_KEYS } from '@gruenerator/contracts/canvas-host-keys';
import * as Y from 'yjs';

export const CLASSES = stateKeyClasses(CANVAS_HOST_COLLECTION_KEYS);

export const SAMPLE_STATE = (): Record<string, unknown> => ({
  headline: 'Hallo',
  additionalTexts: [
    { id: 't1', text: 'Eins', x: 10, y: 20 },
    { id: 't2', text: 'Zwei', x: 30, y: 40 },
  ],
  shapeInstances: [{ id: 's1', kind: 'rect', x: 1 }],
  layerOrder: ['t1', 't2', 's1'],
  lockedLayerIds: ['s1'],
  iconStates: { i1: { color: 'red' } },
  balkenInstances: [
    { id: 'b1', mode: 'single', texts: ['A'], offset: { x: 0, y: 0 } },
    { id: 'b2', mode: 'single', texts: ['B'], offset: { x: 1, y: 1 } },
  ],
});

export interface ClientDocOptions {
  /** `meta.schemaVersion`; null leaves the document unstamped (version 1). */
  stamp: number | null;
  /** Page state in element structures (what a version 4 editor stores). */
  structured: boolean;
  state?: Record<string, unknown>;
}

/** A canvas document with one page `p1`, as a client would have stored it. */
export function clientDoc({ stamp, structured, state }: ClientDocOptions): Y.Doc {
  const doc = new Y.Doc();
  doc.transact(() => {
    if (stamp !== null) doc.getMap('meta').set('schemaVersion', stamp);
    const page = new Y.Map<unknown>();
    page.set('id', 'p1');
    page.set('configId', 'dreizeilen');
    page.set('pos', 'V');
    page.set(
      'state',
      buildStateMap(state ?? SAMPLE_STATE(), { classes: CLASSES, lift: structured })
    );
    doc.getMap<Y.Map<unknown>>('pagesById').set('p1', page);
  });
  return doc;
}

/** A replica of `doc`: the same content, its own client id. */
export function fork(doc: Y.Doc, clientID?: number): Y.Doc {
  const replica = new Y.Doc();
  Y.applyUpdate(replica, Y.encodeStateAsUpdate(doc));
  if (clientID !== undefined) replica.clientID = clientID;
  return replica;
}

/** Deliver everything each replica has to the other. */
export function sync(a: Y.Doc, b: Y.Doc): void {
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)));
  Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)));
}

export const stateOf = (doc: Y.Doc, pageId = 'p1'): Y.Map<unknown> =>
  doc.getMap<Y.Map<unknown>>('pagesById').get(pageId)!.get('state') as Y.Map<unknown>;

export const bytesOf = (doc: Y.Doc): Buffer => Buffer.from(Y.encodeStateAsUpdate(doc));
