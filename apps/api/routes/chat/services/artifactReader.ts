/**
 * Reading an artifact BACK — the one place that knows how.
 *
 * Every artifact kind could already be loaded server-side (`loadSheetState`,
 * `loadPresentationState`, `loadBoardState`, `loadDocumentProse`), but the only
 * tool wired to any of them was `read_user_content` inside the recall loop —
 * a lane the agentic loop never enters. In the agentic loop the nearest thing
 * was `documents` action="get", which returns `{title, url, type}` and no
 * content at all.
 *
 * So "vergleiche das PDF und die Präsentation" was not a hard task, it was an
 * impossible one: nothing mounted could open either file. On 03.08.2026 the
 * model answered it anyway, with which slide had been corrected and that the
 * source matrix was complete.
 *
 * PDFs are the kind that had no loader at all. They are compute assets on disk
 * rather than collaborative documents, and their id is a FILE NAME (`uuid.pdf`)
 * where every other kind's is a UUID — which is why passing one into a
 * `$1::uuid` query is a 22P02 and passing it to `documents` is "nicht gefunden".
 * That asymmetry is contained here: one function, one union, no caller has to
 * remember which kind carries which id.
 */
import { readFile } from 'node:fs/promises';

import { getPostgresInstance } from '../../../database/services/PostgresService.js';
import { formatBoardAsContext, loadBoardState } from '../../../services/boards/BoardService.js';
import { loadCanvasAsContext } from '../../../services/canvas/canvasContext.js';
import { getQdrantDocumentService } from '../../../services/document-services/DocumentSearchService/DocumentSearchService.js';
import { readSourceText } from '../../../services/notebook/notebookSources.js';
import { extractPdfText } from '../../../services/pdf/pdfText.js';
import {
  formatPresentationAsContext,
  loadPresentationState,
} from '../../../services/presentations/PresentationGenerationService.js';
import {
  formatSheetAsContext,
  loadSheetState,
} from '../../../services/sheets/SheetGenerationService.js';
import { createLogger } from '../../../utils/logger.js';
import { loadDocumentProse } from '../../docs/docProseReader.js';

import { resolveComputeAssetPath } from './computeAssetStorage.js';

const log = createLogger('ArtifactReader');

/**
 * The readable kinds. `chat` is deliberately absent — a thread is not an
 * artifact and has its own reader (`getThreadRecallContext`) with its own
 * access rules.
 */
export type ArtifactReadKind =
  'doc' | 'board' | 'sheet' | 'presentation' | 'pdf' | 'canvas' | 'file';

export const ARTIFACT_READ_KINDS: readonly ArtifactReadKind[] = [
  'doc',
  'board',
  'sheet',
  'presentation',
  'pdf',
  'canvas',
  'file',
];

/** `collaborative_documents.document_subtype` → the kind to read it as. */
export function subtypeToReadKind(subtype: string | null): ArtifactReadKind {
  if (subtype === 'boards') return 'board';
  if (subtype === 'sheets') return 'sheet';
  if (subtype === 'presentations') return 'presentation';
  if (subtype === 'pdf') return 'pdf';
  if (subtype === 'canvas') return 'canvas';
  return 'doc';
}

/**
 * A PDF the chat generated, read back from the user's asset directory.
 *
 * `resolveComputeAssetPath` is the containment check the download route uses —
 * shape (`{uuid}.{ext}`) plus a resolved-path check against the user's own
 * directory. Reusing it rather than joining paths here is what keeps a crafted
 * `id` from reaching outside (js/path-injection).
 */
async function readPdfAsset(userId: string, fileName: string): Promise<string | null> {
  const filePath = resolveComputeAssetPath(userId, fileName);
  if (!filePath) return null;
  try {
    const bytes = await readFile(filePath);
    return await extractPdfText(new Uint8Array(bytes));
  } catch (error) {
    // Missing (expired after 90 days), unreadable, or not a PDF. All three are
    // "no content" to the caller; the reason belongs in the log, not in a
    // thrown error that would abort a tool the model can still work without.
    log.warn(
      `[ArtifactReader] PDF ${fileName} not readable: ${error instanceof Error ? error.message : error}`
    );
    return null;
  }
}

/**
 * The artifact's content as plain text, or null when it does not exist, is not
 * this user's, or holds nothing readable.
 *
 * Access control is the loaders' own: each `load*State` takes the userId and
 * returns null for a document the caller may not see. Nothing here widens that.
 */
export async function readArtifactContent(opts: {
  id: string;
  kind: ArtifactReadKind;
  userId: string;
}): Promise<string | null> {
  const { id, kind, userId } = opts;
  if (!id.trim()) return null;

  if (kind === 'pdf') return readPdfAsset(userId, id);
  if (kind === 'file') return readUploadedFile(id, userId);
  if (kind === 'board') {
    const board = await loadBoardState(id, userId);
    return board ? formatBoardAsContext(board) : null;
  }
  if (kind === 'sheet') {
    const sheet = await loadSheetState(id, userId);
    return sheet ? formatSheetAsContext(sheet) : null;
  }
  if (kind === 'presentation') {
    const deck = await loadPresentationState(id, userId);
    if (deck) return formatPresentationAsContext(deck);
    // A deck the chat made is a canvas; the thread still calls it a presentation.
    return loadCanvasAsContext(id, userId);
  }
  if (kind === 'canvas') return loadCanvasAsContext(id, userId);
  return loadDocumentProse(id, userId);
}

/**
 * Ein Artefakt, das es gibt und das die Person lesen darf, dessen Text aber
 * (noch) nicht vorliegt. Eigene Klasse, damit das Werkzeug es nicht als
 * „nicht gefunden oder leer" meldet: das Modell schlösse daraus, die Datei
 * sei leer, und antwortete ohne sie.
 */
export class ArtifactNotReadableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ArtifactNotReadableError';
  }
}

/**
 * Eine hochgeladene Datei bzw. ein eingefügter Text (`documents`): der eigene
 * oder einer, der in ein Projekt geteilt ist, in dem die Person aktives
 * Mitglied ist — dieselbe Regel wie der Suchbereich der Projekt-Chats
 * (`projectFiles.ts`). Gelesen wird wie in `notebook_quellen` read
 * (`readSourceText`): der gespeicherte Originaltext mit seiner Struktur, sonst
 * die Chunks unter der Besitzer-ID, die die Prüfung hier eben zugelassen hat.
 * Ein Ausfall des Chunk-Speichers wirft und wird im Werkzeug als Ausfall
 * gemeldet, nie als leere Datei.
 */
let fileTextService: ReturnType<typeof getQdrantDocumentService> | null = null;

async function readUploadedFile(id: string, userId: string): Promise<string | null> {
  const db = getPostgresInstance();
  const rows = (await db.query(
    `SELECT d.title, d.user_id, d.status
       FROM documents d
      WHERE d.id = $1::uuid AND d.deleted_at IS NULL AND d.user_id IS NOT NULL
        AND (d.user_id = $2::uuid OR EXISTS (
              SELECT 1 FROM group_content_shares gcs
                JOIN groups g ON g.id = gcs.group_id AND g.deleted_at IS NULL
                  AND COALESCE(g.is_active, TRUE) = TRUE
                JOIN group_memberships gm ON gm.group_id = g.id AND gm.user_id = $2::uuid
                  AND gm.is_active = TRUE
               WHERE gcs.content_type = 'documents' AND gcs.content_id = d.id::text))
      LIMIT 1`,
    [id, userId]
  )) as { title: string | null; user_id: string; status: string | null }[];
  const row = rows[0];
  if (!row) return null;
  if (row.status === 'failed') {
    throw new ArtifactNotReadableError(
      'Die Datei ließ sich beim Hochladen nicht einlesen — ihr Text ist nicht verfügbar. Sag der Person, dass sie die Datei erneut hochladen kann.'
    );
  }
  if (row.status !== 'completed') {
    throw new ArtifactNotReadableError(
      'Die Datei wird gerade noch eingelesen — ihr Text ist erst danach lesbar. Das heißt nicht, dass sie leer ist.'
    );
  }
  fileTextService ??= getQdrantDocumentService();
  let text: string;
  try {
    ({ text } = await readSourceText(
      { sourceId: id, ownerUserId: row.user_id },
      { db, documentService: fileTextService }
    ));
  } catch (err) {
    log.warn(`[readUploadedFile] text of ${id} unavailable:`, err);
    throw new ArtifactNotReadableError(
      'Der Text der Datei ließ sich gerade nicht laden — das heißt nicht, dass sie leer ist. Sag das der Person, statt den Inhalt zu raten.'
    );
  }
  if (!text.trim()) return null;
  return row.title ? `# ${row.title}\n\n${text}` : text;
}
