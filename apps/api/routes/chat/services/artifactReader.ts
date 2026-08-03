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

import { formatBoardAsContext, loadBoardState } from '../../../services/boards/BoardService.js';
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
export type ArtifactReadKind = 'doc' | 'board' | 'sheet' | 'presentation' | 'pdf';

export const ARTIFACT_READ_KINDS: readonly ArtifactReadKind[] = [
  'doc',
  'board',
  'sheet',
  'presentation',
  'pdf',
];

/** `collaborative_documents.document_subtype` → the kind to read it as. */
export function subtypeToReadKind(subtype: string | null): ArtifactReadKind {
  if (subtype === 'boards') return 'board';
  if (subtype === 'sheets') return 'sheet';
  if (subtype === 'presentations') return 'presentation';
  if (subtype === 'pdf') return 'pdf';
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
    return deck ? formatPresentationAsContext(deck) : null;
  }
  return loadDocumentProse(id, userId);
}
