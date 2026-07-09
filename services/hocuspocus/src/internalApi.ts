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
const KEY_PAGES = 'pages';
const KEY_STATE = 'state';
const KEY_ID = 'id';
const KEY_CONFIG_ID = 'configId';
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
}

export interface DeckChanges {
  /** Seed the pages array — applied only when the doc has no pages yet. */
  seedPages?: PageDef[];
  /** Per-page state patches, addressed by page id (stable under reorders). */
  pagePatches?: Array<{ pageId: string; patch: Record<string, unknown> }>;
  /** Structural changes, applied after patches. */
  pageOps?: Array<{ op: 'add'; index: number; page: PageDef } | { op: 'remove'; pageId: string }>;
  /** Restore: replace the whole pages array. Applied last, wins over the rest. */
  replacePages?: PageDef[];
}

// Mirrors buildPageYMap in packages/canvas-editor/src/collab/useYjsPages.ts:
// layers & config maps are created on demand when the page first mounts.
function buildPageYMap(def: PageDef): Y.Map<unknown> {
  const page = new Y.Map<unknown>();
  page.set(KEY_ID, def.id);
  page.set(KEY_CONFIG_ID, def.configId);
  const state = new Y.Map<unknown>();
  for (const [k, v] of Object.entries(def.state)) state.set(k, v);
  page.set(KEY_STATE, state);
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

export function readMergedState(doc: Y.Doc): {
  state: Record<string, unknown>;
  pages: PageDef[];
  hasYState: boolean;
} {
  const formState = doc.getMap<unknown>(KEY_FORM_STATE);
  const pages = doc.getArray<Y.Map<unknown>>(KEY_PAGES);

  const merged: Record<string, unknown> = {};
  const firstPage = pages.length > 0 ? pages.get(0) : null;
  const firstPageState = firstPage?.get(KEY_STATE);
  if (firstPageState instanceof Y.Map) {
    for (const [k, v] of (firstPageState as Y.Map<unknown>).entries()) merged[k] = v;
  }
  // Root formState wins: it is where the studio writes template-field edits.
  formState.forEach((value, key) => {
    merged[key] = value;
  });

  const pageDefs: PageDef[] = [];
  for (let i = 0; i < pages.length; i++) {
    const def = readPageDef(pages.get(i));
    if (def) pageDefs.push(def);
  }

  return {
    state: merged,
    pages: pageDefs,
    hasYState: formState.size > 0 || pages.length > 0,
  };
}

/**
 * Multi-page (deck) writes. Never touches root formState — decks keep their
 * authoritative state per page; the single-page patch path (applyPatchToDoc)
 * stays untouched for sharepics.
 */
export function applyDeckChangesToDoc(doc: Y.Doc, changes: DeckChanges): void {
  doc.transact(() => {
    const pages = doc.getArray<Y.Map<unknown>>(KEY_PAGES);

    if (changes.seedPages && changes.seedPages.length > 0 && pages.length === 0) {
      pages.push(changes.seedPages.map(buildPageYMap));
    }

    const findIndexById = (pageId: string): number => {
      for (let i = 0; i < pages.length; i++) {
        if (pages.get(i).get(KEY_ID) === pageId) return i;
      }
      return -1;
    };

    if (changes.pagePatches) {
      for (const { pageId, patch } of changes.pagePatches) {
        const idx = findIndexById(pageId);
        if (idx < 0) continue;
        const yState = pages.get(idx).get(KEY_STATE);
        if (yState instanceof Y.Map) {
          for (const [k, v] of Object.entries(patch)) (yState as Y.Map<unknown>).set(k, v);
        }
      }
    }

    if (changes.pageOps) {
      for (const op of changes.pageOps) {
        if (op.op === 'add') {
          const index = Math.max(0, Math.min(op.index, pages.length));
          pages.insert(index, [buildPageYMap(op.page)]);
        } else {
          const idx = findIndexById(op.pageId);
          if (idx >= 0) pages.delete(idx, 1);
        }
      }
    }

    if (changes.replacePages && changes.replacePages.length > 0) {
      if (pages.length > 0) pages.delete(0, pages.length);
      pages.push(changes.replacePages.map(buildPageYMap));
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
    !Array.isArray(p.state)
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
    const pages = doc.getArray<Y.Map<unknown>>(KEY_PAGES);

    // Never-opened doc: seed the FULL state first so a later studio open
    // (which only seeds when the map is empty) doesn't half-seed the form.
    // The `_seeded` watermark marks this as an authoritative server seed so
    // the client never fills defaults over it (useYjsFormState guard).
    if (formState.size === 0 && pages.length === 0 && seedState) {
      for (const [k, v] of Object.entries(seedState)) formState.set(k, v);
      formState.set(KEY_SEEDED, true);
    }

    for (const [k, v] of Object.entries(patch)) formState.set(k, v);

    // Mirror into every page's state map — pages[i].state is what a mounted
    // studio page reads (and observes) for template fields.
    for (let i = 0; i < pages.length; i++) {
      const pageState = pages.get(i).get(KEY_STATE);
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
