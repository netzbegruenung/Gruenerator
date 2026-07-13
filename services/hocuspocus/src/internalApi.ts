import express from 'express';
import * as Y from 'yjs';

import { createLogger } from './logger.js';

import type { PostgresPersistence } from './persistence.js';
import type { Server } from '@hocuspocus/server';

const log = createLogger('InternalApi');

// Y.Doc keys for canvas documents. Duplicated from
// packages/canvas-editor/src/collab/ydocKeys.ts on purpose — per CLAUDE.md the
// Hocuspocus service has zero cross-package deps.
const KEY_FORM_STATE = 'formState';
const KEY_PAGES_BY_ID = 'pagesById';
const KEY_META = 'meta';
const KEY_PAGES = 'pages'; // legacy Y.Array container
const KEY_STATE = 'state';
const KEY_ID = 'id';
const KEY_CONFIG_ID = 'configId';
const KEY_POS = 'pos';
const KEY_PAGES_SEEDED = 'pagesSeeded';
// Authoritative-seed watermark; MUST match YDOC_KEYS.seeded in
// packages/canvas-editor/src/collab/ydocKeys.ts.
const KEY_SEEDED = '_seeded';

const TRANSACT_ORIGIN = 'gruenerator-internal-canvas-api';

interface InternalApiDeps {
  server: Server;
  persistence: PostgresPersistence;
}

export interface PageDef {
  id: string;
  configId: string;
  state: Record<string, unknown>;
  /** Optional free-element layers/config (deck seeds from serialized decks). */
  layers?: Array<Record<string, unknown>>;
  config?: Record<string, unknown>;
}

export interface DeckChanges {
  /** Seed the page set — applied only when the doc has no pages yet. */
  seedPages?: PageDef[];
  /** Per-page state patches, addressed by page id (stable under reorders). */
  pagePatches?: Array<{ pageId: string; patch: Record<string, unknown> }>;
  /** Structural changes, applied after patches. */
  pageOps?: Array<{ op: 'add'; index: number; page: PageDef } | { op: 'remove'; pageId: string }>;
  /** Restore: replace the whole page set. Applied last, wins over the rest. */
  replacePages?: PageDef[];
}

// Fractional order key — MUST mirror posBetween in
// packages/canvas-editor/src/collab/pagesDoc.ts (ASCII-ordered alphabet,
// generated keys never end in '0').
const POS_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

function posBetween(a: string | null, b: string | null): string {
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

// Mirrors buildPage in packages/canvas-editor/src/collab/pagesDoc.ts:
// layers & config maps are otherwise created on demand at first mount.
function buildPageYMap(def: PageDef, pos: string): Y.Map<unknown> {
  const page = new Y.Map<unknown>();
  page.set(KEY_ID, def.id);
  page.set(KEY_CONFIG_ID, def.configId);
  page.set(KEY_POS, pos);
  const state = new Y.Map<unknown>();
  for (const [k, v] of Object.entries(def.state)) state.set(k, v);
  page.set(KEY_STATE, state);
  if (def.layers && def.layers.length > 0) {
    const layers = new Y.Array<Y.Map<unknown>>();
    layers.push(
      def.layers.map((layer) => {
        const m = new Y.Map<unknown>();
        for (const [k, v] of Object.entries(layer)) m.set(k, v);
        return m;
      })
    );
    page.set('layers', layers);
  }
  if (def.config && Object.keys(def.config).length > 0) {
    const config = new Y.Map<unknown>();
    for (const [k, v] of Object.entries(def.config)) config.set(k, v);
    page.set('config', config);
  }
  return page;
}

function readPageDef(yMap: Y.Map<unknown>): PageDef | null {
  const id = yMap.get(KEY_ID);
  const configId = yMap.get(KEY_CONFIG_ID);
  if (typeof id !== 'string' || typeof configId !== 'string') return null;
  const state: Record<string, unknown> = {};
  const yState = yMap.get(KEY_STATE);
  if (yState instanceof Y.Map) {
    for (const [k, v] of (yState as Y.Map<unknown>).entries()) state[k] = v;
  }
  return { id, configId, state };
}

const getPagesMap = (doc: Y.Doc): Y.Map<Y.Map<unknown>> =>
  doc.getMap<Y.Map<unknown>>(KEY_PAGES_BY_ID);

/**
 * Current page Y.Maps in canonical order. `pagesById` (sorted by pos, id)
 * when populated; otherwise the legacy `pages` Y.Array (docs from before the
 * map container — the client migrates them lazily on next open).
 */
function readPageYMaps(doc: Y.Doc): Y.Map<unknown>[] {
  const pagesMap = getPagesMap(doc);
  if (pagesMap.size > 0) {
    const entries: Array<{ pos: string; id: string; yMap: Y.Map<unknown> }> = [];
    pagesMap.forEach((yMap) => {
      const id = yMap.get(KEY_ID);
      const pos = yMap.get(KEY_POS);
      if (typeof id === 'string' && typeof pos === 'string') {
        entries.push({ pos, id, yMap });
      }
    });
    entries.sort((a, b) => (a.pos < b.pos ? -1 : a.pos > b.pos ? 1 : a.id < b.id ? -1 : 1));
    return entries.map((e) => e.yMap);
  }
  const legacy = doc.getArray<Y.Map<unknown>>(KEY_PAGES);
  return legacy.toArray();
}

export function readMergedState(doc: Y.Doc): {
  state: Record<string, unknown>;
  pages: PageDef[];
  hasYState: boolean;
} {
  const formState = doc.getMap<unknown>(KEY_FORM_STATE);
  const pageYMaps = readPageYMaps(doc);
  const usesPagesById = getPagesMap(doc).size > 0;

  const merged: Record<string, unknown> = {};
  const firstPageState = pageYMaps[0]?.get(KEY_STATE);
  if (firstPageState instanceof Y.Map) {
    for (const [k, v] of (firstPageState as Y.Map<unknown>).entries()) merged[k] = v;
  }
  // Legacy docs: root formState wins (it was where the studio wrote template
  // edits). pagesById docs never write formState — page state is authoritative.
  if (!usesPagesById) {
    formState.forEach((value, key) => {
      merged[key] = value;
    });
  }

  const pageDefs: PageDef[] = [];
  for (const yMap of pageYMaps) {
    const def = readPageDef(yMap);
    if (def) pageDefs.push(def);
  }

  return {
    state: merged,
    pages: pageDefs,
    hasYState: formState.size > 0 || pageYMaps.length > 0,
  };
}

/**
 * Multi-page (deck) writes. Never touches root formState — decks keep their
 * authoritative state per page; the single-page patch path (applyPatchToDoc)
 * stays untouched for sharepics. New pages land in `pagesById`; legacy-array
 * docs keep being patched in place until a client migrates them.
 */
export function applyDeckChangesToDoc(doc: Y.Doc, changes: DeckChanges): void {
  doc.transact(() => {
    const pagesMap = getPagesMap(doc);
    const legacyPages = doc.getArray<Y.Map<unknown>>(KEY_PAGES);
    const meta = doc.getMap<unknown>(KEY_META);
    const hasPages = () => pagesMap.size > 0 || legacyPages.length > 0;

    if (changes.seedPages && changes.seedPages.length > 0 && !hasPages()) {
      let pos: string | null = null;
      for (const def of changes.seedPages) {
        pos = posBetween(pos, null);
        pagesMap.set(def.id, buildPageYMap(def, pos));
      }
      meta.set(KEY_PAGES_SEEDED, true);
    }

    const findPage = (pageId: string): Y.Map<unknown> | null => {
      const fromMap = pagesMap.get(pageId);
      if (fromMap) return fromMap;
      for (let i = 0; i < legacyPages.length; i++) {
        if (legacyPages.get(i).get(KEY_ID) === pageId) return legacyPages.get(i);
      }
      return null;
    };

    if (changes.pagePatches) {
      for (const { pageId, patch } of changes.pagePatches) {
        const yState = findPage(pageId)?.get(KEY_STATE);
        if (yState instanceof Y.Map) {
          for (const [k, v] of Object.entries(patch)) (yState as Y.Map<unknown>).set(k, v);
        }
      }
    }

    if (changes.pageOps) {
      for (const op of changes.pageOps) {
        if (op.op === 'add') {
          if (legacyPages.length > 0 && pagesMap.size === 0) {
            const index = Math.max(0, Math.min(op.index, legacyPages.length));
            legacyPages.insert(index, [buildPageYMap(op.page, posBetween(null, null))]);
          } else {
            const yMaps = readPageYMaps(doc);
            const index = Math.max(0, Math.min(op.index, yMaps.length));
            const beforeRaw = index > 0 ? yMaps[index - 1]?.get(KEY_POS) : null;
            const afterRaw = index < yMaps.length ? yMaps[index]?.get(KEY_POS) : null;
            const before = typeof beforeRaw === 'string' ? beforeRaw : null;
            const after = typeof afterRaw === 'string' ? afterRaw : null;
            let pos: string;
            try {
              pos = posBetween(before, after);
            } catch {
              // Tied pos keys (concurrent client ops) — fall back to append.
              const lastRaw = yMaps[yMaps.length - 1]?.get(KEY_POS);
              pos = posBetween(typeof lastRaw === 'string' ? lastRaw : null, null);
            }
            pagesMap.set(op.page.id, buildPageYMap(op.page, pos));
          }
        } else {
          pagesMap.delete(op.pageId);
          for (let i = legacyPages.length - 1; i >= 0; i--) {
            if (legacyPages.get(i).get(KEY_ID) === op.pageId) legacyPages.delete(i, 1);
          }
        }
      }
    }

    if (changes.replacePages && changes.replacePages.length > 0) {
      if (legacyPages.length > 0) legacyPages.delete(0, legacyPages.length);
      for (const key of Array.from(pagesMap.keys())) pagesMap.delete(key);
      let pos: string | null = null;
      for (const def of changes.replacePages) {
        pos = posBetween(pos, null);
        pagesMap.set(def.id, buildPageYMap(def, pos));
      }
      meta.set(KEY_PAGES_SEEDED, true);
    }
  }, TRANSACT_ORIGIN);
}

function hasDeckKeys(body: Record<string, unknown>): boolean {
  return Boolean(body.seedPages || body.pagePatches || body.pageOps || body.replacePages);
}

const isPageDef = (v: unknown): v is PageDef => {
  if (!v || typeof v !== 'object') return false;
  const p = v as Record<string, unknown>;
  return (
    typeof p.id === 'string' &&
    typeof p.configId === 'string' &&
    typeof p.state === 'object' &&
    p.state !== null &&
    !Array.isArray(p.state) &&
    (p.layers === undefined || Array.isArray(p.layers)) &&
    (p.config === undefined || (typeof p.config === 'object' && p.config !== null))
  );
};

function validateDeckChanges(body: Record<string, unknown>): string | null {
  if (body.seedPages !== undefined) {
    if (!Array.isArray(body.seedPages) || !body.seedPages.every(isPageDef))
      return 'seedPages must be an array of {id, configId, state}';
  }
  if (body.replacePages !== undefined) {
    if (!Array.isArray(body.replacePages) || !body.replacePages.every(isPageDef))
      return 'replacePages must be an array of {id, configId, state}';
  }
  if (body.pagePatches !== undefined) {
    if (
      !Array.isArray(body.pagePatches) ||
      !body.pagePatches.every(
        (p: unknown) =>
          !!p &&
          typeof p === 'object' &&
          typeof (p as Record<string, unknown>).pageId === 'string' &&
          typeof (p as Record<string, unknown>).patch === 'object' &&
          (p as Record<string, unknown>).patch !== null
      )
    )
      return 'pagePatches must be an array of {pageId, patch}';
  }
  if (body.pageOps !== undefined) {
    if (
      !Array.isArray(body.pageOps) ||
      !body.pageOps.every((o: unknown) => {
        if (!o || typeof o !== 'object') return false;
        const op = o as Record<string, unknown>;
        if (op.op === 'add') return typeof op.index === 'number' && isPageDef(op.page);
        if (op.op === 'remove') return typeof op.pageId === 'string';
        return false;
      })
    )
      return 'pageOps must be add {index, page} or remove {pageId} operations';
  }
  return null;
}

export function applyPatchToDoc(
  doc: Y.Doc,
  patch: Record<string, unknown>,
  seedState: Record<string, unknown> | null
): void {
  doc.transact(() => {
    const formState = doc.getMap<unknown>(KEY_FORM_STATE);
    const pageYMaps = readPageYMaps(doc);

    // Never-opened doc: seed the FULL state into formState first. A later
    // studio open seeds page 0 from its own initialState and then folds
    // formState over it (pagesDoc.foldLegacyFormStateIntoFirstPage), so the
    // chat edit survives. The `_seeded` watermark marks the authoritative
    // server seed.
    if (formState.size === 0 && pageYMaps.length === 0 && seedState) {
      for (const [k, v] of Object.entries(seedState)) formState.set(k, v);
      formState.set(KEY_SEEDED, true);
    }

    for (const [k, v] of Object.entries(patch)) formState.set(k, v);

    // Mirror into every page's state map (pagesById or legacy array) —
    // page state is what a mounted studio page reads for template fields.
    for (const yMap of pageYMaps) {
      const pageState = yMap.get(KEY_STATE);
      if (pageState instanceof Y.Map) {
        for (const [k, v] of Object.entries(patch)) (pageState as Y.Map<unknown>).set(k, v);
      }
    }
  }, TRANSACT_ORIGIN);
}

/**
 * Server-to-server canvas state endpoints used by the API's
 * `canvasStateService` (chat sharepic editing). Mounted on the health Express
 * app; enabled only when HOCUSPOCUS_INTERNAL_TOKEN is configured.
 */
export function registerInternalApi(app: express.Express, deps: InternalApiDeps): void {
  const token = process.env.HOCUSPOCUS_INTERNAL_TOKEN;
  if (!token) {
    log.warn('HOCUSPOCUS_INTERNAL_TOKEN not set — internal canvas API disabled');
    return;
  }

  const router = express.Router();
  router.use(express.json({ limit: '1mb' }));
  router.use((req, res, next) => {
    if (req.headers['x-internal-token'] !== token) {
      res.status(401).json({ error: 'invalid internal token' });
      return;
    }
    next();
  });

  router.get('/canvas/:documentId/state', async (req, res) => {
    const { documentId } = req.params;
    try {
      // Live doc first (includes unsaved in-flight edits); otherwise decode
      // the persisted Yjs state without opening a direct connection (a pure
      // read must not create + persist an empty doc).
      const liveDoc = deps.server.hocuspocus.documents.get(documentId);
      if (liveDoc) {
        res.json({ ...readMergedState(liveDoc), live: true });
        return;
      }
      const stored = await deps.persistence.loadDocument(documentId);
      if (!stored) {
        res.json({ state: {}, hasYState: false, live: false });
        return;
      }
      const doc = new Y.Doc();
      Y.applyUpdate(doc, stored);
      res.json({ ...readMergedState(doc), live: false });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      log.error(`GET state failed for ${documentId}: ${msg}`);
      res.status(500).json({ error: msg });
    }
  });

  router.post('/canvas/:documentId/state', async (req, res) => {
    const { documentId } = req.params;
    const body = (req.body ?? {}) as Record<string, unknown> & {
      patch?: Record<string, unknown>;
      seedState?: Record<string, unknown>;
    } & DeckChanges;

    const isFlatPatch = body.patch !== undefined;
    const isDeck = hasDeckKeys(body);
    if (isFlatPatch && isDeck) {
      res.status(400).json({ error: 'use either patch (single-page) or deck keys, not both' });
      return;
    }
    if (isFlatPatch) {
      if (!body.patch || typeof body.patch !== 'object' || Array.isArray(body.patch)) {
        res.status(400).json({ error: 'patch (object) is required' });
        return;
      }
    } else if (isDeck) {
      const validationError = validateDeckChanges(body);
      if (validationError) {
        res.status(400).json({ error: validationError });
        return;
      }
    } else {
      res.status(400).json({ error: 'patch (object) or deck keys are required' });
      return;
    }

    try {
      const connection = await deps.server.hocuspocus.openDirectConnection(documentId);
      try {
        let result: ReturnType<typeof readMergedState> | null = null;
        await connection.transact((doc) => {
          if (isFlatPatch) {
            applyPatchToDoc(doc, body.patch!, body.seedState ?? null);
          } else {
            applyDeckChangesToDoc(doc, body);
          }
          result = readMergedState(doc);
        });
        log.info(
          isFlatPatch
            ? `Applied canvas patch to ${documentId} (${Object.keys(body.patch!).length} key(s))`
            : `Applied deck changes to ${documentId} (seed=${body.seedPages?.length ?? 0}, patches=${body.pagePatches?.length ?? 0}, ops=${body.pageOps?.length ?? 0}, replace=${body.replacePages?.length ?? 0})`
        );
        res.json({ ok: true, ...(result ?? { state: {}, pages: [], hasYState: false }) });
      } finally {
        await connection.disconnect();
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      log.error(`POST state failed for ${documentId}: ${msg}`);
      res.status(500).json({ error: msg });
    }
  });

  // Live-comment signal for boards. Board comments live in Postgres (not Yjs),
  // so we bump a tiny per-card counter in the board doc's `commentSignals` map;
  // connected clients observe it and refetch that card's comments. A dedicated
  // top-level key keeps it clear of the board's fields/rows/views state.
  router.post('/board/:boardId/comment-bump', async (req, res) => {
    const { boardId } = req.params;
    const cardId = (req.body as { cardId?: unknown })?.cardId;
    if (typeof cardId !== 'string' || !cardId) {
      res.status(400).json({ error: 'cardId (string) is required' });
      return;
    }

    try {
      const connection = await deps.server.hocuspocus.openDirectConnection(boardId);
      try {
        await connection.transact((doc) => {
          const signals = doc.getMap<number>('commentSignals');
          const prev = signals.get(cardId);
          signals.set(cardId, (typeof prev === 'number' ? prev : 0) + 1);
        });
        res.json({ ok: true });
      } finally {
        await connection.disconnect();
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      log.error(`comment-bump failed for board ${boardId} card ${cardId}: ${msg}`);
      res.status(500).json({ error: msg });
    }
  });

  app.use('/internal', router);
  log.info('Internal API registered at /internal/canvas/* and /internal/board/*/comment-bump');
}
