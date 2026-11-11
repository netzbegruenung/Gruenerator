/**
 * Der eine Schreiber von `group_content_shares` — jeder Weg, der einen Inhalt
 * in ein Projekt legt, ihn herausnimmt oder seine Rechte ändert, kommt hier
 * vorbei: die Freigabe-Panels von Agents, Rezepten, Notebooks, Chats und
 * Dokumenten, der allgemeine Weg `shareContentToGroup` (Projektseite, Chat-
 * Bestätigungskarte, MCP) und `shareDocumentToGroup`.
 *
 * Die Aufrufer klären vorher, WELCHER Inhalt gemeint ist und ob er der Person
 * gehört (sie lösen Mention, Identifier oder Slug auf und antworten in ihrem
 * eigenen Contract). Hier liegt, was für jeden Typ gleich sein muss:
 *
 * 1. Teilen darf nur, wer im Projekt teilen darf (`assertCanShareToGroup`).
 *    Erst danach ändert sich irgendetwas — vorher hob der Notebook-Weg ein
 *    privates Notebook auch für eine fremde Projekt-ID auf „Projekte".
 * 2. Ein privater Inhalt wird beim ersten Projekt auf `share_mode='groups'`
 *    gehoben (`PROMOTE`), sonst läge eine tote Freigabe da, die kein Mitglied
 *    lesen kann. „Mit Anmeldung" reicht schon weiter und bleibt.
 * 3. Eine Freigabe je (Projekt, Typ, Inhalt): der Unique-Index
 *    `uq_group_content_shares_target` entscheidet, nicht ein SELECT davor.
 * 4. Wer Zugriff verliert, verliert ihn sofort: Herausnehmen und Rechte
 *    ändern schliessen den Collab-Raum des Inhalts.
 *
 * `groupShareWriteGuard.vitest.ts` hält fest, dass niemand sonst schreibt.
 */
import { NotebookQdrantHelper } from '../../database/services/NotebookQdrantHelper.js';
import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { closeShareRoom } from '../collab/collabRooms.js';

import { notifyContentShared } from './groupContent.js';
import { assertCanShareToGroup } from './groupMembership.js';
import { normalizeSharePermissions } from './groupSharePermissions.js';

import type { PostgresService } from '../../database/services/PostgresService.js';
import type { GroupContentType } from '@gruenerator/contracts';

/** Was in `content_type` steht: die Contract-Typen plus Chats, die ihren
 * eigenen Freigabe-Contract haben. */
export type ShareContentType = GroupContentType | 'chat_threads';

/** Wird zur kanonischen Form ergänzt (`normalizeSharePermissions`), damit
 * jede Zeile dieselbe Gestalt hat, egal welcher Weg sie schrieb. */
export type SharePermissions = Parameters<typeof normalizeSharePermissions>[0];

export interface GroupShareWriterDeps {
  postgres: Pick<PostgresService, 'query'>;
  /** Wirft, wenn `userId` in `groupId` nicht teilen darf. */
  assertCanShare: (groupId: string, userId: string) => Promise<unknown>;
  getNotebookCollection: NotebookQdrantHelper['getNotebookCollection'];
  updateNotebookCollection: NotebookQdrantHelper['updateNotebookCollection'];
  notifyShared: typeof notifyContentShared;
  closeRoom: typeof closeShareRoom;
}

let notebookHelper: NotebookQdrantHelper | null = null;

function defaultDeps(): GroupShareWriterDeps {
  const helper = (notebookHelper ??= new NotebookQdrantHelper());
  return {
    postgres: getPostgresInstance(),
    assertCanShare: assertCanShareToGroup,
    getNotebookCollection: (id) => helper.getNotebookCollection(id),
    updateNotebookCollection: (id, patch) => helper.updateNotebookCollection(id, patch),
    notifyShared: notifyContentShared,
    closeRoom: closeShareRoom,
  };
}

/**
 * Typen, deren Projekt-Lesezugriff `share_mode <> 'private'` verlangt
 * (`checkNotebookAccess`, `userAgentsRepository`, `GROUP_SHARE_EXISTS` der
 * Rezepte). Ein Notebook liegt in Qdrant, nicht in Postgres.
 */
const PROMOTE: Partial<
  Record<ShareContentType, (contentId: string, deps: GroupShareWriterDeps) => Promise<void>>
> = {
  user_agents: async (id, deps) => {
    await deps.postgres.query(
      `UPDATE user_agents SET share_mode = 'groups', updated_at = NOW()
        WHERE id = $1 AND share_mode = 'private'`,
      [id]
    );
  },
  user_text_forms: async (id, deps) => {
    await deps.postgres.query(
      `UPDATE user_text_forms SET share_mode = 'groups', updated_at = NOW()
        WHERE id = $1::uuid AND share_mode = 'private'`,
      [id]
    );
  },
  notebook_collections: async (id, deps) => {
    const collection = await deps.getNotebookCollection(id);
    if (
      collection &&
      collection.share_mode !== 'groups' &&
      collection.share_mode !== 'authenticated'
    ) {
      await deps.updateNotebookCollection(id, { share_mode: 'groups' });
    }
  },
};

export interface AddGroupShareInput {
  userId: string;
  groupId: string;
  contentType: ShareContentType;
  contentId: string;
  permissions: SharePermissions;
  /** Notiz für den Projekt-Feed; leer zählt als keine. */
  note?: string | null;
  /** Besteht die Freigabe schon: stehen lassen (Standard) oder ihre Rechte
   * auf `permissions` setzen (der Chat-Dialog wählt Lesen/Schreiben neu). */
  onExisting?: 'keep' | 'update-permissions';
  /** Fehlt er, steht der Anzeigename aus dem Profil in der Benachrichtigung. */
  sharerName?: string;
  /** `false` für Aufrufer mit eigener Benachrichtigung (Dokumente). */
  notify?: boolean;
}

export interface AddGroupShareResult {
  /** `false`: die Freigabe bestand schon. */
  created: boolean;
}

/**
 * Die Person darf in diesem Projekt nicht teilen. Trägt den Satz der
 * Mitgliedsprüfung weiter — der Projekt-Handler zeigt ihn als 403 —, und die
 * Freigabe-Router erkennen daran ihren 403, ohne einen DB-Fehler mitzufangen.
 */
export class GroupShareForbiddenError extends Error {
  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause), { cause });
    this.name = 'GroupShareForbiddenError';
  }
}

/** Wirft {@link GroupShareForbiddenError}, wenn die Person in diesem Projekt nicht teilen darf. */
export async function addGroupShare(
  input: AddGroupShareInput,
  deps: GroupShareWriterDeps = defaultDeps()
): Promise<AddGroupShareResult> {
  const { userId, groupId, contentType, contentId, permissions } = input;
  try {
    await deps.assertCanShare(groupId, userId);
  } catch (error) {
    throw new GroupShareForbiddenError(error);
  }
  await PROMOTE[contentType]?.(contentId, deps);

  const onConflict =
    input.onExisting === 'update-permissions'
      ? // Nur bei echtem Unterschied: sonst kommt keine Zeile zurück und der
        // Raum bleibt offen.
        `DO UPDATE SET permissions = EXCLUDED.permissions
            WHERE group_content_shares.permissions IS DISTINCT FROM EXCLUDED.permissions`
      : 'DO NOTHING';
  // `xmax = 0` unterscheidet im Upsert die neue Zeile von der aktualisierten.
  const rows = await deps.postgres.query<{ inserted: boolean }>(
    `INSERT INTO group_content_shares
        (content_type, content_id, group_id, shared_by_user_id, permissions, note)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (group_id, content_type, content_id) ${onConflict}
      RETURNING (xmax = 0) AS inserted`,
    [
      contentType,
      contentId,
      groupId,
      userId,
      JSON.stringify(normalizeSharePermissions(permissions)),
      input.note?.trim() || null,
    ]
  );
  const created = rows[0]?.inserted === true;
  if (!created && rows.length > 0) void deps.closeRoom(contentType, contentId);
  if (created && input.notify !== false) {
    deps.notifyShared({
      groupId,
      userId,
      contentType,
      contentId,
      ...(input.sharerName ? { sharerName: input.sharerName } : {}),
    });
  }
  return { created };
}

/** Nimmt einen Inhalt aus einem Projekt. `false`: er war dort nicht geteilt. */
export async function removeGroupShare(
  target: { groupId: string; contentType: ShareContentType; contentId: string },
  deps: Pick<GroupShareWriterDeps, 'postgres' | 'closeRoom'> = defaultDeps()
): Promise<boolean> {
  const rows = await deps.postgres.query(
    `DELETE FROM group_content_shares
      WHERE content_type = $1 AND content_id = $2 AND group_id = $3
      RETURNING id`,
    [target.contentType, target.contentId, target.groupId]
  );
  if (rows.length > 0) void deps.closeRoom(target.contentType, target.contentId);
  return rows.length > 0;
}

/** Nimmt einen Inhalt aus allen Projekten — „Privat" heisst: in keinem. */
export async function removeAllGroupShares(
  target: { contentType: ShareContentType; contentId: string },
  deps: Pick<GroupShareWriterDeps, 'postgres' | 'closeRoom'> = defaultDeps()
): Promise<number> {
  const rows = await deps.postgres.query(
    `DELETE FROM group_content_shares WHERE content_type = $1 AND content_id = $2 RETURNING id`,
    [target.contentType, target.contentId]
  );
  if (rows.length > 0) void deps.closeRoom(target.contentType, target.contentId);
  return rows.length;
}

/** Setzt die Rechte einer bestehenden Freigabe. `false`: es gibt sie nicht. */
export async function setGroupSharePermissions(
  target: {
    groupId: string;
    contentType: ShareContentType;
    contentId: string;
    permissions: SharePermissions;
  },
  deps: Pick<GroupShareWriterDeps, 'postgres' | 'closeRoom'> = defaultDeps()
): Promise<boolean> {
  const rows = await deps.postgres.query(
    `UPDATE group_content_shares SET permissions = $1
      WHERE content_type = $2 AND content_id = $3 AND group_id = $4
      RETURNING id`,
    [
      JSON.stringify(normalizeSharePermissions(target.permissions)),
      target.contentType,
      target.contentId,
      target.groupId,
    ]
  );
  if (rows.length > 0) void deps.closeRoom(target.contentType, target.contentId);
  return rows.length > 0;
}
