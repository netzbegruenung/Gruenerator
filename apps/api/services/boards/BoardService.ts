import { promisify } from 'util';
import { gunzip, gzip } from 'zlib';

import * as Y from 'yjs';

import { getPostgresInstance } from '../../database/services/PostgresService/PostgresService.js';
import { createLogger } from '../../utils/logger.js';

const gunzipAsync = promisify(gunzip);
const gzipAsync = promisify(gzip);
const _log = createLogger('BoardService');

const BOARDS_SUBTYPE = 'boards';

// Well-known field IDs (must match frontend FIELD_IDS)
const FIELD_IDS = {
  TITLE: 'field-title',
  STATUS: 'field-status',
  DESCRIPTION: 'field-description',
  DUE_DATE: 'field-due-date',
  LABELS: 'field-labels',
  ASSIGNEE: 'field-assignee',
  LINKED_DOCS: 'field-linked-docs',
} as const;

export const BOARD_GENERATION_PROMPT = `Du bist ein Projektmanagement-Assistent. Erstelle eine Kanban-Board-Struktur als JSON basierend auf der Beschreibung.

Antworte NUR mit einem JSON-Objekt in exakt diesem Format:
{
  "title": "Passender Board-Titel",
  "statusOptions": [
    { "id": "status-1", "name": "Spaltenname" },
    { "id": "status-2", "name": "Spaltenname" }
  ],
  "rows": [
    { "id": "row-1", "title": "Aufgabe", "status": "status-1", "description": "Kurzbeschreibung" }
  ]
}

Regeln:
- Erstelle 3-5 Status-Optionen mit sinnvollen deutschen Namen
- Erstelle 5-15 Aufgaben passend zur Beschreibung
- Verteile die Aufgaben logisch auf die Status-Optionen
- Jede Aufgabe braucht einen klaren, actionable Titel
- Beschreibungen sind optional aber hilfreich (1-2 Sätze)
- Status-IDs: status-1, status-2, etc. Aufgaben-IDs: row-1, row-2, etc.
- Kein Markdown, keine Erklärung, NUR das JSON-Objekt`;

export interface BoardGenerationResult {
  title: string;
  statusOptions: Array<{ id: string; name: string }>;
  rows: Array<{ id: string; title: string; status: string; description: string }>;
}

interface FieldDef {
  id: string;
  name: string;
  type: string;
  typeOptions: Record<string, unknown>;
  order: number;
}

interface RowDef {
  id: string;
  cells: Record<string, unknown>;
  createdBy: string;
  createdAt: string;
}

interface ViewDef {
  id: string;
  name: string;
  layout: string;
  groupByFieldId?: string;
  filters: unknown[];
  sorts: unknown[];
  fieldSettings: Array<{ fieldId: string; visible: boolean }>;
}

export interface BoardState {
  id: string;
  title: string;
  boardType?: string;
  fields: FieldDef[];
  rows: RowDef[];
  views: ViewDef[];
  whiteboardTexts?: string[];
}

const STATUS_COLORS = ['#8da4bf', '#c4b08b', '#7c9885', '#c9a0a0', '#b4a0c9'];

/**
 * Load Yjs document from PostgreSQL (snapshots + incremental updates).
 */
export async function loadBoardYjsDoc(boardId: string): Promise<Y.Doc | null> {
  const db = getPostgresInstance();
  const ydoc = new Y.Doc();
  let hasData = false;

  const snapshotResult = await db.query(
    `SELECT snapshot_data, created_at FROM yjs_document_snapshots
     WHERE document_id = $1 ORDER BY version DESC LIMIT 1`,
    [boardId]
  );

  if (snapshotResult.length > 0) {
    const dec = await gunzipAsync(snapshotResult[0].snapshot_data as Buffer);
    Y.applyUpdate(ydoc, dec);
    hasData = true;

    const updates = await db.query(
      `SELECT update_data FROM yjs_document_updates
       WHERE document_id = $1 AND created_at > $2 ORDER BY created_at ASC`,
      [boardId, snapshotResult[0].created_at]
    );
    for (const row of updates) {
      const d = await gunzipAsync(row.update_data as Buffer);
      Y.applyUpdate(ydoc, d);
    }
  } else {
    const updates = await db.query(
      `SELECT update_data FROM yjs_document_updates
       WHERE document_id = $1 ORDER BY created_at ASC`,
      [boardId]
    );
    for (const row of updates) {
      const d = await gunzipAsync(row.update_data as Buffer);
      Y.applyUpdate(ydoc, d);
      hasData = true;
    }
  }

  return hasData ? ydoc : null;
}

/**
 * Load board state for AI context injection.
 */
export async function loadBoardState(boardId: string, userId: string): Promise<BoardState | null> {
  const db = getPostgresInstance();

  const boardResult = await db.query(
    `SELECT title, content FROM collaborative_documents
     WHERE id = $1::uuid AND document_subtype = $2 AND is_deleted = false
     AND (created_by = $3::uuid OR permissions ? $3::text
          OR id::text IN (SELECT gcs.content_id FROM group_content_shares gcs
                    INNER JOIN group_memberships gm ON gm.group_id = gcs.group_id AND gm.user_id = $3::uuid AND gm.is_active = TRUE
                    WHERE gcs.content_type = 'collaborative_documents'))`,
    [boardId, BOARDS_SUBTYPE, userId]
  );

  if (boardResult.length === 0) return null;

  const title = boardResult[0].title as string;
  const content = boardResult[0].content as { board_type?: string } | null;
  const boardType = content?.board_type ?? 'kanban';

  if (boardType === 'whiteboard') {
    const ydoc = await loadBoardYjsDoc(boardId);
    const whiteboardTexts: string[] = [];
    if (ydoc) {
      const elements = ydoc.getArray('elements').toJSON() as Array<{
        el?: { type?: string; text?: string; isDeleted?: boolean };
      }>;
      for (const item of elements) {
        const el = item?.el;
        if (el && !el.isDeleted && el.text && el.text.trim()) {
          whiteboardTexts.push(el.text.trim());
        }
      }
    }
    return { id: boardId, title, boardType, fields: [], rows: [], views: [], whiteboardTexts };
  }

  const ydoc = await loadBoardYjsDoc(boardId);
  if (!ydoc) {
    return { id: boardId, title, boardType, fields: [], rows: [], views: [] };
  }

  return {
    id: boardId,
    title,
    boardType,
    fields: ydoc.getArray('fields').toJSON() as FieldDef[],
    rows: ydoc.getArray('rows').toJSON() as RowDef[],
    views: ydoc.getArray('views').toJSON() as ViewDef[],
  };
}

/**
 * Format a board state as structured text for AI context injection.
 */
export function formatBoardAsContext(board: BoardState): string {
  if (board.boardType === 'whiteboard') {
    let text = `## Whiteboard: ${board.title}\n`;
    if (board.whiteboardTexts?.length) {
      text += '\nTextelemente:\n';
      for (const t of board.whiteboardTexts) text += `- ${t}\n`;
    } else {
      text += '(Keine Textelemente auf dem Whiteboard)\n';
    }
    return text;
  }

  let text = `## Board: ${board.title}\n`;

  const statusField = board.fields.find((f) => f.id === FIELD_IDS.STATUS);
  const statusOptions = (statusField?.typeOptions.options ?? []) as Array<{
    id: string;
    name: string;
  }>;

  for (const opt of statusOptions) {
    const groupRows = board.rows.filter((r) => r.cells[FIELD_IDS.STATUS] === opt.id);
    text += `\n### ${opt.name} (${groupRows.length} Aufgaben)\n`;
    for (const row of groupRows) {
      const title = (row.cells[FIELD_IDS.TITLE] as string) || '(kein Titel)';
      const desc = row.cells[FIELD_IDS.DESCRIPTION] as string;
      const due = row.cells[FIELD_IDS.DUE_DATE] as string;
      text += `- ${title}`;
      if (desc) text += ` — ${desc}`;
      if (due) text += ` (Fällig: ${due})`;
      try {
        const docs = JSON.parse((row.cells[FIELD_IDS.LINKED_DOCS] as string) || '[]') as Array<{
          title: string;
        }>;
        if (docs.length) text += ` {Dokumente: ${docs.map((d) => d.title).join(', ')}}`;
      } catch {
        /* ignore parse errors */
      }
      text += '\n';
    }
    if (groupRows.length === 0) text += '- (keine Aufgaben)\n';
  }

  return text;
}

interface SelectOption {
  id: string;
  name: string;
  color?: string;
}

/** Collapse markdown/whitespace and truncate to a single-line preview snippet. */
function toSnippet(raw: unknown, max = 160): string | null {
  if (typeof raw !== 'string') return null;
  const clean = raw
    .replace(/```[\s\S]*?```/g, ' ') // code fences
    .replace(/[#>*_~`]+/g, ' ') // markdown markers
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1') // links/images → label
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean) return null;
  return clean.length > max ? `${clean.slice(0, max).trimEnd()}…` : clean;
}

/** Resolve assignee names from the assignee cell (a JSON-encoded array, mirrors frontend parseAssignees). */
function parseAssigneeNames(raw: unknown): string[] {
  if (typeof raw !== 'string' || raw === '') return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [raw]; // bare display name
  }
  const items = Array.isArray(parsed) ? parsed : [parsed];
  return items
    .filter((a): a is { name: string } => !!a && typeof a === 'object' && 'name' in a)
    .map((a) => String(a.name))
    .filter(Boolean);
}

/** Resolve multiSelect option IDs (labels cell) to their display names. */
function resolveOptionNames(raw: unknown, options: SelectOption[]): string[] {
  const ids = Array.isArray(raw) ? raw : typeof raw === 'string' && raw ? [raw] : [];
  return ids.map((id) => options.find((o) => o.id === id)?.name).filter((n): n is string => !!n);
}

export interface CardSnapshot {
  cardTitle: string | null;
  descriptionSnippet: string | null;
  statusLabel: string | null;
  statusColor: string | null;
  dueDate: string | null;
  assigneeNames: string[];
  labelNames: string[];
}

/**
 * Read a single card's display-ready content straight from the board's Yjs doc,
 * for enriching notification emails. Resolves select-option IDs (status/labels)
 * to their names via the field schema. Returns null if the board or card is gone.
 */
export async function getCardSnapshot(
  boardId: string,
  cardId: string
): Promise<CardSnapshot | null> {
  const ydoc = await loadBoardYjsDoc(boardId);
  if (!ydoc) return null;

  const fields = ydoc.getArray('fields').toJSON() as FieldDef[];
  const rows = ydoc.getArray('rows').toJSON() as RowDef[];
  const row = rows.find((r) => r.id === cardId);
  if (!row) return null;

  const statusField = fields.find((f) => f.id === FIELD_IDS.STATUS);
  const statusOptions = (statusField?.typeOptions.options ?? []) as SelectOption[];
  const labelField = fields.find((f) => f.id === FIELD_IDS.LABELS);
  const labelOptions = (labelField?.typeOptions.options ?? []) as SelectOption[];

  const statusOption = statusOptions.find((o) => o.id === row.cells[FIELD_IDS.STATUS]);
  const due = row.cells[FIELD_IDS.DUE_DATE];

  return {
    cardTitle: (row.cells[FIELD_IDS.TITLE] as string) || null,
    descriptionSnippet: toSnippet(row.cells[FIELD_IDS.DESCRIPTION]),
    statusLabel: statusOption?.name ?? null,
    statusColor: statusOption?.color ?? null,
    dueDate: typeof due === 'string' && due ? due : null,
    assigneeNames: parseAssigneeNames(row.cells[FIELD_IDS.ASSIGNEE]),
    labelNames: resolveOptionNames(row.cells[FIELD_IDS.LABELS], labelOptions),
  };
}

/**
 * Build the notification `metadata` payload that the rich board email template reads.
 * Fetches the card snapshot once per event; omits empty fields so an unavailable
 * snapshot (deleted card, whiteboard) degrades to the generic email cleanly.
 */
export async function buildCardEmailMetadata(
  boardId: string,
  cardId: string,
  boardTitle: string | null
): Promise<Record<string, unknown>> {
  const snap = await getCardSnapshot(boardId, cardId).catch(() => null);
  return {
    boardId,
    cardId,
    ...(boardTitle ? { boardTitle } : {}),
    ...(snap?.cardTitle ? { cardTitle: snap.cardTitle } : {}),
    ...(snap?.descriptionSnippet ? { descriptionSnippet: snap.descriptionSnippet } : {}),
    ...(snap?.statusLabel ? { statusLabel: snap.statusLabel } : {}),
    ...(snap?.statusColor ? { statusColor: snap.statusColor } : {}),
    ...(snap?.dueDate ? { dueDate: snap.dueDate } : {}),
    ...(snap && snap.assigneeNames.length ? { assigneeNames: snap.assigneeNames } : {}),
    ...(snap && snap.labelNames.length ? { labelNames: snap.labelNames } : {}),
  };
}

/**
 * Parse AI-generated board structure from JSON response.
 */
export function parseBoardStructure(content: string): BoardGenerationResult | null {
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    const result: BoardGenerationResult = JSON.parse(
      jsonMatch?.[0] || content
    ) as BoardGenerationResult;
    return result;
  } catch {
    return null;
  }
}

/**
 * Convert AI generation result to the field/row/view structure the frontend expects.
 */
export function postProcessBoardStructure(
  structure: BoardGenerationResult,
  userId: string
): { fields: FieldDef[]; rows: RowDef[]; views: ViewDef[] } {
  const statusOptions = structure.statusOptions.map((opt, i) => ({
    id: opt.id,
    name: opt.name,
    color: STATUS_COLORS[i % STATUS_COLORS.length],
  }));

  const fields: FieldDef[] = [
    { id: FIELD_IDS.TITLE, name: 'Titel', type: 'text', typeOptions: {}, order: 0 },
    {
      id: FIELD_IDS.STATUS,
      name: 'Status',
      type: 'singleSelect',
      typeOptions: { options: statusOptions },
      order: 1,
    },
    { id: FIELD_IDS.DESCRIPTION, name: 'Beschreibung', type: 'text', typeOptions: {}, order: 2 },
    { id: FIELD_IDS.DUE_DATE, name: 'Fällig', type: 'date', typeOptions: {}, order: 3 },
    {
      id: FIELD_IDS.LABELS,
      name: 'Labels',
      type: 'multiSelect',
      typeOptions: { options: [] },
      order: 4,
    },
    { id: FIELD_IDS.ASSIGNEE, name: 'Zuständig', type: 'text', typeOptions: {}, order: 5 },
    { id: FIELD_IDS.LINKED_DOCS, name: 'Dokumente', type: 'text', typeOptions: {}, order: 6 },
  ];

  const now = new Date().toISOString();
  const rows: RowDef[] = structure.rows.map((r) => ({
    id: r.id,
    cells: {
      [FIELD_IDS.TITLE]: r.title,
      [FIELD_IDS.STATUS]: r.status,
      [FIELD_IDS.DESCRIPTION]: r.description || '',
      [FIELD_IDS.DUE_DATE]: null,
      [FIELD_IDS.LABELS]: [],
      [FIELD_IDS.ASSIGNEE]: '',
      [FIELD_IDS.LINKED_DOCS]: '[]',
    },
    createdBy: userId,
    createdAt: now,
  }));

  const views: ViewDef[] = [
    {
      id: 'view-kanban-default',
      name: 'Kanban',
      layout: 'kanban',
      groupByFieldId: FIELD_IDS.STATUS,
      filters: [],
      sorts: [],
      fieldSettings: fields.map((f) => ({ fieldId: f.id, visible: true })),
    },
  ];

  return { fields, rows, views };
}

/**
 * Create a board document in the database.
 */
export async function createBoardDocument(
  title: string,
  userId: string,
  boardType?: 'kanban' | 'whiteboard'
): Promise<{ id: string; title: string }> {
  const db = getPostgresInstance();
  const content = boardType ? JSON.stringify({ board_type: boardType }) : null;
  const result = await db.query(
    `INSERT INTO collaborative_documents
      (title, created_by, last_edited_by, document_subtype, permissions, is_public, content)
     VALUES ($1, $2, $2, $3, $4, false, $5::jsonb)
     RETURNING id, title`,
    [
      title,
      userId,
      BOARDS_SUBTYPE,
      JSON.stringify({ [userId]: { level: 'owner', granted_at: new Date().toISOString() } }),
      content,
    ]
  );
  return { id: result[0].id as string, title: result[0].title as string };
}

/**
 * Add rows to an existing board by loading the Yjs document,
 * appending rows to the 'rows' array, and persisting the update.
 */
export async function addRowsToBoard(
  boardId: string,
  rows: Array<Record<string, unknown>>,
  userId: string
): Promise<void> {
  const MAX_ROWS_PER_UPDATE = 100;
  if (rows.length > MAX_ROWS_PER_UPDATE) {
    throw new Error(`Cannot add more than ${MAX_ROWS_PER_UPDATE} rows in one request`);
  }
  if (rows.length === 0) return;

  const doc = await loadBoardYjsDoc(boardId);
  if (!doc) {
    throw new Error(`Board ${boardId} not found or has no Yjs document`);
  }

  const yRows = doc.getArray('rows');
  const now = new Date().toISOString();

  doc.transact(() => {
    for (const row of rows) {
      const newRow = new Y.Map();
      const rowId = row.id
        ? String(row.id)
        : `row-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      newRow.set('id', rowId);
      newRow.set('createdBy', userId);
      newRow.set('createdAt', now);

      const cells = new Y.Map();
      cells.set(FIELD_IDS.TITLE, String(row.title || ''));
      cells.set(FIELD_IDS.STATUS, String(row.status || ''));
      cells.set(FIELD_IDS.DESCRIPTION, String(row.description || ''));
      cells.set(FIELD_IDS.DUE_DATE, row.dueDate ? String(row.dueDate) : null);
      cells.set(FIELD_IDS.LABELS, []);
      cells.set(FIELD_IDS.ASSIGNEE, String(row.assignee || ''));
      cells.set(FIELD_IDS.LINKED_DOCS, '[]');
      newRow.set('cells', cells);

      yRows.push([newRow]);
    }
  });

  const update = Y.encodeStateAsUpdate(doc);
  const compressed = await gzipAsync(Buffer.from(update));
  const db = getPostgresInstance();
  await db.query(
    `INSERT INTO yjs_document_updates (document_id, update_data, created_at)
     VALUES ($1, $2, CURRENT_TIMESTAMP)
     ON CONFLICT (document_id) DO UPDATE
       SET update_data = EXCLUDED.update_data, created_at = EXCLUDED.created_at`,
    [boardId, compressed]
  );

  _log.info(`Added ${rows.length} rows to board ${boardId}`);
  doc.destroy();
}
