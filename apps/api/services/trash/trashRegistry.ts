/**
 * The Papierkorb registry: one thin handler per kind. The router, the purge
 * worker and `trashRegistry.vitest.ts` all iterate this same set.
 *
 * The real work (trash/restore/purge SQL, rights, side stores) lives in each
 * kind's own service next to its old delete code; a handler only adapts that
 * service to one shape. Kinds without a handler yet answer 404.
 */
import { type TrashItem, type TrashKind } from '@gruenerator/contracts';

import { getPostgresInstance } from '../../database/services/PostgresService.js';
import {
  getTrashedCollaborativeDocument,
  listExpiredCollaborativeDocuments,
  listTrashedCollaborativeDocuments,
  purgeCollaborativeDocument,
  restoreCollaborativeDocument,
  trashCollaborativeDocument,
  type QueryRunner,
  type TrashedCollabDocRow,
} from '../docs/CollaborativeDocumentService.js';

import { type TrashCursor } from './trashCursor.js';

export const TRASH_RETENTION_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/** When the purge worker will remove an item trashed at `deletedAt`. */
export function purgeAtFor(deletedAt: Date): Date {
  return new Date(deletedAt.getTime() + TRASH_RETENTION_DAYS * DAY_MS);
}

export function toTrashItem(input: {
  kind: TrashKind;
  id: string;
  title: string;
  subtype: string | null;
  deletedAt: Date;
}): TrashItem {
  return {
    kind: input.kind,
    id: input.id,
    title: input.title,
    subtype: input.subtype,
    deletedAt: input.deletedAt.toISOString(),
    purgeAt: purgeAtFor(input.deletedAt).toISOString(),
  };
}

export type TrashLookup = TrashItem | 'not_found' | 'forbidden';

export interface TrashKindHandler {
  listTrashed(
    userId: string,
    opts: { limit: number; before: TrashCursor | null }
  ): Promise<TrashItem[]>;
  /**
   * One trashed item, if the user holds delete rights on it. Restore and
   * purge-now both go through this, so their rights are the delete rights.
   */
  getTrashed(userId: string, id: string): Promise<TrashLookup>;
  trash(userId: string, id: string): Promise<'ok' | 'not_found' | 'forbidden'>;
  restore(userId: string, id: string): Promise<'ok' | 'not_found' | 'forbidden' | 'conflict'>;
  /**
   * Idempotent hard delete plus side stores. Only a row trashed before `cutoff`
   * (any trashed row when null) is removed; true when a row was deleted.
   */
  purge(id: string, cutoff: Date | null): Promise<boolean>;
  listExpired(cutoff: Date, limit: number): Promise<Array<{ id: string; userId: string | null }>>;
}

const runQuery: QueryRunner = <T>(sql: string, params?: unknown[]) =>
  getPostgresInstance().query<T>(sql, params);

const collabItem = (row: TrashedCollabDocRow): TrashItem =>
  toTrashItem({
    kind: 'collaborative_document',
    id: row.id,
    title: row.title,
    subtype: row.document_subtype,
    deletedAt: row.deleted_at,
  });

const collaborativeDocumentHandler: TrashKindHandler = {
  async listTrashed(userId, opts) {
    const rows = await listTrashedCollaborativeDocuments(runQuery, userId, opts);
    return rows.map(collabItem);
  },
  async getTrashed(userId, id) {
    const found = await getTrashedCollaborativeDocument(runQuery, id, userId);
    return found.status === 'ok' ? collabItem(found.row) : found.status;
  },
  async trash(userId, id) {
    return (await trashCollaborativeDocument(runQuery, id, userId, null)).status;
  },
  async restore(userId, id) {
    return (await restoreCollaborativeDocument(runQuery, id, userId)).status;
  },
  purge(id, cutoff) {
    return purgeCollaborativeDocument(runQuery, id, cutoff);
  },
  listExpired(cutoff, limit) {
    return listExpiredCollaborativeDocuments(runQuery, cutoff, limit);
  },
};

// Task 5 tightens this to `Record<TrashKind, TrashKindHandler>` once every kind has one.
export const TRASH_KINDS = {
  collaborative_document: collaborativeDocumentHandler,
} satisfies Partial<Record<TrashKind, TrashKindHandler>>;

export function trashHandlerFor(kind: TrashKind): TrashKindHandler | null {
  return (TRASH_KINDS as Partial<Record<TrashKind, TrashKindHandler>>)[kind] ?? null;
}
