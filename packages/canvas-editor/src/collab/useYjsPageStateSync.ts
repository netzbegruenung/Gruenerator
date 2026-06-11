import { useEffect, useRef } from 'react';
import * as Y from 'yjs';

import { PAGES_LOCAL_ORIGIN } from './useYjsPages';
import { YDOC_KEYS } from './ydocKeys';

/**
 * Push external changes of a page's `state` Y.Map into the mounted canvas.
 *
 * GenericCanvas holds template-field state as local React state seeded once
 * from `page.state` — without this observer neither a chat sharepic edit
 * (applied server-side via the Hocuspocus internal API) nor another studio
 * client's edit (dual-written into the page state map by CanvasEditor) would
 * appear in an open studio tab until reload.
 *
 * This client's own dual-writes carry PAGES_LOCAL_ORIGIN and are skipped —
 * the local component state already has those values, and rebuilding it on
 * every keystroke would disrupt inline text editing.
 */
export function useYjsPageStateSync(options: {
  pageYMap: Y.Map<unknown> | null;
  isSynced: boolean;
  onRemoteState: (partial: Record<string, unknown>) => void;
}): void {
  const { pageYMap, isSynced, onRemoteState } = options;
  const onRemoteStateRef = useRef(onRemoteState);
  onRemoteStateRef.current = onRemoteState;

  useEffect(() => {
    if (!pageYMap || !isSynced) return undefined;

    const handler = (events: Y.YEvent<Y.AbstractType<unknown>>[]) => {
      const stateY = pageYMap.get(YDOC_KEYS.state);
      if (!(stateY instanceof Y.Map)) return;
      const partial: Record<string, unknown> = {};
      for (const event of events) {
        if (event.target !== stateY) continue;
        if (event.transaction.origin === PAGES_LOCAL_ORIGIN) continue;
        for (const key of (event as Y.YMapEvent<unknown>).keysChanged) {
          partial[key] = (stateY as Y.Map<unknown>).get(key);
        }
      }
      if (Object.keys(partial).length > 0) onRemoteStateRef.current(partial);
    };

    pageYMap.observeDeep(handler);
    return () => {
      pageYMap.unobserveDeep(handler);
    };
  }, [pageYMap, isSynced]);
}
