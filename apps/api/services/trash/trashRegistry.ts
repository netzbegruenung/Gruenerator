/**
 * The Papierkorb registry: one thin handler per kind. The router, the purge
 * worker and `trashRegistry.vitest.ts` all iterate this same set.
 *
 * The real work (trash/restore/purge SQL, rights, side stores) lives in each
 * kind's own service next to its old delete code; a handler only adapts that
 * service to one shape. Kinds without a handler yet answer 404.
 */
import { type TrashItem, type TrashKind } from '@gruenerator/contracts';

import {
  NotebookQdrantHelper,
  type TrashedNotebook,
} from '../../database/services/NotebookQdrantHelper.js';
import { getPostgresInstance } from '../../database/services/PostgresService.js';
import {
  getTrashedThread,
  listExpiredThreads,
  listTrashedThreads,
  purgeThread,
  restoreThread,
  trashThread,
  type TrashedThreadRow,
} from '../../routes/chat/services/threadTrashService.js';
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
import {
  getTrashedDocument,
  listExpiredDocuments,
  listTrashedDocuments,
  purgeDocument,
  restoreDocument,
  trashDocuments,
  type TrashedDocumentRow,
} from '../document-services/PostgresDocumentService/metadataOperations.js';

import { compareTrashKey, type TrashCursor } from './trashCursor.js';

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

const threadItem = (row: TrashedThreadRow): TrashItem =>
  toTrashItem({
    kind: 'chat_thread',
    id: row.id,
    title: row.title?.trim() || 'Unbenannter Chat',
    subtype: row.thread_type,
    deletedAt: row.deleted_at,
  });

const chatThreadHandler: TrashKindHandler = {
  async listTrashed(userId, opts) {
    return (await listTrashedThreads(userId, opts)).map(threadItem);
  },
  async getTrashed(userId, id) {
    const found = await getTrashedThread(id, userId);
    return found.status === 'ok' ? threadItem(found.row) : found.status;
  },
  async trash(userId, id) {
    const result = await trashThread(id, userId);
    return result === 'trashed' || result === 'deleted' ? 'ok' : result;
  },
  async restore(userId, id) {
    return (await restoreThread(id, userId)).status;
  },
  purge: purgeThread,
  listExpired: listExpiredThreads,
};

const notebookHelper = new NotebookQdrantHelper();

const notebookItem = (notebook: TrashedNotebook): TrashItem =>
  toTrashItem({
    kind: 'notebook',
    id: notebook.id,
    title: notebook.name,
    subtype: null,
    deletedAt: new Date(notebook.deleted_at),
  });

/**
 * Notebooks live only in Qdrant, which cannot sort by the trash key; the
 * user's trashed notebooks are few, so the page is cut in memory.
 */
const notebookHandler: TrashKindHandler = {
  async listTrashed(userId, opts) {
    const items = (await notebookHelper.listTrashedNotebookCollections(userId))
      .map(notebookItem)
      .sort(compareTrashKey);
    const before = opts.before;
    return (before ? items.filter((i) => compareTrashKey(i, before) > 0) : items).slice(
      0,
      opts.limit
    );
  },
  async getTrashed(userId, id) {
    const notebook = await notebookHelper.getTrashedNotebookCollection(id);
    if (!notebook) return 'not_found';
    return notebook.user_id === userId ? notebookItem(notebook) : 'forbidden';
  },
  async trash(userId, id) {
    const notebook = await notebookHelper.getNotebookCollection(id);
    if (!notebook) return 'not_found';
    if (notebook.user_id !== userId) return 'forbidden';
    return notebookHelper.trashNotebookCollection(id);
  },
  async restore(userId, id) {
    const found = await notebookHandler.getTrashed(userId, id);
    if (typeof found === 'string') return found;
    await notebookHelper.restoreNotebookCollection(id);
    return 'ok';
  },
  purge: (id, cutoff) => notebookHelper.purgeNotebookCollection(id, cutoff),
  async listExpired(cutoff, limit) {
    const expired = await notebookHelper.listExpiredNotebookCollections(cutoff, limit);
    return expired.map((n) => ({ id: n.id, userId: n.user_id }));
  },
};

const documentItem = (row: TrashedDocumentRow): TrashItem =>
  toTrashItem({
    kind: 'document',
    id: row.id,
    title: row.title,
    subtype: row.source_type,
    deletedAt: row.deleted_at,
  });

const documentHandler: TrashKindHandler = {
  async listTrashed(userId, opts) {
    return (await listTrashedDocuments(getPostgresInstance(), userId, opts)).map(documentItem);
  },
  async getTrashed(userId, id) {
    const found = await getTrashedDocument(getPostgresInstance(), id, userId);
    return found.status === 'ok' ? documentItem(found.row) : found.status;
  },
  async trash(userId, id) {
    const trashed = await trashDocuments(getPostgresInstance(), [id], userId);
    return trashed.length > 0 ? 'ok' : 'not_found';
  },
  async restore(userId, id) {
    return (await restoreDocument(getPostgresInstance(), id, userId)).status;
  },
  purge: (id, cutoff) => purgeDocument(getPostgresInstance(), id, cutoff),
  listExpired: (cutoff, limit) => listExpiredDocuments(getPostgresInstance(), cutoff, limit),
};

// Task 5 tightens this to `Record<TrashKind, TrashKindHandler>` once every kind has one.
export const TRASH_KINDS = {
  collaborative_document: collaborativeDocumentHandler,
  chat_thread: chatThreadHandler,
  notebook: notebookHandler,
  document: documentHandler,
} satisfies Partial<Record<TrashKind, TrashKindHandler>>;

export function trashHandlerFor(kind: TrashKind): TrashKindHandler | null {
  return (TRASH_KINDS as Partial<Record<TrashKind, TrashKindHandler>>)[kind] ?? null;
}
