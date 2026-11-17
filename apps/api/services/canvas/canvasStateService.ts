/**
 * Canvas state façade over the Hocuspocus internal API.
 *
 * Yjs (served by services/hocuspocus) is the live authority for canvas state
 * once a document has been opened; `canvas_documents.initial_state` is a
 * derived mirror kept fresh on every chat edit so list/gallery reads and the
 * Hocuspocus-down fallback stay usable. Reads prefer the internal endpoint
 * (always fresh, includes unsaved in-flight edits); writes go through
 * `openDirectConnection` on the Hocuspocus side so an open studio tab sees
 * the change live.
 */
import { getPostgresInstance } from '../../database/services/PostgresService/PostgresService.js';
import { createLogger } from '../../utils/logger.js';

import {
  CanvasDocumentNewerError,
  CanvasDocumentNewerReadError,
  CanvasStateUnwritableError,
  CanvasWriteRefusedError,
} from './canvasWriteErrors.js';

export {
  CanvasDocumentNewerError,
  CanvasDocumentNewerReadError,
  CanvasStateUnwritableError,
  CanvasWriteRefusedError,
};

const log = createLogger('canvasStateService');

const INTERNAL_URL = process.env.HOCUSPOCUS_INTERNAL_URL || 'http://localhost:1241';
const INTERNAL_TOKEN = process.env.HOCUSPOCUS_INTERNAL_TOKEN || '';
const FETCH_TIMEOUT_MS = 5000;

const db = getPostgresInstance();

/** Code the Hocuspocus internal API answers a refused canvas write or read with (HTTP 426). */
const CANVAS_DOCUMENT_NEWER_CODE = 'CANVAS_DOCUMENT_NEWER';
/** Code it answers a value the canvas codec cannot store with (HTTP 400). */
const CANVAS_STATE_UNWRITABLE_CODE = 'CANVAS_STATE_UNWRITABLE';

/** Throws unless the internal write was accepted; a refusal becomes `CanvasDocumentNewerError`. */
async function assertInternalWriteAccepted(canvasId: string, res: Response): Promise<void> {
  if (res.ok) return;
  const text = await res.text().catch(() => '');
  if (res.status === 426 || res.status === 400) {
    let code: unknown = null;
    try {
      code = (JSON.parse(text) as { code?: unknown }).code;
    } catch {
      // not JSON: a plain 426/400 from somewhere else is an ordinary failure below
    }
    if (res.status === 426 && code === CANVAS_DOCUMENT_NEWER_CODE) {
      throw new CanvasDocumentNewerError(canvasId);
    }
    if (res.status === 400 && code === CANVAS_STATE_UNWRITABLE_CODE) {
      throw new CanvasStateUnwritableError(canvasId);
    }
  }
  throw new Error(`internal POST returned ${res.status}: ${text.slice(0, 200)}`);
}

export interface CanvasPageDef {
  id: string;
  configId: string;
  state: Record<string, unknown>;
  /** Optional config (serialized deck seeds). */
  config?: Record<string, unknown>;
}

/** Seed input: like CanvasPageDef but the id may be absent (assigned deterministically). */
type SeedPageInput = Omit<CanvasPageDef, 'id'> & { id?: unknown };

const isSeedPageArray = (v: unknown): v is SeedPageInput[] =>
  Array.isArray(v) &&
  v.length > 0 &&
  v.every(
    (p) =>
      !!p &&
      typeof p === 'object' &&
      typeof (p as SeedPageInput).configId === 'string' &&
      typeof (p as SeedPageInput).state === 'object' &&
      (p as SeedPageInput).state !== null
  );

interface InternalStateResponse {
  state: Record<string, unknown>;
  pages?: CanvasPageDef[];
  hasYState: boolean;
}

async function internalFetch(path: string, init?: RequestInit): Promise<Response> {
  if (!INTERNAL_TOKEN) throw new Error('HOCUSPOCUS_INTERNAL_TOKEN not configured');
  return fetch(`${INTERNAL_URL}${path}`, {
    ...init,
    headers: {
      'x-internal-token': INTERNAL_TOKEN,
      'content-type': 'application/json',
      ...(init?.headers ?? {}),
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
}

async function readInitialState(canvasId: string): Promise<Record<string, unknown> | null> {
  const rows = (await db.query(
    'SELECT initial_state FROM canvas_documents WHERE document_id = $1',
    [canvasId]
  )) as Array<{ initial_state: Record<string, unknown> | null }>;
  return rows[0]?.initial_state ?? null;
}

async function hasYjsRows(canvasId: string): Promise<boolean> {
  const rows = (await db.query(
    'SELECT 1 FROM yjs_document_updates WHERE document_id = $1 LIMIT 1',
    [canvasId]
  )) as unknown[];
  return rows.length > 0;
}

export interface CurrentCanvasState {
  state: Record<string, unknown>;
  source: 'yjs' | 'initial_state';
}

/**
 * The live state, or null when Hocuspocus cannot answer (callers fall back to the mirror).
 * Throws `CanvasDocumentNewerReadError` when it refuses on purpose: a document newer than the
 * server is not answered from the mirror either.
 */
async function fetchInternalState(canvasId: string): Promise<InternalStateResponse | null> {
  try {
    const res = await internalFetch(`/internal/canvas/${encodeURIComponent(canvasId)}/state`);
    if (res.ok) return (await res.json()) as InternalStateResponse;
    if (res.status === 426) {
      const code = ((await res.json().catch(() => null)) as { code?: unknown } | null)?.code;
      if (code === CANVAS_DOCUMENT_NEWER_CODE) throw new CanvasDocumentNewerReadError(canvasId);
    }
    log.warn(`internal GET state for ${canvasId} returned ${res.status}`);
  } catch (err) {
    if (err instanceof CanvasDocumentNewerReadError) throw err;
    log.warn(`internal GET state for ${canvasId} failed: ${err}`);
  }
  return null;
}

export async function getCurrentCanvasState(canvasId: string): Promise<CurrentCanvasState> {
  const body = await fetchInternalState(canvasId);
  if (body?.hasYState) return { state: body.state, source: 'yjs' };
  return { state: (await readInitialState(canvasId)) ?? {}, source: 'initial_state' };
}

export interface ApplyPatchOptions {
  /**
   * Full state to seed a never-opened Yjs doc with (initial_state merged with
   * the patch). Without it a later studio open would only see the patch keys.
   */
  seedState: Record<string, unknown>;
  /**
   * The state the patch was computed from (what the caller read before its work), per patched
   * key. Sent along so the server merges the patch into the document as it is now instead of
   * replacing whole collections: an edit a client made in between survives. Without it the
   * patch is written as given.
   */
  base?: Record<string, unknown>;
}

/**
 * Apply a flat state patch. Primary path is the Hocuspocus internal endpoint
 * (live broadcast + persistence). When Hocuspocus is unreachable the patch is
 * still safe to apply to `initial_state` alone — but only while the doc has
 * no Yjs rows (otherwise Yjs would win on next open and the edit would be
 * silently lost, so we fail instead).
 */
export async function applyCanvasStatePatch(
  canvasId: string,
  patch: Record<string, unknown>,
  options: ApplyPatchOptions
): Promise<void> {
  let internalOk = false;
  try {
    const res = await internalFetch(`/internal/canvas/${encodeURIComponent(canvasId)}/state`, {
      method: 'POST',
      body: JSON.stringify({
        patch,
        seedState: options.seedState,
        ...(options.base ? { base: options.base } : {}),
      }),
    });
    await assertInternalWriteAccepted(canvasId, res);
    internalOk = true;
  } catch (err) {
    if (err instanceof CanvasWriteRefusedError) throw err;
    if (await hasYjsRows(canvasId)) {
      throw new Error(
        `Canvas-Status konnte nicht aktualisiert werden (Collab-Dienst nicht erreichbar): ${err}`
      );
    }
    log.warn(
      `Hocuspocus unreachable for ${canvasId}; doc has no Yjs state — ` +
        `applying patch to initial_state only (${err})`
    );
  }

  await db.query(
    `UPDATE canvas_documents
     SET initial_state = COALESCE(initial_state, '{}'::jsonb) || $2::jsonb,
         updated_at = CURRENT_TIMESTAMP
     WHERE document_id = $1`,
    [canvasId, JSON.stringify(patch)]
  );

  log.info(`Patched canvas ${canvasId} (${Object.keys(patch).length} key(s), yjs=${internalOk})`);
}

/**
 * Authoritatively seed a freshly created canvas's Yjs pages server-side,
 * BEFORE any studio tab opens. The internal endpoint stamps the
 * `meta.pagesSeeded` watermark so a client never writes template defaults
 * over it. Uses the client's deterministic seed ids (`seed-<index>`) so a
 * racing client seed converges onto the same pages instead of duplicating
 * the deck. Tolerant: on failure the client seed is the fallback.
 */
export async function seedCanvasPages(
  canvasId: string,
  templateType: string,
  initialState: Record<string, unknown>
): Promise<void> {
  // Accept page defs WITHOUT ids too (client-composed InitialPageDef shape)
  // and assign the same deterministic ids the client would — collapsing them
  // to a single page would watermark the doc and permanently block the
  // client's multi-page fallback seed.
  const statePages = initialState.pages;
  const pages: CanvasPageDef[] = isSeedPageArray(statePages)
    ? statePages.map((p, i) => ({ ...p, id: typeof p.id === 'string' ? p.id : `seed-${i}` }))
    : [
        {
          id: 'seed-0',
          configId: templateType,
          state: Object.fromEntries(Object.entries(initialState).filter(([k]) => k !== 'pages')),
        },
      ];
  try {
    const res = await internalFetch(`/internal/canvas/${encodeURIComponent(canvasId)}/state`, {
      method: 'POST',
      body: JSON.stringify({ seedPages: pages }),
    });
    await assertInternalWriteAccepted(canvasId, res);
  } catch (err) {
    if (err instanceof CanvasDocumentNewerError) throw err;
    log.warn(`Page seed for ${canvasId} failed (client seed is the fallback): ${err}`);
  }
}

// ---------------------------------------------------------------------------
// Multi-page (slider deck) variants of the read/write paths. Deck state lives
// per page in the Yjs `pages` array; root formState is never used for decks.
// ---------------------------------------------------------------------------

const isPageDefArray = (v: unknown): v is CanvasPageDef[] =>
  Array.isArray(v) &&
  v.every(
    (p) =>
      !!p &&
      typeof p === 'object' &&
      typeof (p as CanvasPageDef).id === 'string' &&
      typeof (p as CanvasPageDef).configId === 'string' &&
      typeof (p as CanvasPageDef).state === 'object'
  );

export interface CurrentDeckState {
  pages: CanvasPageDef[];
  source: 'yjs' | 'initial_state';
}

export async function getCurrentDeckState(canvasId: string): Promise<CurrentDeckState> {
  const body = await fetchInternalState(canvasId);
  if (body?.hasYState && isPageDefArray(body.pages) && body.pages.length > 0) {
    return { pages: body.pages, source: 'yjs' };
  }
  const initial = await readInitialState(canvasId);
  const pages = initial?.pages;
  return { pages: isPageDefArray(pages) ? pages : [], source: 'initial_state' };
}

/**
 * Everything a frozen copy of a canvas needs: every page (any canvas can hold
 * several — not only slider decks), with the first page's flat keys beside
 * `pages` for gallery and thumbnail readers. `pageCount` is null when the
 * canvas has no page list at all (a flat, never-paged state).
 */
export async function getCanvasSnapshotState(
  canvasId: string
): Promise<{ state: Record<string, unknown>; pageCount: number | null }> {
  const body = await fetchInternalState(canvasId);
  const yjsPages = body?.hasYState ? body.pages : undefined;
  if (isPageDefArray(yjsPages) && yjsPages.length > 0) {
    return { state: { ...yjsPages[0]!.state, pages: yjsPages }, pageCount: yjsPages.length };
  }
  const initial = await readInitialState(canvasId);
  const initialPages = initial?.pages;
  if (isPageDefArray(initialPages) && initialPages.length > 0) {
    return {
      state: { ...initialPages[0]!.state, pages: initialPages },
      pageCount: initialPages.length,
    };
  }
  return { state: body?.hasYState ? body.state : (initial ?? {}), pageCount: null };
}

export interface DeckChangesInput {
  /**
   * Full page set to seed a never-seeded Yjs doc with. Always sent — the
   * Hocuspocus side ignores it when pages already exist, so this doubles as
   * the retry-seed for decks whose mint happened while Hocuspocus was down.
   */
  seedPages: CanvasPageDef[];
  pagePatches?: Array<{
    pageId: string;
    patch: Record<string, unknown>;
    /** What the patch was computed from, per patched key; see `ApplyPatchOptions.base`. */
    base?: Record<string, unknown>;
  }>;
  pageOps?: Array<
    { op: 'add'; index: number; page: CanvasPageDef } | { op: 'remove'; pageId: string }
  >;
  replacePages?: CanvasPageDef[];
  /** Resulting full deck after the changes — mirrored into canvas_documents. */
  newPages: CanvasPageDef[];
}

/**
 * Apply deck changes (per-page patches, add/remove, restore). Mirrors the
 * resulting deck into `canvas_documents.initial_state` as a FULL replace —
 * jsonb `||` cannot deep-merge the pages array. Flat cover keys are kept
 * alongside `pages` so gallery/thumbnail readers and the Hocuspocus-down
 * fallback keep rendering something.
 */
export async function applyDeckChanges(canvasId: string, changes: DeckChangesInput): Promise<void> {
  let internalOk = false;
  try {
    const res = await internalFetch(`/internal/canvas/${encodeURIComponent(canvasId)}/state`, {
      method: 'POST',
      body: JSON.stringify({
        seedPages: changes.seedPages,
        ...(changes.pagePatches ? { pagePatches: changes.pagePatches } : {}),
        ...(changes.pageOps ? { pageOps: changes.pageOps } : {}),
        ...(changes.replacePages ? { replacePages: changes.replacePages } : {}),
      }),
    });
    await assertInternalWriteAccepted(canvasId, res);
    internalOk = true;
  } catch (err) {
    if (err instanceof CanvasWriteRefusedError) throw err;
    if (await hasYjsRows(canvasId)) {
      throw new Error(
        `Folien konnten nicht aktualisiert werden (Collab-Dienst nicht erreichbar): ${err}`
      );
    }
    log.warn(
      `Hocuspocus unreachable for ${canvasId}; doc has no Yjs state — ` +
        `updating initial_state only (${err})`
    );
  }

  const coverState = changes.newPages[0]?.state ?? {};
  await db.query(
    `UPDATE canvas_documents
     SET initial_state = $2::jsonb,
         page_count = $3::int,
         updated_at = CURRENT_TIMESTAMP
     WHERE document_id = $1`,
    [canvasId, JSON.stringify({ ...coverState, pages: changes.newPages }), changes.newPages.length]
  );

  log.info(
    `Applied deck changes to canvas ${canvasId} ` +
      `(pages=${changes.newPages.length}, patches=${changes.pagePatches?.length ?? 0}, ` +
      `ops=${changes.pageOps?.length ?? 0}, restore=${changes.replacePages ? 'yes' : 'no'}, yjs=${internalOk})`
  );
}
