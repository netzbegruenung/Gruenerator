import * as Y from 'yjs';

// Y.Doc keys mirrored from packages/canvas-editor/src/collab/ydocKeys.ts —
// this service keeps canvas literals inline (see internalApi.ts).
const KEY_PAGES_BY_ID = 'pagesById';
const KEY_PAGES = 'pages';
const KEY_FORM_STATE = 'formState';

/**
 * Page count of a canvas Y.Doc, or null when the doc is not a canvas.
 * Mirrors the editor: `pagesById` entries with id/configId/pos, else the
 * legacy `pages` array, else a single-page legacy canvas.
 */
export function countCanvasPages(ydoc: Y.Doc): number | null {
  const { share } = ydoc;
  if (!share.has(KEY_PAGES_BY_ID) && !share.has(KEY_PAGES) && !share.has(KEY_FORM_STATE)) {
    return null;
  }

  if (share.has(KEY_PAGES_BY_ID)) {
    let count = 0;
    ydoc.getMap<Y.Map<unknown>>(KEY_PAGES_BY_ID).forEach((page) => {
      if (
        page instanceof Y.Map &&
        typeof page.get('id') === 'string' &&
        typeof page.get('configId') === 'string' &&
        typeof page.get('pos') === 'string'
      ) {
        count++;
      }
    });
    if (count > 0) return count;
  }

  if (share.has(KEY_PAGES)) {
    const legacy = ydoc.getArray<unknown>(KEY_PAGES).length;
    if (legacy > 0) return legacy;
  }

  return 1;
}
