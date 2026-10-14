import type * as Y from 'yjs';

interface StoredElement {
  el?: { isDeleted?: boolean } & Record<string, unknown>;
  pos?: string;
}

/**
 * Serializes a whiteboard's Yjs doc to an `.excalidraw` file, so the drawing
 * survives the removal of the Excalidraw editor. Layout as written by
 * y-excalidraw: `elements` holds `{ el, pos }` ordered by the fractional
 * `pos`, `assets` maps file ids to embedded images.
 */
export function whiteboardToExcalidrawFile(ydoc: Y.Doc): { json: string; elementCount: number } {
  const stored = ydoc.getArray('elements').toJSON() as StoredElement[];
  const elements = stored
    .filter((item) => item.el && !item.el.isDeleted)
    .sort((a, b) => ((a.pos ?? '') < (b.pos ?? '') ? -1 : (a.pos ?? '') > (b.pos ?? '') ? 1 : 0))
    .map((item) => item.el);
  const file = {
    type: 'excalidraw',
    version: 2,
    source: 'https://gruenerator.eu',
    elements,
    appState: {},
    files: ydoc.getMap('assets').toJSON(),
  };
  return { json: JSON.stringify(file), elementCount: elements.length };
}
