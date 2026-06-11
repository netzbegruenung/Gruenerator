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

const log = createLogger('canvasStateService');

const INTERNAL_URL = process.env.HOCUSPOCUS_INTERNAL_URL || 'http://localhost:1241';
const INTERNAL_TOKEN = process.env.HOCUSPOCUS_INTERNAL_TOKEN || '';
const FETCH_TIMEOUT_MS = 5000;

const db = getPostgresInstance();

interface InternalStateResponse {
  state: Record<string, unknown>;
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

export async function getCurrentCanvasState(canvasId: string): Promise<CurrentCanvasState> {
  try {
    const res = await internalFetch(`/internal/canvas/${encodeURIComponent(canvasId)}/state`);
    if (res.ok) {
      const body = (await res.json()) as InternalStateResponse;
      if (body.hasYState) return { state: body.state, source: 'yjs' };
    } else {
      log.warn(`internal GET state for ${canvasId} returned ${res.status}`);
    }
  } catch (err) {
    log.warn(`internal GET state for ${canvasId} failed: ${err}`);
  }
  return { state: (await readInitialState(canvasId)) ?? {}, source: 'initial_state' };
}

export interface ApplyPatchOptions {
  /**
   * Full state to seed a never-opened Yjs doc with (initial_state merged with
   * the patch). Without it a later studio open would only see the patch keys.
   */
  seedState: Record<string, unknown>;
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
      body: JSON.stringify({ patch, seedState: options.seedState }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`internal POST returned ${res.status}: ${text.slice(0, 200)}`);
    }
    internalOk = true;
  } catch (err) {
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
