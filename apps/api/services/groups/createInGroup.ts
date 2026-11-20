import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { createLogger } from '../../utils/logger.js';

import { assertCanShareToGroup } from './groupMembership.js';
import { addGroupShare } from './groupShareWriter.js';

const log = createLogger('createInGroup');

/** Eine Abfrage auf der offenen Transaktion; liefert die Zeilen wie `PostgresService.query`. */
export type TxQuery = (text: string, params?: unknown[]) => Promise<Record<string, unknown>[]>;

/** Der Satz für die 403, wenn die Person im Projekt nicht teilen darf. */
export const CREATE_IN_GROUP_FORBIDDEN = 'Du kannst in diesem Projekt nichts anlegen.';

interface CreateInGroupInput<T extends { id: string }> {
  userId: string;
  groupId: string;
  /** Legt die `collaborative_documents`-Zeile an — auf `query`, nicht auf dem Pool. */
  insert: (query: TxQuery) => Promise<T>;
}

/**
 * „Neu im Projekt anlegen“: Inhalt und Freigabe entstehen in einer Transaktion. Darf
 * die Person im Projekt nicht teilen, wirft `addGroupShare` einen
 * `GroupShareForbiddenError`, und es bleibt kein loses Dokument zurück.
 *
 * Gemeinsam bearbeiten ist der Zweck: die Freigabe gibt Schreibrecht — außer im
 * System-Projekt, in dem jede Person Mitglied ist.
 */
export async function createInGroup<T extends { id: string }>({
  userId,
  groupId,
  insert,
}: CreateInGroupInput<T>): Promise<T> {
  return getPostgresInstance().transaction(async (client) => {
    const query: TxQuery = async (text, params) =>
      (await client.query<Record<string, unknown>>(text, params)).rows;
    const created = await insert(query);
    const group = await query('SELECT is_system FROM groups WHERE id = $1 AND deleted_at IS NULL', [
      groupId,
    ]);
    await addGroupShare({
      userId,
      groupId,
      contentType: 'collaborative_documents',
      contentId: created.id,
      permissions: { read: true, write: group[0]?.is_system !== true },
      // Ein leeres, gerade angelegtes Dokument ist keine Neuigkeit; im Feed steht es trotzdem.
      notify: false,
      tx: client,
    });
    return created;
  });
}

/** Darf die Person in dieses Projekt teilen? Vor dem Anlegen gefragt, damit ein Nein nichts hinterlässt. */
export async function mayShareIntoGroup(groupId: string, userId: string): Promise<boolean> {
  try {
    await assertCanShareToGroup(groupId, userId);
    return true;
  } catch {
    return false;
  }
}

/**
 * Für Inhalte, die nicht in eine Transaktion passen (hochgeladene Dateien, Text mit
 * Vektoren): das eben angelegte Dokument ins Projekt teilen. Scheitert das trotz
 * vorheriger {@link mayShareIntoGroup}-Prüfung, räumt `undo` das Dokument wieder ab,
 * und der Fehler geht weiter — ein Dokument, das niemand im Projekt sieht und die
 * Person nicht bestellt hat, bleibt so nicht liegen.
 */
export async function shareNewDocumentIntoGroup(
  { userId, groupId, documentId }: { userId: string; groupId: string; documentId: string },
  undo: () => Promise<unknown>
): Promise<void> {
  try {
    await addGroupShare({
      userId,
      groupId,
      contentType: 'documents',
      contentId: documentId,
      permissions: { read: true, write: false },
    });
  } catch (error) {
    await undo().catch((undoError: unknown) =>
      log.error(`[shareNewDocumentIntoGroup] undo failed for ${documentId}:`, undoError)
    );
    throw error;
  }
}
