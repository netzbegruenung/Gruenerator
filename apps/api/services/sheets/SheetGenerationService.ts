/**
 * Sheet generation service (Univer spreadsheets, subtype 'sheets').
 *
 * Chat-side lifecycle of a sheet: generate a structured sheet from a prompt
 * (create_sheet intent / sheet-erstellen forced tool), create the
 * collaborative_documents row, and seed the Y.Doc so the editor's collab
 * bridge finds a workbook snapshot on first open. Also the server-side
 * reader that renders a sheet's current state as markdown for @mention
 * context injection.
 *
 * Mirrors boards/BoardService.ts (generation prompt + parse + create + load
 * + format) and docs/seedYjsState.ts (gzipped Y.Doc into
 * collaborative_documents_init).
 */

import { promisify } from 'util';
import { gunzip, gzip } from 'zlib';

import * as Y from 'yjs';

import { collaborative_documents_init } from '../../database/schema/collaborative.js';
import { getDrizzleInstance } from '../../database/services/DrizzleService.js';
import { getPostgresInstance } from '../../database/services/PostgresService/PostgresService.js';
import { createLogger } from '../../utils/logger.js';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);
const log = createLogger('SheetGeneration');

const SHEETS_SUBTYPE = 'sheets';

// Y.Doc layout of a sheet document. Duplicated from
// packages/sheets/src/lib/ydocSchema.ts on purpose: importing
// @gruenerator/sheets would pull the whole Univer dependency tree into the
// API image; the seed/reader only need the raw data shapes.
const SHEET_YDOC_KEYS = { mutations: 'sheetMutations', meta: 'sheetMeta' } as const;
const SHEET_META_KEYS = {
  snapshot: 'snapshot',
  snapshotSeq: 'snapshotSeq',
  seeded: 'seeded',
  schemaVersion: 'schemaVersion',
} as const;
const SHEET_SCHEMA_VERSION = 1;

export const SHEET_GENERATION_PROMPT = `Du bist ein Tabellen-Assistent für die Grünen. Erstelle eine vollständige Tabelle (Spreadsheet) basierend auf der Beschreibung.

Antworte NUR mit einem JSON-Objekt in exakt diesem Format:
{
  "title": "Passender Tabellentitel",
  "sheets": [
    {
      "name": "Übersicht",
      "columns": ["Posten", "Plan", "Ist", "Differenz"],
      "rows": [
        ["Miete", 1200, 1180, "=C2-B2"],
        ["Material", 300, 250, "=C3-B3"]
      ]
    }
  ]
}

Regeln:
- Maximal 3 sheets, maximal 30 rows pro sheet
- columns ist die Kopfzeile (Zeile 1); rows beginnen ab Zeile 2
- Zahlen als JSON-Zahlen (1234.5), NIEMALS als Strings mit Einheit
- Formeln als Strings, die mit "=" beginnen, mit A1-Bezügen (englische Funktionsnamen: SUM, AVERAGE, IF). Zeile 1 ist die Kopfzeile — Datenzeile n liegt in Tabellenzeile n+1
- Erstelle realistische, vollständige Platzhalterinhalte (Musterstadt, Maxi Mustermensch, etc.)
- Wo sinnvoll, ergänze eine Summenzeile mit Formeln
- Schreibe auf Deutsch mit geschlechtergerechter Sprache (Genderstern *)`;

export interface SheetStructure {
  title: string;
  sheets: Array<{
    name: string;
    columns: string[];
    rows: Array<Array<string | number | boolean | null>>;
  }>;
}

/** Parse the model's JSON (with a fenced-block fallback, like boards/docs). */
export function parseSheetStructure(content: string): SheetStructure | null {
  const tryParse = (raw: string): SheetStructure | null => {
    try {
      const parsed = JSON.parse(raw) as SheetStructure;
      if (!parsed || typeof parsed.title !== 'string' || !Array.isArray(parsed.sheets)) return null;
      const sheets = parsed.sheets
        .filter((s) => s && typeof s.name === 'string' && Array.isArray(s.columns))
        .slice(0, 3)
        .map((s) => ({
          name: s.name,
          columns: s.columns.map(String).slice(0, 30),
          rows: (Array.isArray(s.rows) ? s.rows : [])
            .slice(0, 60)
            .map((r) => (Array.isArray(r) ? r.slice(0, 30) : [])),
        }));
      if (sheets.length === 0) return null;
      return { title: parsed.title, sheets };
    } catch {
      return null;
    }
  };

  const direct = tryParse(content.trim());
  if (direct) return direct;
  const match = content.match(/\{[\s\S]*\}/);
  return match ? tryParse(match[0]) : null;
}

interface CellData {
  v?: string | number | boolean;
  f?: string;
}

/**
 * Build a minimal Univer IWorkbookData-shaped snapshot. Plain JSON — the
 * editor's `createWorkbook` normalizes missing fields; the workbook id MUST
 * be the document id (all collab clients share one unitId).
 */
export function buildWorkbookSnapshot(documentId: string, structure: SheetStructure): object {
  const sheets: Record<string, object> = {};
  const sheetOrder: string[] = [];

  structure.sheets.forEach((sheet, index) => {
    const sheetId = `sheet-${index + 1}`;
    sheetOrder.push(sheetId);

    const cellData: Record<number, Record<number, CellData>> = { 0: {} };
    sheet.columns.forEach((col, c) => {
      cellData[0][c] = { v: col };
    });
    sheet.rows.forEach((row, r) => {
      const rowIdx = r + 1;
      cellData[rowIdx] = {};
      row.forEach((value, c) => {
        if (value === null || value === undefined) return;
        if (typeof value === 'string' && value.startsWith('=')) {
          cellData[rowIdx][c] = { f: value };
        } else {
          cellData[rowIdx][c] = { v: value };
        }
      });
    });

    sheets[sheetId] = {
      id: sheetId,
      name: sheet.name,
      rowCount: Math.max(100, sheet.rows.length + 20),
      columnCount: Math.max(26, sheet.columns.length + 5),
      cellData,
    };
  });

  return {
    id: documentId,
    name: structure.title,
    sheetOrder,
    sheets,
  };
}

/**
 * Create the collaborative_documents row and seed the Y.Doc (gzipped into
 * collaborative_documents_init) so the first editor open finds the workbook
 * snapshot in sheetMeta instead of seeding a blank sheet.
 */
export async function createSheetDocument(
  structure: SheetStructure,
  userId: string
): Promise<{ id: string; title: string }> {
  const db = getPostgresInstance();
  const result = await db.query(
    `INSERT INTO collaborative_documents
      (title, created_by, last_edited_by, document_subtype, permissions, is_public)
     VALUES ($1, $2, $2, $3, $4, false)
     RETURNING id, title`,
    [
      structure.title,
      userId,
      SHEETS_SUBTYPE,
      JSON.stringify({ [userId]: { level: 'owner', granted_at: new Date().toISOString() } }),
    ]
  );
  const id = result[0].id as string;
  const title = result[0].title as string;

  try {
    const ydoc = new Y.Doc();
    const meta = ydoc.getMap<unknown>(SHEET_YDOC_KEYS.meta);
    ydoc.transact(() => {
      meta.set(SHEET_META_KEYS.snapshot, JSON.stringify(buildWorkbookSnapshot(id, structure)));
      meta.set(SHEET_META_KEYS.snapshotSeq, -1);
      meta.set(SHEET_META_KEYS.seeded, true);
      meta.set(SHEET_META_KEYS.schemaVersion, SHEET_SCHEMA_VERSION);
    });
    const compressed = await gzipAsync(Y.encodeStateAsUpdate(ydoc));
    await getDrizzleInstance()
      .insert(collaborative_documents_init)
      .values({ document_id: id, init_data: compressed })
      .onConflictDoNothing();
  } catch (err) {
    // Seed failure is non-fatal: the editor seeds a blank workbook on open.
    log.warn(
      `Failed to seed sheet Y.Doc for ${id}: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  return { id, title };
}

export interface LoadedSheetState {
  id: string;
  title: string;
  workbook: {
    name?: string;
    sheetOrder?: string[];
    sheets?: Record<string, { name?: string; cellData?: Record<string, Record<string, CellData>> }>;
  } | null;
}

/**
 * Server-side read of a sheet's current state for @mention context. Loads the
 * Y.Doc (snapshot + updates, like loadBoardYjsDoc) and extracts the workbook
 * snapshot from sheetMeta. Log-tail mutations since the last compaction are
 * NOT replayed here (that needs Univer) — the snapshot is at most one
 * compaction interval stale, which is fine for chat context.
 */
export async function loadSheetState(
  sheetId: string,
  userId: string
): Promise<LoadedSheetState | null> {
  const db = getPostgresInstance();

  const docResult = await db.query(
    `SELECT title FROM collaborative_documents
     WHERE id = $1::uuid AND document_subtype = $2 AND is_deleted = false
     AND (created_by = $3::uuid OR permissions ? $3::text
          OR id::text IN (SELECT gcs.content_id FROM group_content_shares gcs
                    INNER JOIN group_memberships gm ON gm.group_id = gcs.group_id AND gm.user_id = $3::uuid AND gm.is_active = TRUE
                    WHERE gcs.content_type = 'collaborative_documents'))`,
    [sheetId, SHEETS_SUBTYPE, userId]
  );
  if (docResult.length === 0) return null;
  const title = docResult[0].title as string;

  const ydoc = new Y.Doc();
  let hasData = false;

  const snapshotResult = await db.query(
    `SELECT snapshot_data, created_at FROM yjs_document_snapshots
     WHERE document_id = $1 ORDER BY version DESC LIMIT 1`,
    [sheetId]
  );
  if (snapshotResult.length > 0) {
    Y.applyUpdate(ydoc, await gunzipAsync(snapshotResult[0].snapshot_data as Buffer));
    hasData = true;
    const updates = await db.query(
      `SELECT update_data FROM yjs_document_updates
       WHERE document_id = $1 AND created_at > $2 ORDER BY created_at ASC`,
      [sheetId, snapshotResult[0].created_at]
    );
    for (const row of updates) {
      Y.applyUpdate(ydoc, await gunzipAsync(row.update_data as Buffer));
    }
  } else {
    const updates = await db.query(
      `SELECT update_data FROM yjs_document_updates
       WHERE document_id = $1 ORDER BY created_at ASC`,
      [sheetId]
    );
    for (const row of updates) {
      Y.applyUpdate(ydoc, await gunzipAsync(row.update_data as Buffer));
      hasData = true;
    }
    if (!hasData) {
      // Freshly created via chat: only the init seed exists.
      const init = await db.query(
        `SELECT init_data FROM collaborative_documents_init WHERE document_id = $1`,
        [sheetId]
      );
      if (init.length > 0) {
        Y.applyUpdate(ydoc, await gunzipAsync(init[0].init_data as Buffer));
        hasData = true;
      }
    }
  }
  if (!hasData) return { id: sheetId, title, workbook: null };

  const raw = ydoc.getMap<unknown>(SHEET_YDOC_KEYS.meta).get(SHEET_META_KEYS.snapshot);
  let workbook: LoadedSheetState['workbook'] = null;
  if (typeof raw === 'string' && raw.length > 0) {
    try {
      workbook = JSON.parse(raw) as LoadedSheetState['workbook'];
    } catch {
      workbook = null;
    }
  }
  return { id: sheetId, title, workbook };
}

const MAX_CONTEXT_ROWS = 50;
const MAX_CONTEXT_COLS = 20;

function columnLabel(index: number): string {
  let label = '';
  let i = index;
  while (i >= 0) {
    label = String.fromCharCode(65 + (i % 26)) + label;
    i = Math.floor(i / 26) - 1;
  }
  return label;
}

/** Render a loaded sheet as markdown tables for LLM context injection. */
export function formatSheetAsContext(state: LoadedSheetState): string {
  const lines: string[] = [`### Tabelle: ${state.title}`];
  const wb = state.workbook;
  if (!wb?.sheets || !wb.sheetOrder?.length) {
    lines.push('(Noch keine Inhalte)');
    return lines.join('\n');
  }

  for (const sheetId of wb.sheetOrder) {
    const sheet = wb.sheets[sheetId];
    if (!sheet?.cellData) continue;

    const rowIndices = Object.keys(sheet.cellData)
      .map(Number)
      .filter((n) => !Number.isNaN(n))
      .sort((a, b) => a - b);
    if (rowIndices.length === 0) continue;

    let maxCol = 0;
    for (const r of rowIndices) {
      for (const c of Object.keys(sheet.cellData[r] ?? {})) {
        maxCol = Math.max(maxCol, Number(c));
      }
    }
    const cols = Math.min(maxCol + 1, MAX_CONTEXT_COLS);
    const shownRows = rowIndices.filter((r) => r < MAX_CONTEXT_ROWS);

    lines.push(`\nBlatt „${sheet.name ?? sheetId}":\n`);
    const header = ['   ', ...Array.from({ length: cols }, (_, c) => columnLabel(c))];
    lines.push(`| ${header.join(' | ')} |`);
    lines.push(`| ${header.map(() => '---').join(' | ')} |`);
    for (const r of shownRows) {
      const cells = [`${r + 1}`];
      for (let c = 0; c < cols; c++) {
        const cell = sheet.cellData[r]?.[c];
        const rendered = cell?.f ?? cell?.v ?? '';
        cells.push(String(rendered).replaceAll('|', '\\|').replaceAll('\n', ' ').slice(0, 100));
      }
      lines.push(`| ${cells.join(' | ')} |`);
    }
    const hidden = rowIndices.length - shownRows.length;
    if (hidden > 0) lines.push(`(… ${hidden} weitere Zeilen ausgelassen)`);
  }

  return lines.join('\n');
}
