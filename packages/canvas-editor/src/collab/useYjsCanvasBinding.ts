import { useEffect } from 'react';
import * as Y from 'yjs';

import { useCanvasStore } from '../stores/CanvasStoreProvider';

import { bindCanvasStoreToYMap } from './yjsBinding';

interface Options {
  parent: Y.Map<unknown> | null;
  isSynced: boolean;
}

export function useYjsCanvasBinding({ parent, isSynced }: Options): void {
  const store = useCanvasStore();

  useEffect(() => {
    console.log('[CanvasCollab][useYjsCanvasBinding] effect tick', {
      hasParent: !!parent,
      isSynced,
      parentHasDoc: !!parent?.doc,
    });
    if (!parent || !isSynced) {
      console.log('[CanvasCollab][useYjsCanvasBinding] skip: parent missing or not synced');
      return undefined;
    }
    if (!parent.doc) {
      console.log('[CanvasCollab][useYjsCanvasBinding] skip: parent has no doc');
      return undefined;
    }
    const binding = bindCanvasStoreToYMap({ store, parent });
    return () => {
      console.log('[CanvasCollab][useYjsCanvasBinding] tearing down binding');
      binding.destroy();
    };
  }, [store, parent, isSynced]);
}
