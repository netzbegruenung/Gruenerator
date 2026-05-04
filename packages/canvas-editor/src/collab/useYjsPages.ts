import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Y from 'yjs';

import { YDOC_KEYS } from './ydocKeys';

const LOCAL_ORIGIN = Symbol('canvas-editor-pages-local');
const LEGACY_PROMOTE_ORIGIN = Symbol('canvas-editor-pages-legacy-promote');

export interface YjsPageView {
  id: string;
  configId: string;
  state: Record<string, unknown>;
  /** Reference to the page's Y.Map — used by GenericCanvas for layers/config binding. */
  yMap: Y.Map<unknown>;
}

export interface YjsPagesApi {
  pages: YjsPageView[];
  isSeeded: boolean;
  pagesYArray: Y.Array<Y.Map<unknown>>;
  /** Seed a fresh page list. No-op if pages already populated. */
  seedIfEmpty: (
    defs: Array<{ id: string; configId: string; state: Record<string, unknown> }>
  ) => void;
  addPage: (def: { id: string; configId: string; state: Record<string, unknown> }) => void;
  insertPage: (
    index: number,
    def: { id: string; configId: string; state: Record<string, unknown> }
  ) => void;
  removePage: (id: string) => void;
  movePage: (id: string, direction: 'up' | 'down') => void;
  /** Patch primitive fields on a page's `state` Y.Map. */
  updatePageState: (id: string, partial: Record<string, unknown>) => void;
  /** Undo the last LOCAL page-array operation (add/remove/duplicate/move). */
  undoPageOp: () => void;
  /** Redo the most recently undone page-array operation. */
  redoPageOp: () => void;
  canUndoPageOp: boolean;
  canRedoPageOp: boolean;
}

const buildPageYMap = (def: {
  id: string;
  configId: string;
  state: Record<string, unknown>;
}): Y.Map<unknown> => {
  const page = new Y.Map<unknown>();
  page.set(YDOC_KEYS.id, def.id);
  page.set(YDOC_KEYS.configId, def.configId);
  const state = new Y.Map<unknown>();
  for (const [k, v] of Object.entries(def.state)) state.set(k, v);
  page.set(YDOC_KEYS.state, state);
  // layers & config are created on demand by bindCanvasStoreToYMap when the
  // page first mounts in a GenericCanvas — leaving them out keeps page
  // creation cheap.
  return page;
};

const yPageToView = (yMap: Y.Map<unknown>): YjsPageView | null => {
  const id = yMap.get(YDOC_KEYS.id) as string | undefined;
  const configId = yMap.get(YDOC_KEYS.configId) as string | undefined;
  if (!id || !configId) return null;
  const stateY = yMap.get(YDOC_KEYS.state);
  const state =
    stateY instanceof Y.Map ? Object.fromEntries((stateY as Y.Map<unknown>).entries()) : {};
  return { id, configId, state, yMap };
};

/**
 * One-shot migration: lift legacy single-page state (top-level `layers`/
 * `config`, or `legacy_root` Y.Map) into `pages[0]`. Called at most once
 * per Y.Doc lifetime via the `promotedRef` guard in useYjsPages.
 */
function migrateLegacyDocToPages(ydoc: Y.Doc, pagesArr: Y.Array<Y.Map<unknown>>): void {
  const legacyRoot = ydoc.getMap<unknown>(YDOC_KEYS.legacyRoot);
  const hasLegacyLayersType = ydoc.share.has(YDOC_KEYS.layers);
  const hasLegacyConfigType = ydoc.share.has(YDOC_KEYS.config);
  const legacyLayers = hasLegacyLayersType
    ? (ydoc.getArray<Y.Map<unknown>>(YDOC_KEYS.layers) as Y.Array<Y.Map<unknown>>)
    : null;
  const legacyConfig = hasLegacyConfigType
    ? (ydoc.getMap<unknown>(YDOC_KEYS.config) as Y.Map<unknown>)
    : null;

  const legacyHasContent =
    legacyRoot.size > 0 ||
    (legacyLayers !== null && legacyLayers.length > 0) ||
    (legacyConfig !== null && legacyConfig.size > 0);

  if (pagesArr.length > 0 || !legacyHasContent) return;

  ydoc.transact(() => {
    const promoted = new Y.Map<unknown>();
    promoted.set(YDOC_KEYS.id, `legacy-${Date.now()}`);
    promoted.set(YDOC_KEYS.configId, 'unknown');
    promoted.set(YDOC_KEYS.state, new Y.Map<unknown>());
    const newLayers = new Y.Array<Y.Map<unknown>>();
    if (legacyLayers && legacyLayers.length > 0) {
      const cloned = legacyLayers.toArray().map((m) => {
        const copy = new Y.Map<unknown>();
        for (const [k, v] of m.entries()) copy.set(k, v);
        return copy;
      });
      newLayers.push(cloned);
      legacyLayers.delete(0, legacyLayers.length);
    }
    promoted.set(YDOC_KEYS.layers, newLayers);
    const newConfig = new Y.Map<unknown>();
    if (legacyConfig && legacyConfig.size > 0) {
      for (const [k, v] of legacyConfig.entries()) newConfig.set(k, v);
      for (const k of Array.from(legacyConfig.keys())) legacyConfig.delete(k);
    }
    promoted.set(YDOC_KEYS.config, newConfig);
    pagesArr.push([promoted]);
  }, LEGACY_PROMOTE_ORIGIN);
}

/**
 * Mirror a Y.Doc's `pages` Y.Array into React state and expose mutation
 * helpers that wrap each change in a `ydoc.transact` so it propagates to
 * remote peers. Auto-promotes legacy single-page docs into `pages[0]` once.
 */
export function useYjsPages(ydoc: Y.Doc | null, isSynced: boolean): YjsPagesApi | null {
  const [version, setVersion] = useState(0);
  const [historyVersion, setHistoryVersion] = useState(0);
  const promotedRef = useRef(false);
  const undoManagerRef = useRef<Y.UndoManager | null>(null);

  useEffect(() => {
    if (!ydoc || !isSynced) return undefined;
    const pagesArr = ydoc.getArray<Y.Map<unknown>>(YDOC_KEYS.pages);

    if (!promotedRef.current) {
      promotedRef.current = true;
      migrateLegacyDocToPages(ydoc, pagesArr);
    }

    // Re-derive on every change — local AND remote. The writer hooks below
    // mutate the Y.Doc only; they don't keep a separate React mirror, so
    // skipping local-origin events would leave React showing stale data
    // (new pages don't appear, deleted ones linger) until the next render
    // triggered by something else.
    const onChange = () => {
      setVersion((v) => v + 1);
    };
    pagesArr.observeDeep(onChange);

    // Undo manager scoped to LOCAL_ORIGIN — only the user's own
    // add/insert/remove/move operations are tracked here. Layer edits in
    // `yjsBinding.ts` use a *different* LOCAL_ORIGIN symbol, so they don't
    // pollute this stack. captureTimeout=0 ensures each page op is a
    // discrete undo step (no auto-grouping of rapid clicks).
    const undoManager = new Y.UndoManager(pagesArr, {
      trackedOrigins: new Set([LOCAL_ORIGIN]),
      captureTimeout: 0,
    });
    undoManagerRef.current = undoManager;
    const onUndoChange = () => setHistoryVersion((v) => v + 1);
    undoManager.on('stack-item-added', onUndoChange);
    undoManager.on('stack-item-popped', onUndoChange);
    undoManager.on('stack-cleared', onUndoChange);

    setVersion((v) => v + 1);
    return () => {
      pagesArr.unobserveDeep(onChange);
      undoManager.off('stack-item-added', onUndoChange);
      undoManager.off('stack-item-popped', onUndoChange);
      undoManager.off('stack-cleared', onUndoChange);
      undoManager.destroy();
      undoManagerRef.current = null;
    };
  }, [ydoc, isSynced]);

  return useMemo<YjsPagesApi | null>(() => {
    if (!ydoc || !isSynced) return null;
    const pagesArr = ydoc.getArray<Y.Map<unknown>>(YDOC_KEYS.pages);

    const pages = pagesArr
      .toArray()
      .map(yPageToView)
      .filter((p): p is YjsPageView => p !== null);

    const findIndexById = (id: string): number => {
      for (let i = 0; i < pagesArr.length; i++) {
        const p = pagesArr.get(i);
        if (p.get(YDOC_KEYS.id) === id) return i;
      }
      return -1;
    };

    const addPage: YjsPagesApi['addPage'] = (def) => {
      ydoc.transact(() => {
        pagesArr.push([buildPageYMap(def)]);
      }, LOCAL_ORIGIN);
    };

    const insertPage: YjsPagesApi['insertPage'] = (index, def) => {
      ydoc.transact(() => {
        pagesArr.insert(index, [buildPageYMap(def)]);
      }, LOCAL_ORIGIN);
    };

    const removePage: YjsPagesApi['removePage'] = (id) => {
      ydoc.transact(() => {
        const idx = findIndexById(id);
        if (idx >= 0) pagesArr.delete(idx, 1);
      }, LOCAL_ORIGIN);
    };

    const movePage: YjsPagesApi['movePage'] = (id, direction) => {
      ydoc.transact(() => {
        const idx = findIndexById(id);
        const target = direction === 'up' ? idx - 1 : idx + 1;
        if (idx < 0 || target < 0 || target >= pagesArr.length) return;
        const yPage = pagesArr.get(idx);
        // Yjs has no swap primitive — clone the page Y.Map deeply, then
        // delete + insert at the target.
        const view = yPageToView(yPage);
        if (!view) return;
        const layersArr = yPage.get(YDOC_KEYS.layers);
        const configMap = yPage.get(YDOC_KEYS.config);
        const clonedLayers = new Y.Array<Y.Map<unknown>>();
        if (layersArr instanceof Y.Array) {
          const cloned = (layersArr as Y.Array<Y.Map<unknown>>).toArray().map((m) => {
            const copy = new Y.Map<unknown>();
            for (const [k, v] of m.entries()) copy.set(k, v);
            return copy;
          });
          clonedLayers.push(cloned);
        }
        const clonedConfig = new Y.Map<unknown>();
        if (configMap instanceof Y.Map) {
          for (const [k, v] of (configMap as Y.Map<unknown>).entries()) clonedConfig.set(k, v);
        }
        const replacement = buildPageYMap({
          id: view.id,
          configId: view.configId,
          state: view.state,
        });
        replacement.set(YDOC_KEYS.layers, clonedLayers);
        replacement.set(YDOC_KEYS.config, clonedConfig);
        pagesArr.delete(idx, 1);
        pagesArr.insert(target, [replacement]);
      }, LOCAL_ORIGIN);
    };

    const seedIfEmpty: YjsPagesApi['seedIfEmpty'] = (defs) => {
      if (pagesArr.length > 0) return;
      ydoc.transact(() => {
        pagesArr.push(defs.map(buildPageYMap));
      }, LOCAL_ORIGIN);
    };

    const updatePageState: YjsPagesApi['updatePageState'] = (id, partial) => {
      ydoc.transact(() => {
        const idx = findIndexById(id);
        if (idx < 0) return;
        const page = pagesArr.get(idx);
        const stateY = page.get(YDOC_KEYS.state);
        if (!(stateY instanceof Y.Map)) return;
        for (const [k, v] of Object.entries(partial)) {
          (stateY as Y.Map<unknown>).set(k, v);
        }
      }, LOCAL_ORIGIN);
    };

    const undoManager = undoManagerRef.current;
    const undoPageOp = () => {
      undoManager?.undo();
    };
    const redoPageOp = () => {
      undoManager?.redo();
    };
    const canUndoPageOp = (undoManager?.undoStack.length ?? 0) > 0;
    const canRedoPageOp = (undoManager?.redoStack.length ?? 0) > 0;

    return {
      pages,
      isSeeded: pagesArr.length > 0,
      pagesYArray: pagesArr,
      seedIfEmpty,
      addPage,
      insertPage,
      removePage,
      movePage,
      updatePageState,
      undoPageOp,
      redoPageOp,
      canUndoPageOp,
      canRedoPageOp,
    };
  }, [ydoc, isSynced, version, historyVersion]);
}

/**
 * Subscribe to a single page's `state` Y.Map. Returns a plain object mirror
 * that re-renders on remote changes, plus a setter that wraps writes in a
 * `ydoc.transact`. Used by per-page form rendering inside CanvasEditor.
 */
export function useYjsPageState(pageYMap: Y.Map<unknown> | null): {
  state: Record<string, unknown>;
  updateState: (partial: Record<string, unknown>) => void;
} {
  const [snapshot, setSnapshot] = useState<Record<string, unknown>>(() => {
    if (!pageYMap) return {};
    const stateY = pageYMap.get(YDOC_KEYS.state);
    return stateY instanceof Y.Map ? Object.fromEntries((stateY as Y.Map<unknown>).entries()) : {};
  });

  useEffect(() => {
    if (!pageYMap) return undefined;
    const stateY = pageYMap.get(YDOC_KEYS.state);
    if (!(stateY instanceof Y.Map)) return undefined;
    const yState = stateY as Y.Map<unknown>;
    const apply = () => setSnapshot(Object.fromEntries(yState.entries()));
    yState.observe(apply);
    apply();
    return () => yState.unobserve(apply);
  }, [pageYMap]);

  const updateState = useCallback(
    (partial: Record<string, unknown>) => {
      if (!pageYMap) return;
      const stateY = pageYMap.get(YDOC_KEYS.state);
      const ydoc = pageYMap.doc;
      if (!(stateY instanceof Y.Map) || !ydoc) return;
      ydoc.transact(() => {
        for (const [k, v] of Object.entries(partial)) {
          (stateY as Y.Map<unknown>).set(k, v);
        }
      }, LOCAL_ORIGIN);
    },
    [pageYMap]
  );

  return { state: snapshot, updateState };
}
