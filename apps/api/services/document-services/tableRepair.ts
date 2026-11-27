/**
 * Tabellen-Reparatur für bestehende Nutzerquellen (Admin, `/admin/tabellen`).
 *
 * Zwei Verbesserungen wirken nur auf neu gelesene Dateien: die Tabellenerkennung
 * in PDFs (`OcrService/tableDetection.ts`, 1 em statt 2 em) und das Lesen von
 * Tabellendateien als Markdown (`spreadsheetText.ts`). Diese Prüfung findet die
 * Quellen, bei denen ein neuer Lauf etwas ändern würde, und reiht sie über das
 * gewöhnliche „Neu indexieren" ein — dessen Absicherung gilt unverändert: die
 * alte Fassung bleibt, bis die neue steht, und die Einwilligung der
 * Eigentümer*in wird geprüft.
 *
 * Geprüft wird seitenweise und ohne gespeicherten Zustand: jeder Aufruf liest
 * höchstens `limit` Zeilen ab dem Cursor, die Seite sammelt die Befunde. Kein
 * Aufruf läuft lange, und ein abgebrochener Lauf hinterlässt nichts.
 *
 * Bewusst ohne Titel und Dateinamen in der Antwort — nur Kennung, Dateityp und
 * betroffene Seiten. Wer eine Quelle ansehen will, öffnet sie im Chunk-Inspektor.
 */
import path from 'path';

import {
  resolveDocumentUploadFormat,
  type TableRepairFinding,
  type TableRepairResultStatus,
  type TableRepairSource,
  type TableRepairState,
} from '@gruenerator/contracts';

import {
  keptOriginalPath,
  reindexOrigin,
  type ReindexRow,
} from './DocumentProcessingService/reindexOrigin.js';
import { hasMarkdownTable } from './TextChunker/blockSegmentation.js';

export interface TableRepairRow extends ReindexRow {
  extraction_method: string | null;
}

export interface TableRepairDeps {
  db: { query: <T>(sql: string, params: unknown[]) => Promise<T[]> };
  /** Seiten (1-basiert), die `pageHasTable` in der PDF-Datei erkennt. */
  detectTablePages: (absolutePath: string) => Promise<number[]>;
}

/** Diese Wege haben die ganze Datei per OCR gelesen — die Erkennung spielte keine Rolle. */
const WHOLE_FILE_OCR = new Set(['mistral-ocr', 'docling']);

const MARKER_LINE = /^##[ \t]*Seite[ \t]+(\d+)[ \t]*$/gm;

/** Je Seite: trägt der gespeicherte Text dort eine Markdown-Tabelle? */
export function storedTablePages(text: string): { marked: boolean; pages: Set<number> } {
  const markers = [...text.matchAll(MARKER_LINE)];
  const pages = new Set<number>();
  for (const [i, marker] of markers.entries()) {
    const end = i + 1 < markers.length ? markers[i + 1].index : text.length;
    if (hasMarkdownTable(text.slice(marker.index, end))) pages.add(Number(marker[1]));
  }
  return { marked: markers.length > 0, pages };
}

export async function classifyForTableRepair(
  row: TableRepairRow,
  deps: Pick<TableRepairDeps, 'detectTablePages'>
): Promise<TableRepairFinding> {
  const extension = resolveDocumentUploadFormat(row.filename ?? '', '')?.extension ?? '';
  const stored = row.markdown_content ?? '';
  const finding = (
    state: TableRepairState,
    source: TableRepairSource | null = null,
    missedPages: number[] = []
  ): TableRepairFinding => ({ documentId: row.id, extension, state, source, missedPages });

  const origin = reindexOrigin(row);
  const source: TableRepairSource | null =
    origin?.kind === 'wolke' || origin?.kind === 'original' || origin?.kind === 'stored-text'
      ? origin.kind
      : null;

  if (extension !== '.pdf') {
    if (hasMarkdownTable(stored)) return finding('ok');
    return source ? finding('fixable', source) : finding('no_original');
  }

  if (row.extraction_method && WHOLE_FILE_OCR.has(row.extraction_method)) return finding('ok');
  if (source === 'wolke') return finding('wolke_unchecked', 'wolke');
  const originalPath = source === 'original' ? keptOriginalPath(row) : null;
  if (!originalPath) return finding('no_original');

  let detected: number[];
  try {
    detected = await deps.detectTablePages(originalPath);
  } catch {
    return finding('unreadable', 'original');
  }
  const { marked, pages } = storedTablePages(stored);
  const missed = marked
    ? detected.filter((page) => !pages.has(page))
    : hasMarkdownTable(stored)
      ? []
      : detected;
  return missed.length > 0 ? finding('fixable', 'original', missed) : finding('ok');
}

const SCAN_FILTER = `deleted_at IS NULL
         AND status = 'completed'
         AND user_id IS NOT NULL
         AND lower(filename) ~ '\\.(pdf|csv|xlsx|xls|ods)$'`;

export async function scanForTableRepair(
  deps: TableRepairDeps,
  cursor: string | null,
  limit: number
): Promise<{ findings: TableRepairFinding[]; nextCursor: string | null; total: number | null }> {
  const rows = await deps.db.query<TableRepairRow>(
    `SELECT id, user_id, filename, status, wolke_share_link_id, wolke_file_path, file_path,
            markdown_content, vector_count, metadata->>'extractionMethod' AS extraction_method
       FROM documents
      WHERE ${SCAN_FILTER}
        AND ($1::uuid IS NULL OR id > $1::uuid)
      ORDER BY id
      LIMIT $2`,
    [cursor, limit]
  );
  const total =
    cursor === null
      ? Number(
          (
            await deps.db.query<{ count: string }>(
              `SELECT count(*) AS count FROM documents WHERE ${SCAN_FILTER}`,
              []
            )
          )[0]?.count ?? 0
        )
      : null;

  const findings: TableRepairFinding[] = [];
  for (const row of rows) findings.push(await classifyForTableRepair(row, deps));
  return {
    findings,
    nextCursor: rows.length === limit ? (rows[rows.length - 1]?.id ?? null) : null,
    total,
  };
}

/** pdfjs wie beim Ingest (`OcrService.openPdfDocument`), danach nur die Tabellenerkennung. */
export async function detectPdfTablePages(absolutePath: string): Promise<number[]> {
  const [{ ocrService }, { pageHasTable }] = await Promise.all([
    import('../OcrService/index.js'),
    import('../OcrService/tableDetection.js'),
  ]);
  // Boundary: pdfjs-dist ist hier untypisiert (siehe pdfOperations.ts).
  const doc = (await ocrService.openPdfDocument(path.resolve(absolutePath))) as {
    numPages: number;
    getPage: (n: number) => Promise<{ getTextContent: () => Promise<{ items: unknown[] }> }>;
    loadingTask: { destroy: () => Promise<void> };
  };
  try {
    const pages: number[] = [];
    for (let page = 1; page <= Math.min(doc.numPages, 1000); page++) {
      const content = await (await doc.getPage(page)).getTextContent();
      if (pageHasTable(content.items as Parameters<typeof pageHasTable>[0])) pages.push(page);
    }
    return pages;
  } finally {
    // pdfjs 6: destroy() sitzt am Ladeauftrag, nicht am Dokument.
    await doc.loadingTask.destroy();
  }
}

/**
 * Reiht Quellen über das gewöhnliche „Neu indexieren" ein, im Namen der
 * Eigentümer*in — deren Einwilligung prüft `reindexDocument`. Ob eine Quelle
 * reparierbar ist, entscheidet dort `reindexOrigin`, nicht die Liste der Seite.
 */
export async function repairTables(
  documentIds: readonly string[],
  deps: {
    db: TableRepairDeps['db'];
    reindex: (documentId: string, ownerId: string) => Promise<{ status: TableRepairResultStatus }>;
  }
): Promise<Array<{ documentId: string; status: TableRepairResultStatus }>> {
  const results: Array<{ documentId: string; status: TableRepairResultStatus }> = [];
  for (const documentId of new Set(documentIds)) {
    const owner = (
      await deps.db.query<{ user_id: string | null }>(
        'SELECT user_id FROM documents WHERE id = $1 AND deleted_at IS NULL',
        [documentId]
      )
    )[0]?.user_id;
    results.push({
      documentId,
      status: owner ? (await deps.reindex(documentId, owner)).status : 'not_found',
    });
  }
  return results;
}
