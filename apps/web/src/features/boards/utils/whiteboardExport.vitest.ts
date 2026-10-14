import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import { whiteboardToExcalidrawFile } from './whiteboardExport';

function docWith(items: Array<{ el: Record<string, unknown>; pos: string }>) {
  const ydoc = new Y.Doc();
  ydoc.getArray('elements').push(
    items.map((item) => {
      const m = new Y.Map<unknown>();
      m.set('el', item.el);
      m.set('pos', item.pos);
      return m;
    })
  );
  return ydoc;
}

describe('whiteboardToExcalidrawFile', () => {
  it('writes live elements in pos order plus embedded files', () => {
    const ydoc = docWith([
      { el: { id: 'b', type: 'text', text: 'zwei' }, pos: 'a1' },
      { el: { id: 'gone', type: 'rectangle', isDeleted: true }, pos: 'a0V' },
      { el: { id: 'a', type: 'rectangle' }, pos: 'a0' },
    ]);
    ydoc.getMap('assets').set('img1', { id: 'img1', mimeType: 'image/png', dataURL: 'data:' });

    const { json, elementCount } = whiteboardToExcalidrawFile(ydoc);
    const file = JSON.parse(json) as {
      type: string;
      elements: Array<{ id: string }>;
      files: Record<string, unknown>;
    };

    expect(elementCount).toBe(2);
    expect(file.type).toBe('excalidraw');
    expect(file.elements.map((e) => e.id)).toEqual(['a', 'b']);
    expect(Object.keys(file.files)).toEqual(['img1']);
  });

  it('reports an empty board', () => {
    expect(whiteboardToExcalidrawFile(new Y.Doc()).elementCount).toBe(0);
  });
});
