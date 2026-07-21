/**
 * Page-document schema + pure helpers. Single source of truth for multi-page
 * canvas structure in BOTH modes (collaborative Hocuspocus doc and the local
 * Y.Doc a non-collab editor owns).
 *
 * Schema:
 *   meta      Y.Map  — `pagesSeeded` watermark, one-shot migration markers
 *   pagesById Y.Map<pageId, page>
 *   page      Y.Map  — { id, configId, pos, state: Y.Map,
 *                        layers: Y.Array<Y.Map>, config: Y.Map }
 *
 * Ordering uses a fractional `pos` key (lexicographic, base-62): moving a page
 * writes ONE key on the existing Y.Map, so the page keeps its CRDT identity —
 * concurrent edits on a moved page survive, and concurrent reorders converge
 * (ties broken by id). The legacy `pages` Y.Array (clone-delete-insert moves)
 * is migrated once per doc via `migrateLegacyDoc`.
 */

import * as Y from 'yjs';

import { YDOC_KEYS } from './ydocKeys';

export interface PageDef {
  id: string;
  configId: string;
  state: Record<string, unknown>;
  /** Optional free-element layers (deck restore) — created on demand otherwise. */
  layers?: Array<Record<string, unknown>>;
  config?: Record<string, unknown>;
}

export interface PageView {
  id: string;
  configId: string;
  pos: string;
  state: Record<string, unknown>;
  /** Reference to the page's Y.Map — used by GenericCanvas for layers/config binding. */
  yMap: Y.Map<unknown>;
}

export interface SerializedPage {
  id: string;
  configId: string;
  state: Record<string, unknown>;
  layers: Array<Record<string, unknown>>;
  config: Record<string, unknown>;
}

// ── fractional ordering ─────────────────────────────────────────────────────

// ASCII-ordered so plain string comparison sorts correctly.
const POS_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

/**
 * A key strictly between `a` and `b` (lexicographic). `null` means unbounded.
 * Generated keys never end in the smallest digit ('0'), which guarantees a
 * midpoint always exists between any two previously generated keys.
 */
export function posBetween(a: string | null, b: string | null): string {
  const lo = a ?? '';
  const hi = b ?? '';
  if (lo !== '' && hi !== '' && lo >= hi) {
    throw new Error(`posBetween: '${lo}' >= '${hi}'`);
  }
  let result = '';
  for (let i = 0; ; i++) {
    const ca = i < lo.length ? POS_ALPHABET.indexOf(lo[i]) : 0;
    const cb = i < hi.length ? POS_ALPHABET.indexOf(hi[i]) : POS_ALPHABET.length;
    if (cb - ca > 1) {
      return result + POS_ALPHABET[ca + Math.ceil((cb - ca) / 2)];
    }
    result += POS_ALPHABET[ca];
  }
}

// ── doc accessors ───────────────────────────────────────────────────────────

export const getPagesMap = (doc: Y.Doc): Y.Map<Y.Map<unknown>> =>
  doc.getMap<Y.Map<unknown>>(YDOC_KEYS.pagesById);

export const getMetaMap = (doc: Y.Doc): Y.Map<unknown> => doc.getMap<unknown>(YDOC_KEYS.meta);

const pageToView = (yMap: Y.Map<unknown>): PageView | null => {
  const id = yMap.get(YDOC_KEYS.id);
  const configId = yMap.get(YDOC_KEYS.configId);
  const pos = yMap.get(YDOC_KEYS.pos);
  if (typeof id !== 'string' || typeof configId !== 'string' || typeof pos !== 'string') {
    return null;
  }
  const stateY = yMap.get(YDOC_KEYS.state);
  const state = stateY instanceof Y.Map ? Object.fromEntries(stateY.entries()) : {};
  return { id, configId, pos, state, yMap };
};

/** All pages, sorted by (pos, id) — the canonical page order. */
export function readPages(doc: Y.Doc): PageView[] {
  const views: PageView[] = [];
  getPagesMap(doc).forEach((yMap) => {
    const view = pageToView(yMap);
    if (view) views.push(view);
  });
  views.sort((a, b) => (a.pos < b.pos ? -1 : a.pos > b.pos ? 1 : a.id < b.id ? -1 : 1));
  return views;
}

// ── page construction / cloning ─────────────────────────────────────────────

export function buildPage(def: PageDef, pos: string): Y.Map<unknown> {
  const page = new Y.Map<unknown>();
  page.set(YDOC_KEYS.id, def.id);
  page.set(YDOC_KEYS.configId, def.configId);
  page.set(YDOC_KEYS.pos, pos);
  const state = new Y.Map<unknown>();
  for (const [k, v] of Object.entries(def.state)) state.set(k, v);
  page.set(YDOC_KEYS.state, state);
  // layers & config are otherwise created on demand by bindCanvasStoreToYMap
  // when the page first mounts in a GenericCanvas.
  if (def.layers && def.layers.length > 0) {
    const layers = new Y.Array<Y.Map<unknown>>();
    layers.push(
      def.layers.map((layer) => {
        const m = new Y.Map<unknown>();
        for (const [k, v] of Object.entries(layer)) m.set(k, v);
        return m;
      })
    );
    page.set(YDOC_KEYS.layers, layers);
  }
  if (def.config && Object.keys(def.config).length > 0) {
    const config = new Y.Map<unknown>();
    for (const [k, v] of Object.entries(def.config)) config.set(k, v);
    page.set(YDOC_KEYS.config, config);
  }
  return page;
}

const cloneYMapShallow = (source: Y.Map<unknown>): Y.Map<unknown> => {
  const copy = new Y.Map<unknown>();
  for (const [k, v] of source.entries()) copy.set(k, v);
  return copy;
};

/** Deep-clone a page's state, layers and config into a fresh Y.Map. */
export function clonePage(source: Y.Map<unknown>, newId: string, pos: string): Y.Map<unknown> {
  const page = new Y.Map<unknown>();
  page.set(YDOC_KEYS.id, newId);
  page.set(YDOC_KEYS.configId, source.get(YDOC_KEYS.configId) ?? 'unknown');
  page.set(YDOC_KEYS.pos, pos);

  const sourceState = source.get(YDOC_KEYS.state);
  page.set(
    YDOC_KEYS.state,
    sourceState instanceof Y.Map ? cloneYMapShallow(sourceState) : new Y.Map<unknown>()
  );

  const sourceLayers = source.get(YDOC_KEYS.layers);
  if (sourceLayers instanceof Y.Array) {
    const layers = new Y.Array<Y.Map<unknown>>();
    layers.push(
      (sourceLayers as Y.Array<Y.Map<unknown>>).toArray().map((m) => cloneYMapShallow(m))
    );
    page.set(YDOC_KEYS.layers, layers);
  }

  const sourceConfig = source.get(YDOC_KEYS.config);
  if (sourceConfig instanceof Y.Map) {
    page.set(YDOC_KEYS.config, cloneYMapShallow(sourceConfig));
  }

  return page;
}

// ── mutations (call inside doc.transact with your origin) ───────────────────

/**
 * Random suffix for user-initiated pos keys. posBetween is deterministic, so
 * two clients concurrently appending after the same last page would mint the
 * SAME pos for different ids — a tie posBetween can never split again. Two
 * random non-'0' chars make that practically impossible while preserving
 * strict betweenness (appending to a between-key keeps it between, given the
 * no-trailing-'0' invariant). Seeds stay deterministic on purpose — identical
 * racing seeds must converge, and ties across identical ids merge anyway.
 */
const posJitter = (pos: string): string =>
  pos +
  POS_ALPHABET[1 + Math.floor(Math.random() * (POS_ALPHABET.length - 1))] +
  POS_ALPHABET[1 + Math.floor(Math.random() * (POS_ALPHABET.length - 1))];

/**
 * Heal a doc whose pos keys collided (pre-jitter concurrent ops): re-space
 * every page along a fresh chain in the current canonical order.
 * Deterministic — two clients normalizing the same view write identical keys.
 */
export function normalizePositions(doc: Y.Doc): void {
  let pos: string | null = null;
  for (const view of readPages(doc)) {
    pos = posBetween(pos, null);
    if (view.pos !== pos) view.yMap.set(YDOC_KEYS.pos, pos);
  }
}

/** pos strictly between the neighbors at `index`; normalizes tied keys first. */
export function posForInsert(doc: Y.Doc, index: number): string {
  let views = readPages(doc);
  const clamped = Math.max(0, Math.min(index, views.length));
  let before = clamped > 0 ? views[clamped - 1].pos : null;
  let after = clamped < views.length ? views[clamped].pos : null;
  if (before !== null && after !== null && before >= after) {
    normalizePositions(doc);
    views = readPages(doc);
    before = clamped > 0 ? views[clamped - 1].pos : null;
    after = clamped < views.length ? views[clamped].pos : null;
  }
  return posJitter(posBetween(before, after));
}

export function insertPageAt(doc: Y.Doc, index: number, def: PageDef): void {
  getPagesMap(doc).set(def.id, buildPage(def, posForInsert(doc, index)));
}

export function appendPage(doc: Y.Doc, def: PageDef): void {
  getPagesMap(doc).set(def.id, buildPage(def, posForInsert(doc, Number.MAX_SAFE_INTEGER)));
}

/** Clone `sourceId` (state + layers + config) and insert it right after the source. */
export function duplicatePageById(doc: Y.Doc, sourceId: string, newId: string): boolean {
  const pagesMap = getPagesMap(doc);
  const source = pagesMap.get(sourceId);
  if (!source) return false;
  const idx = readPages(doc).findIndex((v) => v.id === sourceId);
  pagesMap.set(newId, clonePage(source, newId, posForInsert(doc, idx + 1)));
  return true;
}

export function removePageById(doc: Y.Doc, id: string): void {
  getPagesMap(doc).delete(id);
}

/** Move one step up/down by rewriting only the page's `pos` key. */
export function movePageById(doc: Y.Doc, id: string, direction: 'up' | 'down'): void {
  let views = readPages(doc);
  let idx = views.findIndex((v) => v.id === id);
  if (idx < 0) return;
  const target = direction === 'up' ? idx - 1 : idx + 1;
  if (target < 0 || target >= views.length) return;
  const bounds = (): [string | null, string | null] => {
    const neighbor = views[target];
    const beyond = direction === 'up' ? views[target - 1] : views[target + 1];
    return direction === 'up'
      ? [beyond ? beyond.pos : null, neighbor.pos]
      : [neighbor.pos, beyond ? beyond.pos : null];
  };
  let [lo, hi] = bounds();
  if (lo !== null && hi !== null && lo >= hi) {
    normalizePositions(doc);
    views = readPages(doc);
    idx = views.findIndex((v) => v.id === id);
    [lo, hi] = bounds();
  }
  views[idx].yMap.set(YDOC_KEYS.pos, posJitter(posBetween(lo, hi)));
}

const jsonEqual = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
};

/**
 * Patch primitive/plain-object fields on a page's `state` Y.Map. Structural
 * (JSON) equality guard: Y.Map.set on an identical value still emits an
 * update, and echoed updates ping-pong between clients via
 * useYjsPageStateSync + GenericCanvas's synced-image-key re-emission.
 */
export function updatePageStateById(
  doc: Y.Doc,
  id: string,
  partial: Record<string, unknown>
): void {
  const page = getPagesMap(doc).get(id);
  if (!page) return;
  const stateY = page.get(YDOC_KEYS.state);
  if (!(stateY instanceof Y.Map)) return;
  for (const [k, v] of Object.entries(partial)) {
    if (!jsonEqual(stateY.get(k), v)) stateY.set(k, v);
  }
}

/**
 * Convert a page to another template in place: replaces `configId` and the
 * whole `state` map while keeping id, pos and layers (free elements survive
 * the template switch).
 */
export function setPageConfigById(
  doc: Y.Doc,
  id: string,
  configId: string,
  newState: Record<string, unknown>
): void {
  const page = getPagesMap(doc).get(id);
  if (!page) return;
  page.set(YDOC_KEYS.configId, configId);
  const state = new Y.Map<unknown>();
  for (const [k, v] of Object.entries(newState)) state.set(k, v);
  page.set(YDOC_KEYS.state, state);
}

// ── seeding ─────────────────────────────────────────────────────────────────

/**
 * Deterministic seed ids: two clients racing to seed the same fresh doc write
 * the same map keys, so the CRDT merge converges to ONE set of pages instead
 * of duplicating them (the old Y.Array seed with uuid ids doubled the deck).
 */
export const seedPageId = (index: number): string => `seed-${index}`;

/**
 * Seed a fresh page list. No-op when pages exist or the doc carries the
 * server-authoritative seed watermark.
 */
export function seedPagesIfEmpty(doc: Y.Doc, defs: PageDef[]): boolean {
  const pagesMap = getPagesMap(doc);
  const meta = getMetaMap(doc);
  if (pagesMap.size > 0 || meta.get(YDOC_KEYS.pagesSeeded) === true) return false;
  let pos: string | null = null;
  for (const def of defs) {
    pos = posBetween(pos, null);
    pagesMap.set(def.id, buildPage(def, pos));
  }
  meta.set(YDOC_KEYS.pagesSeeded, true);
  return true;
}

// ── serialization (deck autosave / exports) ─────────────────────────────────

export function serializeDeck(doc: Y.Doc): SerializedPage[] {
  return readPages(doc).map((view) => {
    const layersY = view.yMap.get(YDOC_KEYS.layers);
    const configY = view.yMap.get(YDOC_KEYS.config);
    return {
      id: view.id,
      configId: view.configId,
      state: view.state,
      layers:
        layersY instanceof Y.Array
          ? (layersY as Y.Array<Y.Map<unknown>>).toArray().map((m) => m.toJSON())
          : [],
      config: configY instanceof Y.Map ? configY.toJSON() : {},
    };
  });
}

// ── legacy migration ────────────────────────────────────────────────────────

/**
 * One-shot lazy migration of pre-`pagesById` docs. Handles, in order:
 *  1. `pages` Y.Array (previous multi-page container) → pagesById with pos
 *     derived from array order.
 *  2. `legacy_root` / top-level `layers`+`config` (single-page collab docs
 *     from before pages existed) → one promoted page.
 * Idempotent: marked in `meta` and skipped when pagesById already has pages.
 * Runs inside one transaction — pass the caller's origin.
 */
export function migrateLegacyDoc(doc: Y.Doc): void {
  const pagesMap = getPagesMap(doc);
  const meta = getMetaMap(doc);
  if (pagesMap.size > 0 || meta.get(YDOC_KEYS.legacyMigrated) === true) return;

  const legacyPages = doc.getArray<Y.Map<unknown>>(YDOC_KEYS.pages);
  if (legacyPages.length > 0) {
    let pos: string | null = null;
    for (const source of legacyPages.toArray()) {
      const id = source.get(YDOC_KEYS.id);
      if (typeof id !== 'string') continue;
      pos = posBetween(pos, null);
      pagesMap.set(id, clonePage(source, id, pos));
    }
    legacyPages.delete(0, legacyPages.length);
    meta.set(YDOC_KEYS.legacyMigrated, true);
    meta.set(YDOC_KEYS.pagesSeeded, true);
    return;
  }

  const legacyRoot = doc.getMap<unknown>(YDOC_KEYS.legacyRoot);
  const hasLegacyLayersType = doc.share.has(YDOC_KEYS.layers);
  const hasLegacyConfigType = doc.share.has(YDOC_KEYS.config);
  const legacyLayers = hasLegacyLayersType ? doc.getArray<Y.Map<unknown>>(YDOC_KEYS.layers) : null;
  const legacyConfig = hasLegacyConfigType ? doc.getMap<unknown>(YDOC_KEYS.config) : null;

  const legacyHasContent =
    legacyRoot.size > 0 ||
    (legacyLayers !== null && legacyLayers.length > 0) ||
    (legacyConfig !== null && legacyConfig.size > 0);
  if (!legacyHasContent) return;

  const promoted = buildPage(
    { id: `legacy-${Date.now()}`, configId: 'unknown', state: {} },
    posBetween(null, null)
  );
  if (legacyLayers && legacyLayers.length > 0) {
    const layers = new Y.Array<Y.Map<unknown>>();
    layers.push(legacyLayers.toArray().map((m) => cloneYMapShallow(m)));
    promoted.set(YDOC_KEYS.layers, layers);
    legacyLayers.delete(0, legacyLayers.length);
  }
  if (legacyConfig && legacyConfig.size > 0) {
    promoted.set(YDOC_KEYS.config, cloneYMapShallow(legacyConfig));
    for (const k of Array.from(legacyConfig.keys())) legacyConfig.delete(k);
  }
  pagesMap.set(promoted.get(YDOC_KEYS.id) as string, promoted);
  meta.set(YDOC_KEYS.legacyMigrated, true);
  meta.set(YDOC_KEYS.pagesSeeded, true);
}

/**
 * One-shot heal for docs whose template edits predate per-page dual-writes:
 * they live only in the root `formState` Y.Map. Fold them into the single
 * page's state (multi-page docs are marked folded WITHOUT folding —
 * formState mixes the last edits of ALL pages and can't be attributed).
 *
 * MUST run immediately after the page seed (useYjsPages.seedIfEmpty calls it
 * in the same transaction) — a doc with 0 pages returns without the marker,
 * and folding on some LATER open would overwrite page-state edits the user
 * made in between with the frozen formState snapshot.
 */
export function foldLegacyFormStateIntoFirstPage(doc: Y.Doc): void {
  const meta = getMetaMap(doc);
  if (meta.get(YDOC_KEYS.formStateFolded) === true) return;
  const views = readPages(doc);
  if (views.length === 0) return;
  const formState = doc.getMap<unknown>(YDOC_KEYS.formState);
  if (views.length === 1 && formState.size > 0) {
    const stateY = views[0].yMap.get(YDOC_KEYS.state);
    if (!(stateY instanceof Y.Map)) return;
    formState.forEach((value, key) => {
      if (key.startsWith('_')) return;
      if (stateY.get(key) !== value) stateY.set(key, value);
    });
  }
  meta.set(YDOC_KEYS.formStateFolded, true);
}
