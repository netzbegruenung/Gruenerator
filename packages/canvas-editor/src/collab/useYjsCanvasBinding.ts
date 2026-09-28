import { useEffect } from 'react';

import { useCanvasStore } from '../stores/CanvasStoreProvider';

import { bindCanvasStoreToYMap } from './yjsBinding';

import type * as Y from 'yjs';

interface Options {
  parent: Y.Map<unknown> | null;
  isSynced: boolean;
}

export function useYjsCanvasBinding({ parent, isSynced }: Options): void {
  const store = useCanvasStore();

  useEffect(() => {
    if (!parent || !isSynced) {
      return undefined;
    }
    if (!parent.doc) {
      return undefined;
    }
    const binding = bindCanvasStoreToYMap({ store, parent });
    return () => {
      binding.destroy();
    };
  }, [store, parent, isSynced]);
}
