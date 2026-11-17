import { YDOC_KEYS } from '@ggraphic/core/ydoc';
import * as Y from 'yjs';

const KEY_PAGES_BY_ID = YDOC_KEYS.pagesById;
const KEY_PAGES = YDOC_KEYS.pages;
const KEY_FORM_STATE = YDOC_KEYS.formState;

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
        typeof page.get(YDOC_KEYS.id) === 'string' &&
        typeof page.get(YDOC_KEYS.configId) === 'string' &&
        typeof page.get(YDOC_KEYS.pos) === 'string'
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
