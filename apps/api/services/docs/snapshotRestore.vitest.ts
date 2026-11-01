import * as Y from 'yjs';
import { describe, expect, it } from 'vitest';

import { buildRestore, DOC_FRAGMENT } from './snapshotRestore.js';

function block(id: string, text: string, format?: Record<string, unknown>) {
  const container = new Y.XmlElement('blockContainer');
  container.setAttribute('id', id);
  const paragraph = new Y.XmlElement('paragraph');
  const xmlText = new Y.XmlText();
  paragraph.insert(0, [xmlText]);
  container.insert(0, [paragraph]);
  // Text can only be added once the types are integrated; see setBlocks.
  return { container, xmlText, text, format };
}

function setBlocks(doc: Y.Doc, blocks: ReturnType<typeof block>[]) {
  const fragment = doc.getXmlFragment(DOC_FRAGMENT);
  doc.transact(() => {
    fragment.delete(0, fragment.length);
    const group = new Y.XmlElement('blockGroup');
    fragment.insert(0, [group]);
    group.insert(
      0,
      blocks.map((b) => b.container)
    );
    for (const b of blocks) b.xmlText.insert(0, b.text, b.format);
  });
}

const xml = (doc: Y.Doc) => doc.getXmlFragment(DOC_FRAGMENT).toString();

describe('buildRestore', () => {
  it('reverts edits made after the version — which applying the old state alone does not', () => {
    const live = new Y.Doc();
    setBlocks(live, [block('a', 'Version eins')]);
    const version = Y.encodeStateAsUpdate(live);
    const versionXml = xml(live);

    setBlocks(live, [block('a', 'Später geändert'), block('b', 'Neuer Absatz')]);

    // The trap: an old state is a subset of the live one, so merging it is a no-op.
    const naive = new Y.Doc();
    Y.applyUpdate(naive, Y.encodeStateAsUpdate(live));
    Y.applyUpdate(naive, version);
    expect(xml(naive)).not.toBe(versionXml);

    const { doc, update } = buildRestore(Y.encodeStateAsUpdate(live), version);
    expect(xml(doc)).toBe(versionXml);

    Y.applyUpdate(live, update);
    expect(xml(live)).toBe(versionXml);
  });

  it('keeps block ids and text formats (comment marks travel as formats)', () => {
    const live = new Y.Doc();
    setBlocks(live, [block('id-1', 'kommentiert', { comment: { threadId: 't1' }, bold: true })]);
    const version = Y.encodeStateAsUpdate(live);
    setBlocks(live, [block('id-2', 'anders')]);

    const { doc } = buildRestore(Y.encodeStateAsUpdate(live), version);
    const container = doc.getXmlFragment(DOC_FRAGMENT).toArray()[0] as Y.XmlElement;
    const restored = container.toArray()[0] as Y.XmlElement;
    expect(restored.getAttribute('id')).toBe('id-1');
    const text = (restored.toArray()[0] as Y.XmlElement).toArray()[0] as Y.XmlText;
    expect(text.toDelta()).toEqual([
      { insert: 'kommentiert', attributes: { comment: { threadId: 't1' }, bold: true } },
    ]);
  });

  it('leaves everything outside the fragment alone', () => {
    const live = new Y.Doc();
    setBlocks(live, [block('a', 'Version')]);
    const version = Y.encodeStateAsUpdate(live);
    live.getMap('threads').set('t1', 'offener Kommentar');
    setBlocks(live, [block('a', 'Neu')]);

    const { doc } = buildRestore(Y.encodeStateAsUpdate(live), version);
    expect(doc.getMap('threads').get('t1')).toBe('offener Kommentar');
  });

  it('a collaborator who edited meanwhile converges to the restored version', () => {
    const live = new Y.Doc();
    setBlocks(live, [block('a', 'Version')]);
    const version = Y.encodeStateAsUpdate(live);
    setBlocks(live, [block('a', 'Später')]);

    const peer = new Y.Doc();
    Y.applyUpdate(peer, Y.encodeStateAsUpdate(live));

    const { update } = buildRestore(Y.encodeStateAsUpdate(live), version);
    Y.applyUpdate(live, update);
    Y.applyUpdate(peer, update);
    expect(xml(peer)).toBe(xml(live));
  });
});
