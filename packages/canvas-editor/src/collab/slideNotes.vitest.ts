import {
  duplicatePageById,
  readPages,
  replaceDeck,
  seedPagesIfEmpty,
  serializeDeck,
  updatePageStateById,
} from '@ggraphic/editor/collab/pagesDoc';
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

function setup() {
  const doc = new Y.Doc();
  seedPagesIfEmpty(doc, [{ id: 'p1', configId: 'freeform', state: { notes: 'Begrüßung' } }]);
  return doc;
}

describe('speaker notes in page state', () => {
  it('survive getPages (serializeDeck)', () => {
    expect(serializeDeck(setup())[0]!.state.notes).toBe('Begrüßung');
  });

  it('are copied by duplicating a page, and then diverge', () => {
    const doc = setup();
    expect(duplicatePageById(doc, 'p1', 'p2')).toBe(true);
    updatePageStateById(doc, 'p2', { notes: 'Anders' });
    const [a, b] = readPages(doc);
    expect(a!.state.notes).toBe('Begrüßung');
    expect(b!.state.notes).toBe('Anders');
  });

  it('survive replaceDeck when the update carries them', () => {
    const doc = setup();
    replaceDeck(
      doc,
      { updates: [{ pageId: 'p1', state: { notes: 'Neu', x: 1 } }], inserts: [], removes: [] },
      Symbol('t')
    );
    expect(readPages(doc)[0]!.state.notes).toBe('Neu');
  });
});
