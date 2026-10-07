import { useEffect, useMemo, useRef, useState } from 'react';
import { v4 as uuid } from 'uuid';
import * as Y from 'yjs';

import { refreshCarouselChromeInDoc } from '../composer/carouselChrome';

import {
  appendPage,
  duplicatePageById,
  foldLegacyFormStateIntoFirstPage,
  getPagesMap,
  insertPageAt,
  migrateLegacyDoc,
  movePageById,
  readPages,
  removePageById,
  replaceDeck,
  restorePageStateKeys,
  sameStateValue,
  seedPageId,
  seedPagesIfEmpty,
  setPageConfigById,
  updatePageStateById,
  type PageDef,
  type PageView,
  type ReplaceDeckOps,
} from './pagesDoc';
import { YDOC_KEYS } from './ydocKeys';

// Structural page ops (add/remove/duplicate/move/convert) — tracked by the
// page UndoManager.
const LOCAL_ORIGIN = Symbol('canvas-editor-pages-local');
// Per-keystroke template-field dual-writes — deliberately NOT tracked: they
// would flood the page-op undo stack with thousands of discrete entries.
const STATE_ORIGIN = Symbol('canvas-editor-pages-state');
// Seeding + legacy migration — not tracked either: the first Ctrl+Z in a
// fresh editor must not "undo the seed" and blank the document.
const SETUP_ORIGIN = Symbol('canvas-editor-pages-setup');

// Re-applies a replaced deck's page states after its undo/redo — untracked,
// but unlike STATE_ORIGIN not skipped by the mounted canvases.
const RESTORE_ORIGIN = Symbol('canvas-editor-pages-restore');
const DECK_STATES = 'deckStates';

/**
 * What a mounted canvas writes back for a page state it receives: its
 * template's createInitialState, restricted to the keys the canvas emits.
 * Null when the page's template is not loaded (nothing of it is mounted).
 */
export type NormalizeEcho = (
  configId: string,
  state: Record<string, unknown>
) => Record<string, unknown> | null;

type States = Map<string, Record<string, unknown>>;

interface DeckStates {
  before: States;
  after: States;
  /** The canvas echo of each state above — what every client writes back for it. */
  beforeEcho: States;
  afterEcho: States;
}

function snapshotStates(doc: Y.Doc, normalize: NormalizeEcho | null) {
  const states: States = new Map();
  const echoes: States = new Map();
  for (const v of readPages(doc)) {
    const state = JSON.parse(JSON.stringify(v.state)) as Record<string, unknown>;
    states.set(v.id, state);
    const echo = normalize?.(v.configId, state);
    if (echo) echoes.set(v.id, echo);
  }
  return { states, echoes };
}

/**
 * Yjs undo only reverts the items its own transaction wrote. Every mounted
 * canvas — on this client and on each collaborator's — echoes a replaced page
 * right back, and those newer items survive the undo. So a deck replacement
 * keeps the states it changed, and its undo/redo writes them back key by key
 * where the live value still is the opposite snapshot or its canvas echo. Any
 * other value is a real edit, whoever made it and whenever: it is kept.
 */
function restoreDeckStates(
  doc: Y.Doc,
  manager: Y.UndoManager,
  event: { stackItem: { meta: Map<unknown, unknown> }; type: 'undo' | 'redo' }
): void {
  const states = event.stackItem.meta.get(DECK_STATES) as DeckStates | undefined;
  if (!states) return;
  // The opposite stack's new item carries them on, for redo after undo and back.
  const mirror = event.type === 'undo' ? manager.redoStack : manager.undoStack;
  mirror[mirror.length - 1]?.meta.set(DECK_STATES, states);
  const [target, other, otherEcho] =
    event.type === 'undo'
      ? [states.before, states.after, states.afterEcho]
      : [states.after, states.before, states.beforeEcho];
  const live = new Set(readPages(doc).map((v) => v.id));
  doc.transact(() => {
    for (const [id, state] of target) {
      if (!live.has(id)) continue;
      const expected = other.get(id) ?? {};
      const echo = otherEcho.get(id);
      const keys = new Set([...Object.keys(state), ...Object.keys(expected)]);
      restorePageStateKeys(
        doc,
        id,
        state,
        keys,
        (key, value) =>
          sameStateValue(value, expected[key]) ||
          (echo !== undefined && Object.hasOwn(echo, key) && sameStateValue(value, echo[key]))
      );
    }
  }, RESTORE_ORIGIN);
}

/**
 * Origin of this client's own page-state dual-writes. Exported so
 * useYjsPageStateSync can skip them — without the filter every local
 * keystroke (dual-written into the page state map by CanvasEditor) would
 * round-trip back into component state and rebuild it mid-typing.
 * Structural ops (LOCAL_ORIGIN) are NOT skipped: the carousel chrome they
 * rewrite (`refreshCarouselChromeInDoc`) must reach the mounted canvases.
 */
export const PAGES_STATE_ORIGIN: unknown = STATE_ORIGIN;

export type YjsPageView = PageView;

export interface SeedPageDef extends Omit<PageDef, 'id'> {
  /**
   * Stable page id. Provide it when the caller's world already references
   * pages by id (chat deck patches address `initial_state.pages[i].id`);
   * omitted ids fall back to deterministic `seed-<index>` so racing seeds
   * still converge.
   */
  id?: string;
}

export interface YjsPagesApi {
  pages: PageView[];
  isSeeded: boolean;
  /** Seed a fresh page list. No-op if pages already populated or watermarked. */
  seedIfEmpty: (defs: SeedPageDef[]) => void;
  addPage: (def: PageDef) => void;
  insertPage: (index: number, def: PageDef) => void;
  /** Deep-clone a page (state + config) right after the source; returns the new id. */
  duplicatePage: (sourceId: string) => string | null;
  removePage: (id: string) => void;
  movePage: (id: string, direction: 'up' | 'down') => void;
  /** Patch fields on a page's `state` Y.Map. */
  updatePageState: (id: string, partial: Record<string, unknown>) => void;
  /** Convert a page to another template in place (keeps id, pos). */
  setPageConfig: (id: string, configId: string, newState: Record<string, unknown>) => void;
  /** Apply updates/inserts/removes as ONE undo step; updated pages get their whole state replaced. Returns inserted page ids. */
  replaceDeck: (ops: ReplaceDeckOps) => string[];
  /** Undo the last LOCAL page operation (add/remove/duplicate/move). */
  undoPageOp: () => void;
  /** Redo the most recently undone page operation. */
  redoPageOp: () => void;
  canUndoPageOp: boolean;
  canRedoPageOp: boolean;
}

const shallowEqualState = (a: Record<string, unknown>, b: Record<string, unknown>): boolean => {
  const keysA = Object.keys(a);
  if (keysA.length !== Object.keys(b).length) return false;
  for (const k of keysA) {
    if (a[k] !== b[k]) return false;
  }
  return true;
};

/**
 * Mirror a Y.Doc's `pagesById` map into React state and expose mutation
 * helpers that wrap each change in a `ydoc.transact` so it propagates to
 * remote peers. Migrates legacy docs (pages Y.Array, legacy_root) once.
 */
export function useYjsPages(
  ydoc: Y.Doc | null,
  isSynced: boolean,
  normalizeEcho: NormalizeEcho | null = null
): YjsPagesApi | null {
  const [version, setVersion] = useState(0);
  const [historyVersion, setHistoryVersion] = useState(0);
  // Keyed by doc, not by hook instance — collab providers can hand us a NEW
  // Y.Doc mid-session (reconnect), and skipping migration on the replacement
  // doc would let the default seed shadow a legacy deck.
  const migratedDocsRef = useRef(new WeakSet<Y.Doc>());
  const undoManagerRef = useRef<Y.UndoManager | null>(null);
  // Identity cache: untouched pages keep their PageView (and state object)
  // identity across version bumps, so memo'd PageWrappers don't re-render
  // whenever ANY page changes.
  const viewsRef = useRef<PageView[]>([]);

  useEffect(() => {
    if (!ydoc || !isSynced) return undefined;
    const pagesMap = getPagesMap(ydoc);

    if (!migratedDocsRef.current.has(ydoc)) {
      migratedDocsRef.current.add(ydoc);
      ydoc.transact(() => {
        migrateLegacyDoc(ydoc);
        foldLegacyFormStateIntoFirstPage(ydoc);
      }, SETUP_ORIGIN);
    }

    // Re-derive on every change — local AND remote. The writer hooks below
    // mutate the Y.Doc only; they don't keep a separate React mirror, so
    // skipping local-origin events would leave React showing stale data.
    const onChange = () => {
      setVersion((v) => v + 1);
    };
    pagesMap.observeDeep(onChange);

    // Undo manager scoped to LOCAL_ORIGIN — only structural page ops are
    // tracked (state dual-writes use STATE_ORIGIN, seeds SETUP_ORIGIN, layer
    // edits in yjsBinding.ts their own symbol). captureTimeout=0 ensures
    // each page op is a discrete undo step.
    const undoManager = new Y.UndoManager([pagesMap, ydoc.getMap(YDOC_KEYS.deckReplaceMark)], {
      trackedOrigins: new Set([LOCAL_ORIGIN]),
      captureTimeout: 0,
    });
    undoManagerRef.current = undoManager;
    const onUndoChange = () => setHistoryVersion((v) => v + 1);
    const onPopped = (event: Parameters<typeof restoreDeckStates>[2]) =>
      restoreDeckStates(ydoc, undoManager, event);
    undoManager.on('stack-item-added', onUndoChange);
    undoManager.on('stack-item-popped', onPopped);
    undoManager.on('stack-item-popped', onUndoChange);
    undoManager.on('stack-cleared', onUndoChange);

    setVersion((v) => v + 1);
    return () => {
      pagesMap.unobserveDeep(onChange);
      undoManager.off('stack-item-added', onUndoChange);
      undoManager.off('stack-item-popped', onPopped);
      undoManager.off('stack-item-popped', onUndoChange);
      undoManager.off('stack-cleared', onUndoChange);
      undoManager.destroy();
      undoManagerRef.current = null;
    };
  }, [ydoc, isSynced]);

  return useMemo<YjsPagesApi | null>(() => {
    if (!ydoc || !isSynced) return null;

    const fresh = readPages(ydoc);
    const prev = viewsRef.current;
    const prevById = new Map(prev.map((v) => [v.id, v]));
    let unchanged = fresh.length === prev.length;
    const stable = fresh.map((view, i) => {
      const cached = prevById.get(view.id);
      if (
        cached &&
        cached.yMap === view.yMap &&
        cached.configId === view.configId &&
        cached.pos === view.pos &&
        shallowEqualState(cached.state, view.state)
      ) {
        if (prev[i] !== cached) unchanged = false;
        return cached;
      }
      unchanged = false;
      return view;
    });
    const pages = unchanged ? prev : stable;
    viewsRef.current = pages;

    const seedIfEmpty: YjsPagesApi['seedIfEmpty'] = (defs) => {
      ydoc.transact(() => {
        const seeded = seedPagesIfEmpty(
          ydoc,
          defs.map((def, index) => ({ ...def, id: def.id ?? seedPageId(index) }))
        );
        // Fold NOW, in the same transaction — deferring to a later open
        // would overwrite page edits made in between (see pagesDoc).
        if (seeded) foldLegacyFormStateIntoFirstPage(ydoc);
      }, SETUP_ORIGIN);
    };

    const addPage: YjsPagesApi['addPage'] = (def) => {
      ydoc.transact(() => {
        appendPage(ydoc, def);
        refreshCarouselChromeInDoc(ydoc);
      }, LOCAL_ORIGIN);
    };

    const insertPage: YjsPagesApi['insertPage'] = (index, def) => {
      ydoc.transact(() => {
        insertPageAt(ydoc, index, def);
        refreshCarouselChromeInDoc(ydoc);
      }, LOCAL_ORIGIN);
    };

    const duplicatePage: YjsPagesApi['duplicatePage'] = (sourceId) => {
      const newId = uuid();
      let ok = false;
      ydoc.transact(() => {
        ok = duplicatePageById(ydoc, sourceId, newId);
        refreshCarouselChromeInDoc(ydoc);
      }, LOCAL_ORIGIN);
      return ok ? newId : null;
    };

    const removePage: YjsPagesApi['removePage'] = (id) => {
      ydoc.transact(() => {
        removePageById(ydoc, id);
        refreshCarouselChromeInDoc(ydoc);
      }, LOCAL_ORIGIN);
    };

    const movePage: YjsPagesApi['movePage'] = (id, direction) => {
      ydoc.transact(() => {
        movePageById(ydoc, id, direction);
        refreshCarouselChromeInDoc(ydoc);
      }, LOCAL_ORIGIN);
    };

    const updatePageState: YjsPagesApi['updatePageState'] = (id, partial) => {
      ydoc.transact(() => {
        updatePageStateById(ydoc, id, partial);
      }, STATE_ORIGIN);
    };

    const setPageConfig: YjsPagesApi['setPageConfig'] = (id, configId, newState) => {
      ydoc.transact(() => {
        setPageConfigById(ydoc, id, configId, newState);
      }, LOCAL_ORIGIN);
    };

    const replaceDeckOp: YjsPagesApi['replaceDeck'] = (ops) => {
      let ids: string[] = [];
      const before = snapshotStates(ydoc, normalizeEcho);
      const manager = undoManagerRef.current;
      const depth = manager?.undoStack.length ?? 0;
      ydoc.transact(() => {
        ids = replaceDeck(ydoc, ops, LOCAL_ORIGIN);
        refreshCarouselChromeInDoc(ydoc);
        // Yjs undo pops nothing when every item it would revert was overwritten
        // since (the canvas echo does exactly that), and silently undoes the
        // next older step instead. A key only this client writes always reverts.
        const mark = ydoc.getMap<number>(YDOC_KEYS.deckReplaceMark);
        const key = String(ydoc.clientID);
        mark.set(key, (mark.get(key) ?? 0) + 1);
      }, LOCAL_ORIGIN);
      const after = snapshotStates(ydoc, normalizeEcho);
      const changed = (id: string) =>
        JSON.stringify(before.states.get(id)) !== JSON.stringify(after.states.get(id));
      const keep = (states: States) => new Map([...states].filter(([id]) => changed(id)));
      if (manager && manager.undoStack.length > depth) {
        const states: DeckStates = {
          before: keep(before.states),
          after: keep(after.states),
          beforeEcho: keep(before.echoes),
          afterEcho: keep(after.echoes),
        };
        manager.undoStack[manager.undoStack.length - 1]!.meta.set(DECK_STATES, states);
      }
      return ids;
    };

    const undoManager = undoManagerRef.current;
    return {
      pages,
      isSeeded: pages.length > 0,
      seedIfEmpty,
      addPage,
      insertPage,
      duplicatePage,
      removePage,
      movePage,
      updatePageState,
      setPageConfig,
      replaceDeck: replaceDeckOp,
      undoPageOp: () => undoManager?.undo(),
      redoPageOp: () => undoManager?.redo(),
      canUndoPageOp: (undoManager?.undoStack.length ?? 0) > 0,
      canRedoPageOp: (undoManager?.redoStack.length ?? 0) > 0,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- version/historyVersion invalidate the derived view
  }, [ydoc, isSynced, version, historyVersion, normalizeEcho]);
}
