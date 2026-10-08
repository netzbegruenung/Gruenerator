import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import { countCanvasPages } from './canvasPageCount.js';

function addPage(doc: Y.Doc, id: string, pos: string): void {
  const page = new Y.Map<unknown>();
  page.set('id', id);
  page.set('configId', 'dreizeilen');
  page.set('pos', pos);
  page.set('state', new Y.Map<unknown>());
  doc.getMap<Y.Map<unknown>>('pagesById').set(id, page);
}

describe('countCanvasPages', () => {
  it('counts the pages in pagesById', () => {
    const doc = new Y.Doc();
    addPage(doc, 'a', 'V');
    addPage(doc, 'b', 'k');
    addPage(doc, 'c', 'r');
    expect(countCanvasPages(doc)).toBe(3);
  });

  it('ignores malformed page entries the editor would not render', () => {
    const doc = new Y.Doc();
    addPage(doc, 'a', 'V');
    doc.getMap<Y.Map<unknown>>('pagesById').set('broken', new Y.Map<unknown>());
    expect(countCanvasPages(doc)).toBe(1);
  });

  it('counts the legacy pages array when pagesById is empty', () => {
    const doc = new Y.Doc();
    doc.getArray<Y.Map<unknown>>('pages').push([new Y.Map(), new Y.Map()]);
    expect(countCanvasPages(doc)).toBe(2);
  });

  it('counts a legacy single-page canvas (formState only) as 1', () => {
    const doc = new Y.Doc();
    doc.getMap<unknown>('formState').set('line1', 'Hallo');
    expect(countCanvasPages(doc)).toBe(1);
  });

  it('returns null for a doc that is not a canvas', () => {
    expect(countCanvasPages(new Y.Doc())).toBeNull();
    const prose = new Y.Doc();
    prose.getXmlFragment('document-store').insert(0, [new Y.XmlElement('paragraph')]);
    expect(countCanvasPages(prose)).toBeNull();
  });
});
