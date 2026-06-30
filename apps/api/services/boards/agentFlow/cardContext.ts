/**
 * Gather a board card's full context for a delegated agent.
 *
 * When work is delegated on a card (a comment @-mention or a card assignment), the
 * agent should not work half-blind: it sees the whole column ("Spalte") — the card's
 * own fields and the Kanban status column it sits in, with its sibling cards — plus
 * all card comments and the text content of documents linked on the card.
 *
 * Everything is read server-side from the board's Yjs state (via loadBoardState) +
 * Postgres at task run time, so the frontend ships nothing extra. Best-effort: any
 * failure degrades to a smaller (or empty) block and never throws — a delegated task
 * must still run without context.
 */
import { z } from 'zod';

import { getPostgresInstance } from '../../../database/services/PostgresService/PostgresService.js';
import { createLogger } from '../../../utils/logger.js';
import { loadBoardState, type BoardState } from '../BoardService.js';
import { GRUENERATOR_BOT_USER_ID } from '../grueneratorBot.js';

const db = getPostgresInstance();
const log = createLogger('boardCardContext');

// Field types reused from the exported BoardState so we never re-declare the shape.
type BoardField = BoardState['fields'][number];
type BoardRow = BoardState['rows'][number];

// Must match the frontend FIELD_IDS (mirrored locally, as BoardService does).
const FIELD_IDS = {
  TITLE: 'field-title',
  STATUS: 'field-status',
  DESCRIPTION: 'field-description',
  LINKED_DOCS: 'field-linked-docs',
} as const;

// Fields rendered elsewhere or holding JSON blobs that aren't useful as free text.
const SKIP_FIELD_IDS = new Set<string>([
  FIELD_IDS.STATUS, // rendered as the column section
  FIELD_IDS.LINKED_DOCS, // rendered as the documents section
  'field-comments', // rendered as the comments section
  'field-checklist',
  'field-assignee',
  'field-recurrence',
]);

const MAX_SIBLINGS = 30;
const MAX_COMMENTS = 50;
const MAX_DOCS = 5;
const PER_DOC_CHARS = 4000;
const WORKING_COMMENT_PREFIX = '💭';

const selectOptionsSchema = z.array(z.object({ id: z.string(), name: z.string() }).passthrough());
const linkedDocsSchema = z.array(z.object({ id: z.string(), title: z.string() }));

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max).trimEnd()} …` : text;
}

function cellToText(value: unknown): string {
  if (value == null) return '';
  if (Array.isArray(value)) return value.map((v) => String(v)).join(', ');
  if (typeof value === 'boolean') return value ? 'ja' : 'nein';
  return String(value).trim();
}

/** Options of a select-type field (typed via zod, no cast). */
function fieldOptions(field: BoardField): Array<{ id: string; name: string }> {
  const parsed = selectOptionsSchema.safeParse(field.typeOptions?.options);
  return parsed.success ? parsed.data : [];
}

/** Display value for a cell, mapping select option ids → names where possible. */
function resolveCellDisplay(field: BoardField, value: unknown): string {
  const options = fieldOptions(field);
  if (options.length > 0) {
    const ids = Array.isArray(value) ? value : value === '' || value == null ? [] : [value];
    return ids.map((id) => options.find((o) => o.id === id)?.name ?? String(id)).join(', ');
  }
  return cellToText(value);
}

function stripHtml(html: string): string {
  let text = html;
  let prev: string;
  do {
    prev = text;
    text = text.replace(/<[^>]+>/g, '');
  } while (text !== prev);
  return text
    .replace(/&[a-zA-Z]+;/g, ' ')
    .replace(/&#x?[0-9a-fA-F]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The card's own fields (all columns of its row), select ids resolved to names. */
function formatCardFields(card: BoardRow, fields: BoardField[]): string | undefined {
  const lines: string[] = [];
  for (const field of [...fields].sort((a, b) => a.order - b.order)) {
    if (SKIP_FIELD_IDS.has(field.id)) continue;
    const display = resolveCellDisplay(field, card.cells[field.id]).trim();
    if (!display) continue;
    lines.push(`- ${field.name}: ${truncate(display, 500)}`);
  }
  return lines.length > 0 ? `### Karte\n${lines.join('\n')}` : undefined;
}

/** The Kanban column ("Spalte") the card sits in, plus its sibling cards. */
function formatColumn(card: BoardRow, board: BoardState): string | undefined {
  const statusField = board.fields.find((f) => f.id === FIELD_IDS.STATUS);
  if (!statusField) return undefined;
  const statusId = card.cells[FIELD_IDS.STATUS];
  const columnName = fieldOptions(statusField).find((o) => o.id === statusId)?.name;
  if (!columnName) return undefined;

  const siblings = board.rows
    .filter((r) => r.id !== card.id && r.cells[FIELD_IDS.STATUS] === statusId)
    .slice(0, MAX_SIBLINGS);

  let text = `### Spalte „${columnName}“\nDiese Karte liegt in der Spalte „${columnName}“.`;
  if (siblings.length > 0) {
    text += '\nWeitere Karten in dieser Spalte:';
    for (const row of siblings) {
      const title = cellToText(row.cells[FIELD_IDS.TITLE]) || '(kein Titel)';
      const desc = cellToText(row.cells[FIELD_IDS.DESCRIPTION]);
      text += `\n- ${title}${desc ? ` — ${truncate(desc, 160)}` : ''}`;
    }
  }
  return text;
}

/** All comments on the card (bot "working…" placeholders excluded). */
async function formatComments(boardId: string, cardId: string): Promise<string | undefined> {
  const rows = await db.query<{
    content: string | null;
    user_id: string;
    author_name: string | null;
  }>(
    `SELECT bc.content, bc.user_id, p.display_name AS author_name
       FROM board_comments bc
       LEFT JOIN profiles p ON bc.user_id = p.id
      WHERE bc.board_id = $1 AND bc.card_id = $2
      ORDER BY bc.created_at ASC
      LIMIT $3`,
    [boardId, cardId, MAX_COMMENTS]
  );

  const lines = rows
    .filter(
      (r) =>
        r.content &&
        !(r.user_id === GRUENERATOR_BOT_USER_ID && r.content.startsWith(WORKING_COMMENT_PREFIX))
    )
    .map((r) => {
      const who =
        r.user_id === GRUENERATOR_BOT_USER_ID ? 'Grünerator' : (r.author_name ?? 'Unbekannt');
      return `- ${who}: ${truncate((r.content ?? '').replace(/\s+/g, ' ').trim(), 400)}`;
    });

  return lines.length > 0 ? `### Kommentare\n${lines.join('\n')}` : undefined;
}

/** Text content of documents linked on the card (access-checked against `userId`). */
async function formatLinkedDocs(card: BoardRow, userId: string): Promise<string | undefined> {
  const raw = card.cells[FIELD_IDS.LINKED_DOCS];
  if (typeof raw !== 'string' || raw.trim() === '') return undefined;

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return undefined;
  }
  const parsed = linkedDocsSchema.safeParse(json);
  if (!parsed.success || parsed.data.length === 0) return undefined;

  const ids = parsed.data.slice(0, MAX_DOCS).map((d) => d.id);
  const docs = await db.query<{ id: string; title: string; content: string | null }>(
    `SELECT id, title, content FROM collaborative_documents
      WHERE id = ANY($1::uuid[]) AND is_deleted = false AND document_subtype != 'boards'
        AND (created_by = $2::uuid OR permissions ? $2::text OR is_public = true
             OR id IN (SELECT gcs.content_id::uuid FROM group_content_shares gcs
                       INNER JOIN group_memberships gm ON gm.group_id = gcs.group_id
                              AND gm.user_id = $2::uuid AND gm.is_active = TRUE
                       WHERE gcs.content_type = 'collaborative_documents'))`,
    [ids, userId]
  );

  const parts = docs
    .filter((d) => d.content)
    .map((d) => `#### ${d.title}\n${truncate(stripHtml(d.content ?? ''), PER_DOC_CHARS)}`);

  return parts.length > 0 ? `### Verknüpfte Dokumente\n${parts.join('\n\n')}` : undefined;
}

/**
 * Build the full card-context block for a delegated agent task. Returns undefined
 * when there's nothing useful (or on any failure) so the caller simply omits it.
 */
export async function buildCardAgentContext(
  boardId: string,
  cardId: string,
  userId: string
): Promise<string | undefined> {
  try {
    const board = await loadBoardState(boardId, userId);
    if (!board) return undefined;
    const card = board.rows.find((r) => r.id === cardId);
    if (!card) return undefined;

    const [comments, docs] = await Promise.all([
      formatComments(boardId, cardId),
      formatLinkedDocs(card, userId),
    ]);

    const parts = [
      formatCardFields(card, board.fields),
      formatColumn(card, board),
      comments,
      docs,
    ].filter((p): p is string => Boolean(p));

    return parts.length > 0 ? parts.join('\n\n') : undefined;
  } catch (err) {
    log.warn(
      `Failed to build card context for ${boardId}/${cardId}: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
    return undefined;
  }
}
