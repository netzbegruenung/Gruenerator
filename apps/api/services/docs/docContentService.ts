/**
 * Document-content façade over the Hocuspocus internal API — the doc-shaped
 * twin of `canvasStateService`, and for the same reason.
 *
 * Yjs is the authority for a collaborative document. The editor hydrates from
 * snapshots → `yjs_document_updates` → `collaborative_documents_init`, in that
 * order; `collaborative_documents.content` appears in NONE of them. That column
 * is a derived 2000-character preview written by the Hocuspocus store hook
 * (`updateContentPreview`), so it can be read as a card teaser and never as the
 * document.
 *
 * Reads prefer the internal endpoint (live doc first, so unsaved in-flight
 * edits count); writes go through `openDirectConnection` there, which makes an
 * open editor tab show the change without a reload and lets the normal store
 * hook persist it and refresh the preview.
 *
 * Fallback when Hocuspocus is unreachable is deliberately narrow: it is safe
 * only while the document has no Yjs rows at all, because Yjs would otherwise
 * win on the next open and the write would vanish. In that case we fail loudly
 * instead — the whole point of this file is that a write either lands where the
 * editor reads or is reported as a failure.
 */
import { blockNoteXmlToHtml, PostgresPersistence } from '@gruenerator/hocuspocus';
import * as Y from 'yjs';

import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { createLogger } from '../../utils/logger.js';

import { writeYjsInitState } from './seedYjsState.js';

const log = createLogger('docContentService');

const INTERNAL_URL = process.env.HOCUSPOCUS_INTERNAL_URL || 'http://localhost:1241';
const INTERNAL_TOKEN = process.env.HOCUSPOCUS_INTERNAL_TOKEN || '';
const FETCH_TIMEOUT_MS = 5000;

const DOCUMENT_FRAGMENT_NAME = 'document-store';

const db = getPostgresInstance();

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

/**
 * Decode the persisted state in-process. Reuses the editor's own loader rather
 * than re-implementing the tier order — a second implementation is exactly how
 * `content` came to be read as the document in the first place.
 */
async function loadStoredHtml(docId: string): Promise<string> {
  const persistence = new PostgresPersistence((sql, params) =>
    db.query<Record<string, unknown>>(sql, params ?? [])
  );
  const stored = await persistence.loadDocument(docId);
  if (!stored) return '';
  const doc = new Y.Doc();
  Y.applyUpdate(doc, stored);
  return blockNoteXmlToHtml(doc.getXmlFragment(DOCUMENT_FRAGMENT_NAME).toString());
}

async function hasYjsRows(docId: string): Promise<boolean> {
  const rows = await db.query(
    `SELECT 1 FROM yjs_document_snapshots WHERE document_id = $1
     UNION ALL
     SELECT 1 FROM yjs_document_updates WHERE document_id = $1
     LIMIT 1`,
    [docId]
  );
  return rows.length > 0;
}

export interface DocumentHtml {
  html: string;
  /** `yjs` whenever real state was decoded; `none` for a genuinely empty doc. */
  source: 'yjs' | 'none';
  /** True when the answer came from a document currently open in an editor. */
  live: boolean;
}

/**
 * The document's current prose as BlockNote HTML — the same bytes the editor
 * shows, not the truncated preview column.
 */
export async function getDocumentHtml(docId: string): Promise<DocumentHtml> {
  try {
    const res = await internalFetch(`/internal/doc/${encodeURIComponent(docId)}/html`);
    if (res.ok) {
      const body = (await res.json()) as { html?: unknown; live?: unknown; hasYState?: unknown };
      const html = typeof body.html === 'string' ? body.html : '';
      if (html.trim()) return { html, source: 'yjs', live: body.live === true };
      // An empty answer from a reachable service is a real answer for a live
      // doc (someone cleared it); for a non-live one it can also mean the
      // endpoint predates this deploy, so fall through to the local decode.
      if (body.live === true) return { html: '', source: 'none', live: true };
    } else {
      log.warn(`internal GET doc html for ${docId} returned ${res.status}`);
    }
  } catch (err) {
    log.warn(`internal GET doc html for ${docId} failed: ${err}`);
  }

  const html = await loadStoredHtml(docId);
  return { html, source: html.trim() ? 'yjs' : 'none', live: false };
}

export interface ReplaceResult {
  /** The prose as it now stands, read back after the write. */
  html: string;
  /** True when the new version went into the live Yjs doc (the normal path). */
  live: boolean;
}

/**
 * Replace a document's prose. Throws when the new version could not be put
 * where the editor reads it — callers must not report success on a throw.
 */
export async function replaceDocumentHtml(
  docId: string,
  html: string,
  opts: { userId: string }
): Promise<ReplaceResult> {
  if (!html.trim()) throw new Error('Leerer Dokumentinhalt — nichts zu schreiben.');

  let internalError: unknown = null;
  try {
    const res = await internalFetch(`/internal/doc/${encodeURIComponent(docId)}/html`, {
      method: 'POST',
      body: JSON.stringify({ html }),
    });
    if (res.ok) {
      const body = (await res.json()) as { html?: unknown };
      await db.query(
        'UPDATE collaborative_documents SET last_edited_by = $1, updated_at = NOW() WHERE id = $2',
        [opts.userId, docId]
      );
      // `content` is intentionally NOT written here — the Hocuspocus store hook
      // derives it from the same Y.Doc moments later.
      return { html: typeof body.html === 'string' ? body.html : html, live: true };
    }
    const text = await res.text().catch(() => '');
    internalError = new Error(`internal POST returned ${res.status}: ${text.slice(0, 200)}`);
  } catch (err) {
    internalError = err;
  }

  if (await hasYjsRows(docId)) {
    throw new Error(
      `Dokument konnte nicht geschrieben werden (Collab-Dienst nicht erreichbar): ${internalError}`
    );
  }

  // No Yjs rows: the document has never been opened, so `init_data` is the tier
  // the first connection will hydrate from and overwriting it is safe.
  const seeded = await writeYjsInitState(docId, html);
  if (!seeded) {
    throw new Error(
      `Dokument konnte nicht geschrieben werden (Yjs-Seed schlug fehl): ${internalError}`
    );
  }
  await db.query(
    'UPDATE collaborative_documents SET content = $1, last_edited_by = $2, updated_at = NOW() WHERE id = $3',
    [html, opts.userId, docId]
  );
  log.warn(
    `Hocuspocus unreachable for ${docId}; doc has no Yjs state — wrote init_data + content (${internalError})`
  );
  return { html, live: false };
}
