import { posBetween } from '@ggraphic/core/ydoc';
import { DOCUMENT_FRAGMENT_NAME, injectHtmlIntoFragment } from '@gruenerator/shared/yjs';
import express from 'express';
import * as Y from 'yjs';

import { blockNoteXmlToHtml } from './blockNoteXmlToHtml.js';
import {
  CANVAS_DOCUMENT_NEWER_CODE,
  CANVAS_STATE_UNWRITABLE_CODE,
  CanvasDocumentNewerError,
  CanvasStateUnwritableError,
  YDOC_KEYS,
  assertCanvasDocumentWritable,
  assertStateWritable,
  buildPageState,
  readState,
  stampCreatedDocument,
  writePageState,
  CANVAS_KEY_CLASSES,
} from './canvasCodec.js';
import { mergeStalePatch } from './canvasMerge.js';
import { detectPreviewKind } from './contentPreviews.js';
import { createLogger } from './logger.js';
import { SITE_DOC_MAX_BYTES, applySiteSeed, isSiteId, siteRoomOf } from './siteRooms.js';

import type { PostgresPersistence } from './persistence.js';
import type { DbQueryFn } from './types.js';
import type { Connection, Hocuspocus, Server } from '@hocuspocus/server';

const log = createLogger('InternalApi');

// Y.Doc keys for canvas documents come from the codec package, so a rename there reaches this
// service. Page state is read and written only through `./canvasCodec.js` (see its header).
const KEY_FORM_STATE = YDOC_KEYS.formState;
const KEY_PAGES_BY_ID = YDOC_KEYS.pagesById;
const KEY_META = YDOC_KEYS.meta;
const KEY_PAGES = YDOC_KEYS.pages; // legacy Y.Array container
const KEY_STATE = YDOC_KEYS.state;
const KEY_ID = YDOC_KEYS.id;
const KEY_CONFIG_ID = YDOC_KEYS.configId;
const KEY_POS = YDOC_KEYS.pos;
const KEY_PAGES_SEEDED = YDOC_KEYS.pagesSeeded;
// Authoritative-seed watermark of a server-side formState seed.
const KEY_SEEDED = YDOC_KEYS.seeded;
const KEY_CONFIG = YDOC_KEYS.config;

/** HTTP status of a refused read or write of a canvas document newer than this build ("upgrade needed"). */
export const CANVAS_DOCUMENT_NEWER_STATUS = 426;

/** HTTP status of a refused write of a value the codec cannot store (nothing was written). */
export const CANVAS_STATE_UNWRITABLE_STATUS = 400;

const TRANSACT_ORIGIN = 'gruenerator-internal-canvas-api';

const BASE64_RE = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

/** A seed's base64 fits the store cap plus room for the JSON around it. */
const SITE_SEED_JSON_LIMIT = Math.ceil((SITE_DOC_MAX_BYTES * 4) / 3) + 64 * 1024;
const SITE_SEED_PATH = /^\/site\/[^/]+\/seed$/;

/**
 * A seed update that decodes and carries state, with the size of the state it
 * produces on an empty doc (the only doc it is applied to), or null.
 */
export function parseSiteSeedUpdate(v: unknown): { update: Uint8Array; stateBytes: number } | null {
  if (typeof v !== 'string' || !v || !BASE64_RE.test(v)) return null;
  const update = new Uint8Array(Buffer.from(v, 'base64'));
  const probe = new Y.Doc();
  try {
    Y.applyUpdate(probe, update);
    if (probe.store.clients.size === 0) return null;
    return { update, stateBytes: Y.encodeStateAsUpdate(probe).length };
  } catch {
    return null;
  } finally {
    probe.destroy();
  }
}

// Well-known board field IDs — duplicated from apps/api BoardService.FIELD_IDS
// on purpose: unlike canvas state, which goes through @ggraphic/core/ydoc (canvasCodec.ts), the
// board schema has no shared package this service depends on.
export const BOARD_FIELD_IDS = {
  TITLE: 'field-title',
  STATUS: 'field-status',
  DESCRIPTION: 'field-description',
  DUE_DATE: 'field-due-date',
  LABELS: 'field-labels',
  ASSIGNEE: 'field-assignee',
  LINKED_DOCS: 'field-linked-docs',
} as const;

const MAX_ROWS_PER_CALL = 50;

interface NewBoardRow {
  /** Caller-chosen card id, so it can queue work for the card it just created. */
  id?: string;
  title: string;
  status?: string;
  description?: string;
  dueDate?: string | null;
}

export const isNewBoardRow = (v: unknown): v is NewBoardRow => {
  if (!v || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  return (
    (r.id === undefined || (typeof r.id === 'string' && r.id.length > 0)) &&
    typeof r.title === 'string' &&
    (r.status === undefined || typeof r.status === 'string') &&
    (r.description === undefined || typeof r.description === 'string') &&
    (r.dueDate === undefined || r.dueDate === null || typeof r.dueDate === 'string')
  );
};

/**
 * Append task cards to a board's live Yjs doc. Mirrors apps/api
 * BoardService.addRowsToBoard's cell layout so a card created here is
 * indistinguishable from one created in the browser.
 */
export function appendRowsToBoardDoc(doc: Y.Doc, rows: NewBoardRow[], userId: string): void {
  const yRows = doc.getArray<Y.Map<unknown>>('rows');
  const now = new Date().toISOString();
  doc.transact(() => {
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const newRow = new Y.Map<unknown>();
      newRow.set(
        'id',
        row.id ?? `row-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 8)}`
      );
      newRow.set('createdBy', userId);
      newRow.set('createdAt', now);

      const cells = new Y.Map<unknown>();
      cells.set(BOARD_FIELD_IDS.TITLE, row.title);
      cells.set(BOARD_FIELD_IDS.STATUS, row.status ?? '');
      cells.set(BOARD_FIELD_IDS.DESCRIPTION, row.description ?? '');
      cells.set(BOARD_FIELD_IDS.DUE_DATE, row.dueDate ?? null);
      cells.set(BOARD_FIELD_IDS.LABELS, []);
      cells.set(BOARD_FIELD_IDS.ASSIGNEE, '');
      cells.set(BOARD_FIELD_IDS.LINKED_DOCS, '[]');
      newRow.set('cells', cells);

      yRows.push([newRow]);
    }
  }, TRANSACT_ORIGIN);
}

// Chat edits queued on a sheet. MUST match SHEET_YDOC_KEYS.pendingOps in
// packages/contracts/src/sheetsYdoc.ts — duplicated because this service does
// not import the sheets schema (it only imports the canvas codec). Only an open editor's Univer instance can execute
// the ops, so the server parks them in the doc itself instead of streaming
// them to a browser that may not have the sheet open.
const KEY_SHEET_PENDING_OPS = 'sheetPendingOps';
const MAX_SHEET_OPS_PER_BATCH = 50;

export interface PendingSheetOps {
  id: string;
  operations: unknown[];
  summary: string;
  ts: number;
}

export const isSheetOpsBatchInput = (
  v: unknown
): v is { operations: unknown[]; summary?: string } => {
  if (!v || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  return (
    Array.isArray(r.operations) &&
    r.operations.length > 0 &&
    r.operations.length <= MAX_SHEET_OPS_PER_BATCH &&
    (r.summary === undefined || typeof r.summary === 'string')
  );
};

export function appendSheetOps(doc: Y.Doc, batch: PendingSheetOps): number {
  const queue = doc.getArray<PendingSheetOps>(KEY_SHEET_PENDING_OPS);
  doc.transact(() => queue.push([batch]), TRANSACT_ORIGIN);
  return queue.length;
}

/** Hands out every queued batch exactly once — the claim runs server-side, so
 *  two open tabs can't both apply the same edit. */
export function claimSheetOps(doc: Y.Doc): PendingSheetOps[] {
  const queue = doc.getArray<PendingSheetOps>(KEY_SHEET_PENDING_OPS);
  const batches = queue.toArray();
  if (batches.length > 0) doc.transact(() => queue.delete(0, queue.length), TRANSACT_ORIGIN);
  return batches;
}

interface InternalApiDeps {
  server: Server;
  persistence: PostgresPersistence;
  db: DbQueryFn;
}

// ---------------------------------------------------------------------------
// Access changes. `onAuthenticate` runs once, when a connection is set up, and
// `readOnly` is fixed at that moment — an open connection never notices that
// its access was removed or narrowed. The API calls /internal/rooms/close
// after such a change; clients that still have access reconnect and get their
// current rights, the others are refused.
// ---------------------------------------------------------------------------

// Same code/reason the framework uses for its own resets (`ResetConnection` in
// @hocuspocus/common, which this service does not depend on directly).
const RESET_CONNECTION = { code: 4205, reason: 'Reset Connection' };

/** The user id `onAuthenticate` (server.ts) puts into the connection context. */
function connectionUserId(connection: Connection): string | null {
  const id = (connection.context as { user?: { id?: unknown } } | null)?.user?.id;
  return typeof id === 'string' ? id : null;
}

/**
 * Close the open connections of `rooms` — all of them, or only `userId`'s.
 *
 * `Connection.close()` takes the connection off the document at once: no
 * further update or awareness reaches it, and the next frame for the room
 * needs a fresh Auth, which re-runs `onAuthenticate`. The socket is closed as
 * well because the provider only re-authenticates on a new socket — left open,
 * it would sit unsynced until its message timeout. A socket that also carries
 * other rooms reconnects those too, which costs one re-auth each.
 */
export function closeRoomConnections(
  hocuspocus: Pick<Hocuspocus, 'documents'>,
  rooms: string[],
  userId: string | null
): number {
  let closed = 0;
  for (const room of rooms) {
    const document = hocuspocus.documents.get(room);
    if (!document) continue;
    for (const connection of document.getConnections()) {
      if (userId !== null && connectionUserId(connection) !== userId) continue;
      connection.close(RESET_CONNECTION);
      connection.webSocket.close(RESET_CONNECTION.code, RESET_CONNECTION.reason);
      closed += 1;
    }
  }
  return closed;
}

/** `{ rooms: string[], userId?: string | null }` → normalized, or null if invalid. */
export function parseRoomCloseInput(v: unknown): { rooms: string[]; userId: string | null } | null {
  if (!v || typeof v !== 'object') return null;
  const r = v as Record<string, unknown>;
  if (
    !Array.isArray(r.rooms) ||
    r.rooms.length === 0 ||
    !r.rooms.every((room): room is string => typeof room === 'string' && room.length > 0)
  ) {
    return null;
  }
  if (r.userId === undefined || r.userId === null) return { rooms: r.rooms, userId: null };
  if (typeof r.userId !== 'string' || !r.userId) return null;
  return { rooms: r.rooms, userId: r.userId };
}

// ---------------------------------------------------------------------------
// Prose documents (BlockNote). Same shape as the canvas endpoints above: Yjs is
// the authority, `collaborative_documents.content` is a derived 2000-char
// preview written by updateContentPreview — never a write target.
// ---------------------------------------------------------------------------

/** The document's prose as BlockNote HTML. Empty string for an empty doc. */
export function readDocHtml(doc: Y.Doc): string {
  return blockNoteXmlToHtml(doc.getXmlFragment(DOCUMENT_FRAGMENT_NAME).toString());
}

export const docBlockCount = (doc: Y.Doc): number =>
  doc.getXmlFragment(DOCUMENT_FRAGMENT_NAME).length;

/**
 * Does `html` yield at least one block? Checked on a scratch doc, because the
 * replace below deletes before it inserts: a parse that produces nothing would
 * otherwise leave the real document empty and the deletion is not recoverable
 * from the CRDT's point of view — it is a legitimate edit.
 */
export function parsesToBlocks(html: string): boolean {
  const scratch = new Y.Doc();
  const fragment = scratch.getXmlFragment(DOCUMENT_FRAGMENT_NAME);
  injectHtmlIntoFragment(fragment, html);
  return fragment.length > 0;
}

/**
 * Replace the whole prose body. Full replacement is what the chat edit path
 * produces today; block-addressed ops (which would survive a collaborator's
 * concurrent edit) are the intended successor, not a variant of this.
 */
export function replaceDocHtml(doc: Y.Doc, html: string): void {
  const fragment = doc.getXmlFragment(DOCUMENT_FRAGMENT_NAME);
  doc.transact(() => {
    if (fragment.length > 0) fragment.delete(0, fragment.length);
    injectHtmlIntoFragment(fragment, html);
  }, TRANSACT_ORIGIN);
}

export interface PageDef {
  id: string;
  configId: string;
  state: Record<string, unknown>;
  /** Optional config (deck seeds from serialized decks). */
  config?: Record<string, unknown>;
}

export interface DeckChanges {
  /** Seed the page set — applied only when the doc has no pages yet. */
  seedPages?: PageDef[];
  /** Per-page state patches, addressed by page id (stable under reorders). */
  pagePatches?: Array<{
    pageId: string;
    patch: Record<string, unknown>;
    /**
     * The page state the patch was computed from, per patched key (what the caller read before
     * it worked). With it the patch is merged into the page as it is now (`canvasMerge.ts`);
     * keys it lacks, and patches without it, are written as given.
     */
    base?: Record<string, unknown>;
  }>;
  /** Structural changes, applied after patches. */
  pageOps?: Array<{ op: 'add'; index: number; page: PageDef } | { op: 'remove'; pageId: string }>;
  /** Restore: replace the whole page set. Applied last, wins over the rest. */
  replacePages?: PageDef[];
}

// Mirrors buildPage in @ggraphic/editor's collab/pagesDoc: the config map is otherwise created
// on demand at first mount. The state map comes from the codec (structured only in a document
// at version 4 or above).
function buildPageYMap(doc: Y.Doc, def: PageDef, pos: string): Y.Map<unknown> {
  const page = new Y.Map<unknown>();
  page.set(KEY_ID, def.id);
  page.set(KEY_CONFIG_ID, def.configId);
  page.set(KEY_POS, pos);
  page.set(KEY_STATE, buildPageState(doc, def.state, def.id));
  if (def.config && Object.keys(def.config).length > 0) {
    const config = new Y.Map<unknown>();
    for (const [k, v] of Object.entries(def.config)) config.set(k, v);
    page.set(KEY_CONFIG, config);
  }
  return page;
}

function readPageDef(yMap: Y.Map<unknown>): PageDef | null {
  const id = yMap.get(KEY_ID);
  const configId = yMap.get(KEY_CONFIG_ID);
  if (typeof id !== 'string' || typeof configId !== 'string') return null;
  const yState = yMap.get(KEY_STATE);
  return { id, configId, state: yState instanceof Y.Map ? readState(yState) : {} };
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

  const firstPageState = pageYMaps[0]?.get(KEY_STATE);
  const merged: Record<string, unknown> =
    firstPageState instanceof Y.Map ? readState(firstPageState) : {};
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
  // Refused before anything is written: a newer document stays byte-identical.
  assertCanvasDocumentWritable(doc);
  const pagesMap = getPagesMap(doc);
  const legacyPages = doc.getArray<Y.Map<unknown>>(KEY_PAGES);
  const meta = doc.getMap<unknown>(KEY_META);
  const hasPages = () => pagesMap.size > 0 || legacyPages.length > 0;

  const findPage = (pageId: string): Y.Map<unknown> | null => {
    const fromMap = pagesMap.get(pageId);
    if (fromMap) return fromMap;
    for (let i = 0; i < legacyPages.length; i++) {
      if (legacyPages.get(i).get(KEY_ID) === pageId) return legacyPages.get(i);
    }
    return null;
  };

  // The first pages written into a document that had none create it: stamp it here, in the
  // same transaction and before any page value, so the codec sees the stamp. A document that
  // already has pages keeps its stamp (or its lack of one) as it is.
  const writesPages =
    (changes.seedPages?.length ?? 0) > 0 ||
    (changes.replacePages?.length ?? 0) > 0 ||
    (changes.pageOps?.some((op) => op.op === 'add') ?? false);
  const stamping = writesPages && !hasPages();

  // Everything is checked before the transaction opens: Yjs cannot roll one back, so a value
  // the codec refuses halfway would leave the pages before it written (and persisted).
  if (changes.seedPages && !hasPages()) {
    for (const def of changes.seedPages) assertStateWritable(doc, def.state, null, stamping);
  }
  // A patch that carries its base is merged into the page as it is now; nothing awaits between
  // this read and the write below, so the merge is computed on the state it is written into.
  const mergedPatches = new Map<number, Record<string, unknown>>();
  (changes.pagePatches ?? []).forEach(({ pageId, patch, base }, index) => {
    const yState = findPage(pageId)?.get(KEY_STATE);
    const merged =
      base && yState instanceof Y.Map
        ? mergeStalePatch(readState(yState), patch, base, CANVAS_KEY_CLASSES)
        : patch;
    mergedPatches.set(index, merged);
    assertStateWritable(doc, merged, yState instanceof Y.Map ? yState : null, stamping);
  });
  for (const op of changes.pageOps ?? []) {
    if (op.op === 'add') assertStateWritable(doc, op.page.state, null, stamping);
  }
  for (const def of changes.replacePages ?? []) assertStateWritable(doc, def.state, null, stamping);

  doc.transact(() => {
    if (stamping) stampCreatedDocument(doc);

    if (changes.seedPages && changes.seedPages.length > 0 && !hasPages()) {
      let pos: string | null = null;
      for (const def of changes.seedPages) {
        pos = posBetween(pos, null);
        pagesMap.set(def.id, buildPageYMap(doc, def, pos));
      }
      meta.set(KEY_PAGES_SEEDED, true);
    }

    if (changes.pagePatches) {
      changes.pagePatches.forEach(({ pageId, patch }, index) => {
        const yState = findPage(pageId)?.get(KEY_STATE);
        if (yState instanceof Y.Map)
          writePageState(doc, yState, mergedPatches.get(index) ?? patch, pageId);
      });
    }

    if (changes.pageOps) {
      for (const op of changes.pageOps) {
        if (op.op === 'add') {
          if (legacyPages.length > 0 && pagesMap.size === 0) {
            const index = Math.max(0, Math.min(op.index, legacyPages.length));
            legacyPages.insert(index, [buildPageYMap(doc, op.page, posBetween(null, null))]);
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
            pagesMap.set(op.page.id, buildPageYMap(doc, op.page, pos));
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
        pagesMap.set(def.id, buildPageYMap(doc, def, pos));
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
          (p as Record<string, unknown>).patch !== null &&
          (() => {
            const base = (p as Record<string, unknown>).base;
            return (
              base === undefined || (!!base && typeof base === 'object' && !Array.isArray(base))
            );
          })()
      )
    )
      return 'pagePatches must be an array of {pageId, patch, base?}';
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
  seedState: Record<string, unknown> | null,
  /** The state the patch was computed from, per patched key; see `DeckChanges.pagePatches`. */
  base: Record<string, unknown> | null = null
): void {
  assertCanvasDocumentWritable(doc);
  // Nothing to write: do not stamp or seed a document for it.
  if (Object.keys(patch).length === 0) return;

  // Checked before the transaction (and before any root mirror write): see applyDeckChanges.
  // With a base each page gets the patch merged into its own current state (see canvasMerge.ts).
  const pageWrites = new Map<Y.Map<unknown>, Record<string, unknown>>();
  for (const yMap of readPageYMaps(doc)) {
    const pageState = yMap.get(KEY_STATE);
    if (!(pageState instanceof Y.Map)) continue;
    const merged = base
      ? mergeStalePatch(readState(pageState), patch, base, CANVAS_KEY_CLASSES)
      : patch;
    pageWrites.set(pageState, merged);
    assertStateWritable(doc, merged, pageState);
  }

  doc.transact(() => {
    const formState = doc.getMap<unknown>(KEY_FORM_STATE);
    const pageYMaps = readPageYMaps(doc);

    // A write into a doc without pages or formState creates it: stamp it in this transaction.
    // A doc that has content keeps its stamp (or its lack of one) as it is.
    if (formState.size === 0 && pageYMaps.length === 0) stampCreatedDocument(doc);

    // Never-opened doc: seed the FULL state into formState first. A later
    // studio open seeds page 0 from its own initialState and then folds
    // formState over it (pagesDoc.foldLegacyFormStateIntoFirstPage), so the
    // chat edit survives. The `_seeded` watermark marks the authoritative
    // server seed.
    if (formState.size === 0 && pageYMaps.length === 0 && seedState) {
      for (const [k, v] of Object.entries(seedState)) formState.set(k, v);
      formState.set(KEY_SEEDED, true);
    }

    // The root formState is written only where something reads it: a document without pages
    // (it is the state there) and a legacy `pages`-array document (readMergedState lets it win
    // over page 1). A `pagesById` document never reads it, and the client's one-time fold
    // (foldLegacyFormStateIntoFirstPage, before `formStateFolded` is set) would copy a stale or
    // unmerged root value over page 1, so it stays untouched there (#5767).
    if (getPagesMap(doc).size === 0) {
      // Merged only where it is authoritative (no pages), and only for keys it holds.
      const rootPatch =
        base && pageYMaps.length === 0
          ? mergeStalePatch(
              Object.fromEntries(formState.entries()),
              patch,
              base,
              CANVAS_KEY_CLASSES
            )
          : patch;
      for (const [k, v] of Object.entries(rootPatch)) formState.set(k, v);
    }

    // Write into every page's state map (pagesById or legacy array) —
    // page state is what a mounted studio page reads for template fields. Through the codec;
    // the root formState above is the legacy mirror and stays plain JSON.
    for (const yMap of pageYMaps) {
      const pageState = yMap.get(KEY_STATE);
      if (pageState instanceof Y.Map) {
        writePageState(
          doc,
          pageState,
          pageWrites.get(pageState) ?? patch,
          yMap.get(KEY_ID) as string | null
        );
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
  const json = express.json({ limit: '1mb' });
  // A site seed may be larger; its route parses its own body, after the token check.
  router.use((req, res, next) => (SITE_SEED_PATH.test(req.path) ? next() : json(req, res, next)));
  router.use((req, res, next) => {
    if (req.headers['x-internal-token'] !== token) {
      res.status(401).json({ error: 'invalid internal token' });
      return;
    }
    next();
  });

  // A site's Yjs rows are keyed by its bare uuid: through these routes that id would
  // load and write the site draft as a second live document, past the site gate.
  router.use(['/doc/:documentId', '/canvas/:documentId'], async (req, res, next) => {
    try {
      const { documentId } = req.params;
      if (typeof documentId === 'string' && (await isSiteId(deps.db, documentId))) {
        res.status(400).json({ error: 'use site-<uuid>' });
        return;
      }
      next();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: msg });
    }
  });

  router.get('/canvas/:documentId/state', async (req, res) => {
    const { documentId } = req.params;
    try {
      // Live doc first (includes unsaved in-flight edits); otherwise decode
      // the persisted Yjs state without opening a direct connection (a pure
      // read must not create + persist an empty doc).
      // A document newer than this build is refused, as on write: `readState` omits the keys of
      // a class it does not know, so the answer would pass as complete while it is not.
      const liveDoc = deps.server.hocuspocus.documents.get(documentId);
      if (liveDoc) {
        assertCanvasDocumentWritable(liveDoc);
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
      assertCanvasDocumentWritable(doc);
      res.json({ ...readMergedState(doc), live: false });
    } catch (error) {
      if (error instanceof CanvasDocumentNewerError) {
        log.warn(`GET state refused for ${documentId}: ${error.message}`);
        res.status(CANVAS_DOCUMENT_NEWER_STATUS).json({
          error: 'canvas document is newer than this service supports',
          code: CANVAS_DOCUMENT_NEWER_CODE,
          found: error.found,
          known: error.known,
        });
        return;
      }
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
      base?: Record<string, unknown>;
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
      if (
        body.base !== undefined &&
        (!body.base || typeof body.base !== 'object' || Array.isArray(body.base))
      ) {
        res.status(400).json({ error: 'base must be an object' });
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
            applyPatchToDoc(doc, body.patch!, body.seedState ?? null, body.base ?? null);
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
      if (error instanceof CanvasDocumentNewerError) {
        // Not a 500: the caller must not retry, and must not patch a flat JSON mirror of the
        // document instead (the next open reads the Y.Doc, so the edit would exist in one copy).
        log.warn(`POST state refused for ${documentId}: ${error.message}`);
        res.status(CANVAS_DOCUMENT_NEWER_STATUS).json({
          error: 'canvas document is newer than this service supports',
          code: CANVAS_DOCUMENT_NEWER_CODE,
          found: error.found,
          known: error.known,
        });
        return;
      }
      if (error instanceof CanvasStateUnwritableError) {
        // The caller sent a value the codec cannot store; nothing was written.
        log.warn(`POST state rejected for ${documentId}: ${error.message}`);
        res.status(CANVAS_STATE_UNWRITABLE_STATUS).json({
          error: 'canvas state contains a value that cannot be stored',
          code: CANVAS_STATE_UNWRITABLE_CODE,
        });
        return;
      }
      const msg = error instanceof Error ? error.message : String(error);
      log.error(`POST state failed for ${documentId}: ${msg}`);
      res.status(500).json({ error: msg });
    }
  });

  router.get('/doc/:documentId/html', async (req, res) => {
    const { documentId } = req.params;
    try {
      const liveDoc = deps.server.hocuspocus.documents.get(documentId);
      if (liveDoc) {
        res.json({ html: readDocHtml(liveDoc), hasYState: docBlockCount(liveDoc) > 0, live: true });
        return;
      }
      // Same three tiers the editor hydrates from (snapshot → updates →
      // init_data), so a document that was never opened reads back too.
      const stored = await deps.persistence.loadDocument(documentId);
      if (!stored) {
        res.json({ html: '', hasYState: false, live: false });
        return;
      }
      const doc = new Y.Doc();
      Y.applyUpdate(doc, stored);
      res.json({ html: readDocHtml(doc), hasYState: docBlockCount(doc) > 0, live: false });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      log.error(`GET doc html failed for ${documentId}: ${msg}`);
      res.status(500).json({ error: msg });
    }
  });

  router.post('/doc/:documentId/html', async (req, res) => {
    const { documentId } = req.params;
    const html = (req.body as { html?: unknown } | undefined)?.html;
    if (typeof html !== 'string' || !html.trim()) {
      res.status(400).json({ error: 'html (non-empty string) is required' });
      return;
    }
    if (!parsesToBlocks(html)) {
      res.status(400).json({ error: 'html parsed to no blocks' });
      return;
    }

    try {
      const connection = await deps.server.hocuspocus.openDirectConnection(documentId);
      try {
        let wrongKind: string | null = null;
        let resultHtml = '';
        let blocks = 0;
        await connection.transact((doc) => {
          // Sheets, presentations and boards share this table and this service
          // but hold no BlockNote fragment — writing prose into one would add a
          // second root type the editor never reads and the preview pipeline
          // would then misclassify.
          const kind = detectPreviewKind(doc);
          if (kind !== 'blocknote') {
            wrongKind = kind;
            return;
          }
          replaceDocHtml(doc, html);
          resultHtml = readDocHtml(doc);
          blocks = docBlockCount(doc);
        });
        if (wrongKind !== null) {
          res.status(409).json({ error: `document is a ${wrongKind}, not a prose document` });
          return;
        }
        log.info(`Replaced prose of ${documentId} (${blocks} block(s))`);
        res.json({ ok: true, html: resultHtml, blocks });
      } finally {
        await connection.disconnect();
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      log.error(`POST doc html failed for ${documentId}: ${msg}`);
      res.status(500).json({ error: msg });
    }
  });

  // Raw Yjs bridge for callers that own the schema logic this service does not
  // import (anything but canvas state): read the full state, change a local copy,
  // send back only the diff. Yjs merges it with whatever happened in between.
  router.get('/doc/:documentId/yjs', async (req, res) => {
    const { documentId } = req.params;
    try {
      const liveDoc = deps.server.hocuspocus.documents.get(documentId);
      const state = liveDoc
        ? Y.encodeStateAsUpdate(liveDoc)
        : await deps.persistence.loadDocument(documentId);
      if (!state) {
        res.status(404).json({ error: 'document has no Yjs state' });
        return;
      }
      res.json({ update: Buffer.from(state).toString('base64'), live: liveDoc != null });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      log.error(`GET yjs failed for ${documentId}: ${msg}`);
      res.status(500).json({ error: msg });
    }
  });

  router.post('/doc/:documentId/yjs', async (req, res) => {
    const { documentId } = req.params;
    const body = (req.body ?? {}) as { update?: unknown; kind?: unknown };
    if (typeof body.update !== 'string' || !body.update || typeof body.kind !== 'string') {
      res.status(400).json({ error: 'update (base64) and kind are required' });
      return;
    }
    const update = new Uint8Array(Buffer.from(body.update, 'base64'));
    try {
      const live =
        (deps.server.hocuspocus.documents.get(documentId)?.getConnectionsCount() ?? 0) > 0;
      const connection = await deps.server.hocuspocus.openDirectConnection(documentId);
      try {
        let wrongKind: string | null = null;
        await connection.transact((doc) => {
          // Checked on the doc the update lands in, not on the caller's copy.
          const kind = detectPreviewKind(doc);
          if (kind !== body.kind) {
            wrongKind = kind;
            return;
          }
          Y.applyUpdate(doc, update, TRANSACT_ORIGIN);
        });
        if (wrongKind !== null) {
          res.status(409).json({ error: `document is a ${wrongKind}, not a ${body.kind}` });
          return;
        }
        log.info(`Applied ${update.byteLength}-byte Yjs update to ${documentId} (live=${live})`);
        res.json({ ok: true, live });
      } finally {
        await connection.disconnect();
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      log.error(`POST yjs failed for ${documentId}: ${msg}`);
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

  // Create task cards on a board's LIVE doc so they appear without a reload
  // (the async board agent has no browser session to apply them client-side).
  router.post('/board/:boardId/rows', async (req, res) => {
    const { boardId } = req.params;
    const body = (req.body ?? {}) as { rows?: unknown; userId?: unknown };
    const userId = typeof body.userId === 'string' ? body.userId : '';
    if (!Array.isArray(body.rows) || body.rows.length === 0 || !body.rows.every(isNewBoardRow)) {
      res.status(400).json({
        error: 'rows must be a non-empty array of {id?, title, status?, description?, dueDate?}',
      });
      return;
    }
    if (body.rows.length > MAX_ROWS_PER_CALL) {
      res.status(400).json({ error: `at most ${MAX_ROWS_PER_CALL} rows per call` });
      return;
    }

    try {
      const connection = await deps.server.hocuspocus.openDirectConnection(boardId);
      try {
        await connection.transact((doc) => {
          appendRowsToBoardDoc(doc, body.rows as NewBoardRow[], userId);
        });
        log.info(`Appended ${body.rows.length} row(s) to board ${boardId}`);
        res.json({ ok: true, added: body.rows.length });
      } finally {
        await connection.disconnect();
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      log.error(`POST rows failed for board ${boardId}: ${msg}`);
      res.status(500).json({ error: msg });
    }
  });

  // Queue chat-planned sheet ops on the doc. `live` tells the caller whether an
  // editor is connected right now (applies within a second) or the batch waits
  // for the next open — the chat answer must say which.
  router.post('/sheet/:sheetId/ops', async (req, res) => {
    const { sheetId } = req.params;
    const body = req.body as unknown;
    if (!isSheetOpsBatchInput(body)) {
      res.status(400).json({
        error: `operations must be a non-empty array of at most ${MAX_SHEET_OPS_PER_BATCH}`,
      });
      return;
    }

    try {
      const live = (deps.server.hocuspocus.documents.get(sheetId)?.getConnectionsCount() ?? 0) > 0;
      const connection = await deps.server.hocuspocus.openDirectConnection(sheetId);
      try {
        let wrongKind: string | null = null;
        let pending = 0;
        const batch: PendingSheetOps = {
          id: `ops-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          operations: body.operations,
          summary: body.summary ?? '',
          ts: Date.now(),
        };
        await connection.transact((doc) => {
          const kind = detectPreviewKind(doc);
          if (kind !== 'sheets') {
            wrongKind = kind;
            return;
          }
          pending = appendSheetOps(doc, batch);
        });
        if (wrongKind !== null) {
          res.status(409).json({ error: `document is a ${wrongKind}, not a sheet` });
          return;
        }
        log.info(`Queued ${body.operations.length} op(s) on sheet ${sheetId} (live=${live})`);
        res.json({ ok: true, id: batch.id, pending, live });
      } finally {
        await connection.disconnect();
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      log.error(`POST sheet ops failed for ${sheetId}: ${msg}`);
      res.status(500).json({ error: msg });
    }
  });

  router.post('/sheet/:sheetId/ops/claim', async (req, res) => {
    const { sheetId } = req.params;
    try {
      const connection = await deps.server.hocuspocus.openDirectConnection(sheetId);
      try {
        let batches: PendingSheetOps[] = [];
        await connection.transact((doc) => {
          batches = claimSheetOps(doc);
        });
        res.json({ batches });
      } finally {
        await connection.disconnect();
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      log.error(`POST sheet ops claim failed for ${sheetId}: ${msg}`);
      res.status(500).json({ error: msg });
    }
  });

  // First state of a site draft. The check and the write run in one transaction on the
  // live doc, so of two concurrent seeds exactly one lands; the second answers seeded:false.
  router.post(
    '/site/:siteId/seed',
    express.json({ limit: SITE_SEED_JSON_LIMIT }),
    async (req, res) => {
      const room = siteRoomOf(req.params.siteId);
      if (!room) {
        res.status(400).json({ error: 'siteId must be a uuid' });
        return;
      }
      const seed = parseSiteSeedUpdate((req.body as { update?: unknown } | null)?.update);
      if (!seed) {
        res.status(400).json({ error: 'update must be a base64 Yjs update that carries state' });
        return;
      }
      if (seed.stateBytes > SITE_DOC_MAX_BYTES) {
        res.status(413).json({
          error: `seed state is ${seed.stateBytes} bytes, over the ${SITE_DOC_MAX_BYTES}-byte cap`,
        });
        return;
      }
      const { update } = seed;
      try {
        const connection = await deps.server.hocuspocus.openDirectConnection(room);
        try {
          let seeded = false;
          await connection.transact((doc) => {
            seeded = applySiteSeed(doc, update);
          });
          log.info(
            `Site seed for ${room}: ${seeded ? `applied ${update.byteLength} bytes` : 'skipped, doc holds a current seed'}`
          );
          res.json({ seeded });
        } finally {
          await connection.disconnect();
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        log.error(`POST site seed failed for ${room}: ${msg}`);
        res.status(500).json({ error: msg });
      }
    }
  );

  // Called by the API after an access change (permission removed or changed,
  // share settings changed, document trashed, project left or trashed).
  router.post('/rooms/close', (req, res) => {
    const input = parseRoomCloseInput(req.body as unknown);
    if (!input) {
      res.status(400).json({
        error: 'rooms must be a non-empty array of room names, userId a string or null',
      });
      return;
    }
    const closed = closeRoomConnections(deps.server.hocuspocus, input.rooms, input.userId);
    log.info(
      `Closed ${closed} connection(s) in ${input.rooms.length} room(s)${input.userId ? ` for user ${input.userId}` : ''}`
    );
    res.json({ ok: true, closed });
  });

  app.use('/internal', router);
  log.info(
    'Internal API registered at /internal/canvas/*, /internal/doc/*/html, /internal/doc/*/yjs, /internal/board/*/comment-bump, /internal/board/*/rows, /internal/sheet/*/ops, /internal/site/*/seed and /internal/rooms/close'
  );
}
