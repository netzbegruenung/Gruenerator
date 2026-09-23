import type { CanvasEditorConfig } from '@gruenerator/shared/canvas-editor';
import * as Y from 'yjs';

import type { CanvasEditorStoreApi } from '../stores/createCanvasEditorStore';

import { YDOC_KEYS } from './ydocKeys';

const LOCAL_ORIGIN = Symbol('canvas-editor-local');

interface BindOptions {
  store: CanvasEditorStoreApi;
  /**
   * Parent Y.Map under which `config` (Y.Map) lives. For single-page topology
   * this is just `ydoc.getMap('root')`; for multi-page it is one of `pages[i]`.
   */
  parent: Y.Map<unknown>;
}

export interface CanvasBinding {
  destroy: () => void;
}

const ensureConfig = (parent: Y.Map<unknown>): Y.Map<unknown> => {
  const existing = parent.get(YDOC_KEYS.config);
  if (existing instanceof Y.Map) return existing as Y.Map<unknown>;
  const map = new Y.Map<unknown>();
  parent.set(YDOC_KEYS.config, map);
  return map;
};

export function bindCanvasStoreToYMap({ store, parent }: BindOptions): CanvasBinding {
  const ydoc = parent.doc;
  if (!ydoc) {
    throw new Error('bindCanvasStoreToYMap: parent Y.Map is not attached to a Y.Doc');
  }
  // Ensure structural Y types exist before observers attach.
  ydoc.transact(() => {
    ensureConfig(parent);
  }, LOCAL_ORIGIN);

  const yConfig = parent.get(YDOC_KEYS.config) as Y.Map<unknown>;

  let applyingRemote = false;

  const seedFromYDoc = () => {
    applyingRemote = true;
    try {
      const cfg = Object.fromEntries(yConfig.entries());
      if (Object.keys(cfg).length > 0) {
        store.getState().setConfig(cfg as Partial<CanvasEditorConfig>);
      }
    } finally {
      applyingRemote = false;
    }
  };

  const yConfigObserver = (event: Y.YMapEvent<unknown>) => {
    if (event.transaction.origin === LOCAL_ORIGIN) return;
    applyingRemote = true;
    try {
      store
        .getState()
        .setConfig(Object.fromEntries(yConfig.entries()) as Partial<CanvasEditorConfig>);
    } finally {
      applyingRemote = false;
    }
  };

  yConfig.observe(yConfigObserver);

  const reconcileConfig = (cfg: Record<string, unknown>) => {
    ydoc.transact(() => {
      for (const [k, v] of Object.entries(cfg)) {
        if (yConfig.get(k) !== v) yConfig.set(k, v);
      }
      for (const k of Array.from(yConfig.keys())) {
        if (!(k in cfg)) yConfig.delete(k);
      }
    }, LOCAL_ORIGIN);
  };

  let prevConfig = store.getState().config;

  const unsub = store.subscribe((state) => {
    if (applyingRemote) {
      prevConfig = state.config;
      return;
    }
    if (state.config !== prevConfig) {
      prevConfig = state.config;
      reconcileConfig(state.config as unknown as Record<string, unknown>);
    }
  });

  if (yConfig.size > 0) {
    seedFromYDoc();
  } else {
    reconcileConfig(store.getState().config as unknown as Record<string, unknown>);
  }

  return {
    destroy: () => {
      unsub();
      yConfig.unobserve(yConfigObserver);
    },
  };
}

/**
 * Backwards-compat: old callers used to bind directly off the Y.Doc root.
 * Now we synthesize a single root Y.Map at `legacy_root` so single-page
 * collab continues to work without refactoring its host. Multi-page hosts
 * should call `bindCanvasStoreToYMap` directly.
 */
export function bindCanvasStoreToYDoc({
  store,
  ydoc,
}: {
  store: CanvasEditorStoreApi;
  ydoc: Y.Doc;
}): CanvasBinding {
  const parent = ydoc.getMap<unknown>(YDOC_KEYS.legacyRoot);
  return bindCanvasStoreToYMap({ store, parent });
}
