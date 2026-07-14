/**
 * Server-side mutation of an EXISTING board card (task). Boards store cards as
 * rows inside a Yjs document; the only prior server write was `addRowsToBoard`
 * (append-only). This generalises that load→transact→encode→persist pattern to
 * edit a card's cells: title, description, status (column), assignee, due date.
 *
 * Persistence mirrors `addRowsToBoard` exactly (full-state encode → single
 * `yjs_document_updates` upsert), so these edits inherit the same semantics as
 * the shipping add-card path. A Hocuspocus-connection-aware live guard is a
 * follow-up; for now `wasRecentlyEditedLive` refuses when a fresh collaborative
 * snapshot exists (mirrors the `modify_doc` guard intent) so we don't stomp an
 * active editing session.
 *
 * Due-date changes ALSO sync the `board_card_due_dates` relational mirror — the
 * reminder worker scans that table, and a raw Yjs write would otherwise be
 * invisible to it (same upsert as `recordActivity`'s `due_changed` branch).
 */
import { promisify } from 'util';
import { gzip } from 'zlib';

import * as Y from 'yjs';

import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { createLogger } from '../../utils/logger.js';

import { FIELD_IDS, loadBoardYjsDoc, type FieldDef } from './BoardService.js';

const gzipAsync = promisify(gzip);
const log = createLogger('boardCardWriteService');

export interface CardChanges {
  title?: string;
  description?: string;
  /** Target status/column — resolved from name OR id against the board's status field. */
  status?: string;
  assignee?: string;
  /** ISO date string, or null to clear. */
  dueDate?: string | null;
}

export interface CardWriteResult {
  ok: true;
  cardId: string;
  applied: string[];
}

/**
 * Refuse when the board was very recently persisted by the collaborative editor
 * (a live session) — a side-channel write would risk CRDT divergence. Snapshots
 * are written by Hocuspocus, never by `addRowsToBoard`, so a fresh snapshot is a
 * reliable "someone is editing right now" signal.
 */
async function wasRecentlyEditedLive(boardId: string): Promise<boolean> {
  const db = getPostgresInstance();
  const rows = await db.query(
    `SELECT 1 FROM yjs_document_snapshots
     WHERE document_id = $1 AND created_at > NOW() - INTERVAL '30 seconds' LIMIT 1`,
    [boardId]
  );
  return rows.length > 0;
}

/** Resolve a status name (or raw id) to the option id defined on the board's status field. */
function resolveStatusId(fields: FieldDef[], status: string): string | null {
  const statusField = fields.find((f) => f.id === FIELD_IDS.STATUS);
  const options = Array.isArray(statusField?.typeOptions?.options)
    ? (statusField.typeOptions.options as Array<{ id: string; name: string }>)
    : [];
  const byId = options.find((o) => o.id === status);
  if (byId) return byId.id;
  const byName = options.find((o) => o.name.toLowerCase() === status.trim().toLowerCase());
  return byName?.id ?? null;
}

/**
 * Edit a card's cells in the board's Yjs doc and persist. Access must be checked
 * by the caller (e.g. `hasWriteAccess`). Throws on a missing board/card or an
 * unresolvable status; returns which fields were applied.
 */
export async function updateCard(
  boardId: string,
  cardId: string,
  changes: CardChanges
): Promise<CardWriteResult> {
  if (await wasRecentlyEditedLive(boardId)) {
    throw new Error('Board wird gerade bearbeitet — Änderung über den Editor vornehmen.');
  }

  const doc = await loadBoardYjsDoc(boardId);
  if (!doc) throw new Error(`Board ${boardId} nicht gefunden oder ohne Yjs-Dokument.`);

  const applied: string[] = [];
  let dueDateForMirror: string | null | undefined;

  // try/finally so the Y.Doc is always destroyed — including the throws below
  // (missing card, unknown status inside transact) which would otherwise leak it.
  try {
    const fields = doc.getArray('fields').toJSON() as FieldDef[];
    const yRows = doc.getArray<Y.Map<unknown>>('rows');

    let target: Y.Map<unknown> | null = null;
    for (const row of yRows) {
      if (row.get('id') === cardId) {
        target = row;
        break;
      }
    }
    if (!target) throw new Error(`Karte ${cardId} nicht auf Board ${boardId} gefunden.`);

    const cells = target.get('cells') as Y.Map<unknown> | undefined;
    if (!cells) throw new Error(`Karte ${cardId} hat keine Zellen.`);

    doc.transact(() => {
      if (typeof changes.title === 'string') {
        cells.set(FIELD_IDS.TITLE, changes.title);
        applied.push('Titel');
      }
      if (typeof changes.description === 'string') {
        cells.set(FIELD_IDS.DESCRIPTION, changes.description);
        applied.push('Beschreibung');
      }
      if (typeof changes.assignee === 'string') {
        cells.set(FIELD_IDS.ASSIGNEE, changes.assignee);
        applied.push('Zuständig');
      }
      if (changes.status !== undefined) {
        const statusId = resolveStatusId(fields, changes.status);
        if (!statusId)
          throw new Error(`Spalte/Status "${changes.status}" existiert nicht auf diesem Board.`);
        cells.set(FIELD_IDS.STATUS, statusId);
        applied.push('Status');
      }
      if (changes.dueDate !== undefined) {
        cells.set(FIELD_IDS.DUE_DATE, changes.dueDate);
        dueDateForMirror = changes.dueDate;
        applied.push('Fällig');
      }
    });

    if (applied.length === 0) return { ok: true, cardId, applied };

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
  } finally {
    doc.destroy();
  }

  const db = getPostgresInstance();
  // Keep the relational due-date mirror in lockstep (reminder worker scans it).
  if (dueDateForMirror !== undefined) {
    if (dueDateForMirror) {
      await db.query(
        `INSERT INTO board_card_due_dates (board_id, card_id, due_date, reminded_at, updated_at)
         VALUES ($1, $2, $3, NULL, CURRENT_TIMESTAMP)
         ON CONFLICT (board_id, card_id)
         DO UPDATE SET due_date = EXCLUDED.due_date, reminded_at = NULL, updated_at = CURRENT_TIMESTAMP`,
        [boardId, cardId, dueDateForMirror]
      );
    } else {
      await db.query(`DELETE FROM board_card_due_dates WHERE board_id = $1 AND card_id = $2`, [
        boardId,
        cardId,
      ]);
    }
  }

  log.info(`Updated card ${cardId} on board ${boardId}: ${applied.join(', ')}`);
  return { ok: true, cardId, applied };
}
