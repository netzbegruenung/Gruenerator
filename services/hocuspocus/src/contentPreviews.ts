import { escapeHtml } from '@gruenerator/shared/utils';
import * as Y from 'yjs';

/**
 * Real-data card previews for the non-BlockNote collaborative subtypes. Each
 * extractor reads the live Y.Doc and produces a compact preview the list
 * cards can render: sheets → a small HTML <table> (the frontend's
 * parseTablePreview already understands it), presentations → an <ol> of slide
 * titles, boards → a JSON fragment merged into the board's `content` metadata
 * (that column stores `{ board_type }` JSON, not HTML).
 *
 * Y.Doc key names are duplicated from @gruenerator/contracts
 * (sheetsYdoc.ts / presentationsYdoc.ts) and the boards feature — per
 * CLAUDE.md the Hocuspocus service keeps zero cross-package deps beyond
 * @gruenerator/shared.
 */
const SHEET_META = 'sheetMeta';
const SHEET_SNAPSHOT = 'snapshot';
const PRESENTATION_SLIDES = 'slides';
const BOARD_FIELDS = 'fields';
const BOARD_ROWS = 'rows';
const BOARD_ELEMENTS = 'elements';
const BOARD_STATUS_FIELD_ID = 'field-status';

const MAX_TABLE_ROWS = 5;
const MAX_TABLE_COLS = 4;
const MAX_SLIDE_TITLES = 8;
const MAX_BOARD_COLUMNS = 4;
const MAX_WHITEBOARD_NOTES = 6;

export type PreviewKind = 'sheets' | 'presentations' | 'board' | 'blocknote';

/**
 * Detect the document flavor from the Y.Doc's root types. Checked via
 * `ydoc.share` so detection never instantiates root types on the live
 * document.
 */
export function detectPreviewKind(ydoc: Y.Doc): PreviewKind {
  if (ydoc.share.has(SHEET_META)) return 'sheets';
  if (ydoc.share.has(PRESENTATION_SLIDES)) return 'presentations';
  if (ydoc.share.has(BOARD_ROWS) || ydoc.share.has(BOARD_ELEMENTS)) return 'board';
  return 'blocknote';
}

interface UniverCell {
  v?: unknown;
}
type UniverCellRow = Record<string, UniverCell | null | undefined> | null | undefined;
interface UniverWorkbook {
  sheetOrder?: unknown;
  sheets?: Record<string, { cellData?: Record<string, UniverCellRow> | null } | null>;
}

/**
 * First sheet's leading cells as a small HTML table. Reads the workbook
 * snapshot from sheetMeta — at most one compaction interval (~30s idle / 200
 * mutations) behind the live mutation log, which is fine for a card preview.
 */
export function sheetPreviewHtml(ydoc: Y.Doc): string | null {
  const raw = ydoc.getMap<unknown>(SHEET_META).get(SHEET_SNAPSHOT);
  if (typeof raw !== 'string' || !raw) return null;

  let workbook: UniverWorkbook;
  try {
    workbook = JSON.parse(raw) as UniverWorkbook;
  } catch {
    return null;
  }

  const sheets = workbook.sheets ?? {};
  const order = Array.isArray(workbook.sheetOrder)
    ? (workbook.sheetOrder as string[])
    : Object.keys(sheets);
  const cellData = sheets[order[0] ?? '']?.cellData;
  if (!cellData) return null;

  const rows: string[][] = [];
  for (let r = 0; r < MAX_TABLE_ROWS; r++) {
    const rowData = cellData[r];
    const row: string[] = [];
    for (let c = 0; c < MAX_TABLE_COLS; c++) {
      const v = rowData?.[c]?.v;
      row.push(typeof v === 'string' || typeof v === 'number' ? String(v) : '');
    }
    rows.push(row);
  }
  while (rows.length > 1 && rows[rows.length - 1].every((cell) => !cell.trim())) rows.pop();
  if (!rows.some((row) => row.some((cell) => cell.trim() !== ''))) return null;

  const body = rows
    .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`)
    .join('');
  return `<table data-preview="sheet">${body}</table>`;
}

/** Slide titles as an ordered list; data-total carries the full deck size. */
export function presentationPreviewHtml(ydoc: Y.Doc): string | null {
  const slides = ydoc.getArray<unknown>(PRESENTATION_SLIDES);
  if (slides.length === 0) return null;

  const titles = slides
    .toArray()
    .slice(0, MAX_SLIDE_TITLES)
    .map((slide) => {
      const title = slide instanceof Y.Map ? slide.get('title') : null;
      return typeof title === 'string' ? title.trim() : '';
    });
  if (!titles.some(Boolean)) return null;

  const items = titles.map((t) => `<li>${escapeHtml(t)}</li>`).join('');
  return `<ol data-preview="slides" data-total="${slides.length}">${items}</ol>`;
}

export interface BoardPreview {
  columns?: Array<{ name: string; count: number }>;
  notes?: string[];
}

/**
 * Kanban: status-field options as columns with card counts. Whiteboard: the
 * first text elements. Both are computed when their roots exist; the frontend
 * picks by board_type.
 */
export function boardPreview(ydoc: Y.Doc): BoardPreview | null {
  const preview: BoardPreview = {};

  if (ydoc.share.has(BOARD_ROWS)) {
    const fields = ydoc.getArray<unknown>(BOARD_FIELDS).toJSON() as Array<{
      id?: string;
      typeOptions?: { options?: Array<{ id?: string; name?: string }> };
    }>;
    const rows = ydoc.getArray<unknown>(BOARD_ROWS).toJSON() as Array<{
      cells?: Record<string, unknown>;
    }>;
    const status = fields.find((f) => f?.id === BOARD_STATUS_FIELD_ID);
    const options = Array.isArray(status?.typeOptions?.options) ? status.typeOptions.options : [];
    if (options.length > 0) {
      const counts = new Map<string, number>();
      for (const row of rows) {
        const value = row?.cells?.[BOARD_STATUS_FIELD_ID];
        if (typeof value === 'string') counts.set(value, (counts.get(value) ?? 0) + 1);
      }
      preview.columns = options.slice(0, MAX_BOARD_COLUMNS).map((option) => ({
        name: typeof option?.name === 'string' ? option.name : '',
        count: counts.get(option?.id ?? '') ?? 0,
      }));
    }
  }

  if (ydoc.share.has(BOARD_ELEMENTS)) {
    const elements = ydoc.getArray<unknown>(BOARD_ELEMENTS).toJSON() as Array<{
      el?: { text?: string; isDeleted?: boolean } | null;
    }>;
    const notes: string[] = [];
    for (const item of elements) {
      const el = item?.el;
      if (el && !el.isDeleted && typeof el.text === 'string' && el.text.trim()) {
        notes.push(el.text.trim());
        if (notes.length >= MAX_WHITEBOARD_NOTES) break;
      }
    }
    if (notes.length > 0) preview.notes = notes;
  }

  return preview.columns || preview.notes ? preview : null;
}
