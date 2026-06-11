import { useEffect, useRef } from 'react';
import * as Y from 'yjs';

import { YDOC_KEYS } from './ydocKeys';

/**
 * Push remote changes of a page's `state` Y.Map into the mounted canvas.
 *
 * GenericCanvas holds template-field state as local React state seeded once
 * from `page.state` — without this observer a server-side edit (chat sharepic
 * editing applies patches via the Hocuspocus internal API into formState AND
 * pages[i].state) would not appear in an open studio tab until reload.
 *
 * The studio itself never writes `page.state` for a mounted page (text edits
 * flow through callbacks → root formState), so every observed change here is
 * external and safe to merge.
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
