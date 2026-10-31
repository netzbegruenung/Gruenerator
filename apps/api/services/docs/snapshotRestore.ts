import * as Y from 'yjs';

import { hocuspocusInternal } from '../collab/hocuspocusInternal.js';

/** The XmlFragment BlockNote binds to in every docs Y.Doc. */
export const DOC_FRAGMENT = 'document-store';

/**
 * Turn `live` into `version` as a forward edit. Returns the resulting doc
 * (its full state is what to snapshot) and the update to send to the live doc.
 *
 * Applying an old state to a newer doc reverts nothing (Yjs merges, the old
 * state is a subset of the new one). So the restore deletes the live
 * fragment's children and inserts deep clones of the version's, in one
 * transaction on a copy of the live doc. Clones carry every attribute and text
 * format, block ids and comment marks included, so the result is the version
 * node for node. Everything outside the fragment (comment threads) is left
 * alone.
 */
export function buildRestore(
  live: Uint8Array,
  version: Uint8Array
): { doc: Y.Doc; update: Uint8Array } {
  const versionDoc = new Y.Doc();
  Y.applyUpdate(versionDoc, version);
  const source = versionDoc.getXmlFragment(DOC_FRAGMENT);

  const doc = new Y.Doc();
  Y.applyUpdate(doc, live);
  const target = doc.getXmlFragment(DOC_FRAGMENT);
  const before = Y.encodeStateVector(doc);
  doc.transact(() => {
    target.delete(0, target.length);
    // Boundary cast: insert() is typed without YXmlHook, which toArray() can
    // return. BlockNote never writes hooks, and insert accepts any Y type.
    target.insert(
      0,
      source.toArray().map((node) => node.clone() as Y.XmlElement | Y.XmlText)
    );
  });
  versionDoc.destroy();
  return { doc, update: Y.encodeStateAsUpdate(doc, before) };
}

/** Full state of the document as Hocuspocus holds it right now (falls back to Postgres there). */
export async function readLiveState(documentId: string): Promise<Uint8Array> {
  const body = (await hocuspocusInternal(
    'GET',
    `/internal/doc/${encodeURIComponent(documentId)}/yjs`
  )) as {
    update?: unknown;
  };
  if (typeof body.update !== 'string') throw new Error('internal yjs read returned no update');
  return new Uint8Array(Buffer.from(body.update, 'base64'));
}

/** Apply `update` to the live document; Hocuspocus broadcasts it to every client. */
export async function applyToLive(documentId: string, update: Uint8Array): Promise<void> {
  await hocuspocusInternal('POST', `/internal/doc/${encodeURIComponent(documentId)}/yjs`, {
    update: Buffer.from(update).toString('base64'),
    kind: 'blocknote',
  });
}
