import type { CanvasEditorConfig, Layer } from '@gruenerator/shared/canvas-editor';
import * as Y from 'yjs';

import type { CanvasEditorStoreApi } from '../stores/createCanvasEditorStore';

import { YDOC_KEYS } from './ydocKeys';

const LOCAL_ORIGIN = Symbol('canvas-editor-local');

interface BindOptions {
  store: CanvasEditorStoreApi;
  /**
   * Parent Y.Map under which `layers` (Y.Array<Y.Map>) and `config` (Y.Map)
   * live. For single-page topology this is just `ydoc.getMap('root')`; for
   * multi-page it is one of `pages[i]`.
   */
  parent: Y.Map<unknown>;
}

export interface CanvasBinding {
  destroy: () => void;
}

const layerToYMap = (layer: Layer): Y.Map<unknown> => {
  const map = new Y.Map<unknown>();
  for (const [k, v] of Object.entries(layer)) {
    map.set(k, v);
  }
  return map;
};

const yMapToLayer = (map: Y.Map<unknown>): Layer => map.toJSON() as Layer;

const ensureLayers = (parent: Y.Map<unknown>): Y.Array<Y.Map<unknown>> => {
  const existing = parent.get(YDOC_KEYS.layers);
  if (existing instanceof Y.Array) return existing as Y.Array<Y.Map<unknown>>;
  const arr = new Y.Array<Y.Map<unknown>>();
  parent.set(YDOC_KEYS.layers, arr);
  return arr;
};

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
  console.log('[CanvasCollab][bindCanvasStoreToYMap] binding canvas store to Y.Map', {
    parentSize: parent.size,
    parentHasLayers: parent.has(YDOC_KEYS.layers),
    parentHasConfig: parent.has(YDOC_KEYS.config),
  });

  // Ensure structural Y types exist before observers attach.
  ydoc.transact(() => {
    ensureLayers(parent);
    ensureConfig(parent);
  }, LOCAL_ORIGIN);

  const yLayers = parent.get(YDOC_KEYS.layers) as Y.Array<Y.Map<unknown>>;
  const yConfig = parent.get(YDOC_KEYS.config) as Y.Map<unknown>;

  let applyingRemote = false;

  const seedFromYDoc = () => {
    applyingRemote = true;
    try {
      const layers = yLayers.toArray().map(yMapToLayer);
      store.getState().setLayers(layers);
      const cfg = Object.fromEntries(yConfig.entries());
      if (Object.keys(cfg).length > 0) {
        store.getState().setConfig(cfg as Partial<CanvasEditorConfig>);
      }
    } finally {
      applyingRemote = false;
    }
  };

  // observeDeep alone catches both shallow array splices and nested Y.Map
  // edits — adding a separate yLayers.observe would double-fire on splices.
  const yLayersDeepObserver = (events: Y.YEvent<Y.AbstractType<unknown>>[]) => {
    const fromLocal = events.every((e) => e.transaction.origin === LOCAL_ORIGIN);
    if (fromLocal) return;
    applyingRemote = true;
    try {
      const layers = yLayers.toArray().map(yMapToLayer);
      store.getState().setLayers(layers);
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

  yLayers.observeDeep(yLayersDeepObserver);
  yConfig.observe(yConfigObserver);

  const reconcileLayers = (next: Layer[]) => {
    console.log('[CanvasCollab][reconcileLayers] writing layers to Y', {
      count: next.length,
      ids: next.map((l) => l.id),
    });
    ydoc.transact(() => {
      const presentIds = new Set(next.map((l) => l.id));
      const yIdToIndex = new Map<string, number>();
      yLayers.forEach((m, idx) => {
        const id = m.get('id') as string | undefined;
        if (id !== undefined) yIdToIndex.set(id, idx);
      });

      for (let i = yLayers.length - 1; i >= 0; i--) {
        const id = yLayers.get(i).get('id') as string | undefined;
        if (id === undefined || !presentIds.has(id)) {
          yLayers.delete(i, 1);
        }
      }

      yIdToIndex.clear();
      yLayers.forEach((m, idx) => {
        const id = m.get('id') as string | undefined;
        if (id !== undefined) yIdToIndex.set(id, idx);
      });

      for (let i = 0; i < next.length; i++) {
        const layer = next[i];
        const existingIdx = yIdToIndex.get(layer.id);
        if (existingIdx === undefined) {
          yLayers.insert(i, [layerToYMap(layer)]);
          yIdToIndex.set(layer.id, i);
          continue;
        }
        const yMap = yLayers.get(existingIdx);
        for (const [k, v] of Object.entries(layer)) {
          if (yMap.get(k) !== v) yMap.set(k, v);
        }
      }
    }, LOCAL_ORIGIN);
  };

  const reconcileConfig = (cfg: Record<string, unknown>) => {
    console.log('[CanvasCollab][reconcileConfig] writing config to Y', {
      keys: Object.keys(cfg),
    });
    ydoc.transact(() => {
      for (const [k, v] of Object.entries(cfg)) {
        if (yConfig.get(k) !== v) yConfig.set(k, v);
      }
      for (const k of Array.from(yConfig.keys())) {
        if (!(k in cfg)) yConfig.delete(k);
      }
    }, LOCAL_ORIGIN);
  };

  let prevLayers = store.getState().layers;
  let prevConfig = store.getState().config;

  const unsub = store.subscribe((state) => {
    if (applyingRemote) {
      prevLayers = state.layers;
      prevConfig = state.config;
      return;
    }
    if (state.layers !== prevLayers) {
      prevLayers = state.layers;
      reconcileLayers(state.layers);
    }
    if (state.config !== prevConfig) {
      prevConfig = state.config;
      reconcileConfig(state.config as unknown as Record<string, unknown>);
    }
  });

  if (yLayers.length > 0 || yConfig.size > 0) {
    seedFromYDoc();
  } else {
    reconcileLayers(store.getState().layers);
    reconcileConfig(store.getState().config as unknown as Record<string, unknown>);
  }

  return {
    destroy: () => {
      unsub();
      yLayers.unobserveDeep(yLayersDeepObserver);
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
