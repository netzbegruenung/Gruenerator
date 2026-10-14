import { useEffect } from 'react';

import { useCanvasStore } from '../stores/CanvasStoreProvider';

import { bindCanvasStoreToYMap, seedCanvasStoreFromYMap } from './yjsBinding';

import type * as Y from 'yjs';

interface Options {
  parent: Y.Map<unknown> | null;
  isSynced: boolean;
}

export function useYjsCanvasBinding({ parent, isSynced }: Options): void {
  const store = useCanvasStore();

  useEffect(() => {
    if (!parent?.doc) {
      return undefined;
    }
    // Before the sync the page is a read-only preview of the cached doc.
    if (!isSynced) {
      seedCanvasStoreFromYMap(store, parent);
      return undefined;
    }
    const binding = bindCanvasStoreToYMap({ store, parent });
    return () => {
      binding.destroy();
    };
  }, [store, parent, isSynced]);
}
