/**
 * The Papierkorb registry: one thin handler per kind. The router, the purge
 * worker and `trashRegistry.vitest.ts` all iterate this same set.
 *
 * The real work (trash/restore/purge SQL, rights, side stores) lives in each
 * kind's own service next to its old delete code; a handler only adapts that
 * service to one shape.
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
import { deleteLikesForEntity } from '../entityLikes/EntityLikesService.js';
import {
  getTrashedGroup,
  listExpiredGroups,
  listTrashedGroups,
  purgeGroup,
  restoreGroup,
  trashGroup,
  type TrashedGroup,
} from '../groups/groupTrash.js';
import { CUSTOM_PROMPT_TRASH, purgeCustomPrompt } from '../prompts/customPromptTrash.js';
import {
  deleteRecurringTask,
  purgeRecurringTask,
  RECURRING_TASK_TRASH,
} from '../recurringTasks/recurringTasksRepository.js';
import { getSharedMediaService, type TrashedShareRow } from '../sharedMediaService.js';
import { purgeUserSite, restoreUserSite, USER_SITE_TRASH } from '../sites/userSiteTrash.js';
import { getSubtitlerProjectService, type TrashedProjectRow } from '../subtitler/ProjectService.js';
import {
  purgeUserTemplate,
  trashUserTemplates,
  USER_TEMPLATE_TRASH,
} from '../templates/userTemplateTrash.js';
import { getKnowledgeService, KNOWLEDGE_TRASH } from '../user/KnowledgeService.js';
import {
  deleteLetterhead,
  LETTERHEAD_TRASH,
  purgeLetterhead,
} from '../user/letterheadRepository.js';
import { purgeSavedText, SAVED_TEXT_TRASH, trashSavedTexts } from '../user/savedTextTrash.js';
import { purgeTextForm, TEXT_FORM_TRASH } from '../user/textFormRepository.js';
import {
  deleteUserAgent,
  purgeUserAgent,
  USER_AGENT_TRASH,
} from '../userAgents/userAgentsRepository.js';

import {
  getTrashedOwnedRow,
  isRowId,
  listExpiredOwnedRows,
  listTrashedOwnedRows,
  purgeSideStore,
  restoreOwnedRow,
  trashOwnedRow,
  type OwnedRestoreResult,
  type OwnedTrashResult,
  type OwnedTrashTable,
  type Trashed,
} from './ownedRowTrash.js';
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
  deletedBeforeTrash?: boolean;
}): TrashItem {
  return {
    kind: input.kind,
    id: input.id,
    title: input.title,
    subtype: input.subtype,
    deletedAt: input.deletedAt.toISOString(),
    deletedBeforeTrash: input.deletedBeforeTrash ?? false,
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
    deletedBeforeTrash: row.deleted_before_trash,
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
  async purge(id, cutoff) {
    if (!(await notebookHelper.purgeNotebookCollection(id, cutoff))) return false;
    await purgeSideStore('notebook', id, 'entity_likes', () =>
      deleteLikesForEntity('notebook', id)
    );
    return true;
  },
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

const shareItem = (row: TrashedShareRow): TrashItem =>
  toTrashItem({
    kind: 'shared_media',
    id: row.share_token,
    title: row.title?.trim() || row.original_filename?.trim() || 'Ohne Titel',
    subtype: row.media_type,
    deletedAt: row.deleted_at,
  });

/** Keyed by `share_token`, the handle `DELETE /api/share/:shareToken` already uses. */
const sharedMediaHandler: TrashKindHandler = {
  async listTrashed(userId, opts) {
    return (await getSharedMediaService().listTrashedShares(userId, opts)).map(shareItem);
  },
  async getTrashed(userId, id) {
    const found = await getSharedMediaService().getTrashedShare(userId, id);
    return typeof found === 'string' ? found : shareItem(found);
  },
  trash: (userId, id) => getSharedMediaService().trashShare(userId, id),
  restore: (userId, id) => getSharedMediaService().restoreShare(userId, id),
  purge: (id, cutoff) => getSharedMediaService().purgeShare(id, cutoff),
  listExpired: (cutoff, limit) => getSharedMediaService().listExpiredShares(cutoff, limit),
};

const projectItem = (row: TrashedProjectRow): TrashItem =>
  toTrashItem({
    kind: 'subtitler_project',
    id: row.id,
    title: row.title.trim() || 'Unbenanntes Reel',
    subtype: null,
    deletedAt: row.deleted_at,
  });

const subtitlerProjectHandler: TrashKindHandler = {
  async listTrashed(userId, opts) {
    return (await getSubtitlerProjectService().listTrashedProjects(userId, opts)).map(projectItem);
  },
  async getTrashed(userId, id) {
    const found = await getSubtitlerProjectService().getTrashedProject(userId, id);
    return typeof found === 'string' ? found : projectItem(found);
  },
  trash: (userId, id) => getSubtitlerProjectService().trashProject(userId, id),
  restore: (userId, id) => getSubtitlerProjectService().restoreProject(userId, id),
  purge: (id, cutoff) => getSubtitlerProjectService().purgeProject(id, cutoff),
  listExpired: (cutoff, limit) => getSubtitlerProjectService().listExpiredProjects(cutoff, limit),
};

/** What an owner-bound kind adds to the shared steps in `ownedRowTrash.ts`. */
interface OwnedKindSpec<Row> {
  kind: TrashKind;
  table: OwnedTrashTable;
  title(row: Trashed<Row>): string;
  trash(userId: string, id: string): Promise<OwnedTrashResult>;
  /** Only where a restore can clash with more than a unique index. */
  restore?(userId: string, id: string): Promise<OwnedRestoreResult>;
  purge(id: string, cutoff: Date | null): Promise<boolean>;
}

function ownedRowHandler<Row>(spec: OwnedKindSpec<Row>): TrashKindHandler {
  const item = (row: Trashed<Row>): TrashItem =>
    toTrashItem({
      kind: spec.kind,
      id: row.id,
      title: spec.title(row),
      subtype: null,
      deletedAt: new Date(row.deleted_at),
    });
  return {
    async listTrashed(userId, opts) {
      return (await listTrashedOwnedRows<Row>(spec.table, userId, opts)).map(item);
    },
    async getTrashed(userId, id) {
      const found = await getTrashedOwnedRow<Row>(spec.table, userId, id);
      return typeof found === 'string' ? found : item(found);
    },
    trash: spec.trash,
    restore: spec.restore ?? ((userId, id) => restoreOwnedRow(spec.table, userId, id)),
    purge: spec.purge,
    listExpired: (cutoff, limit) => listExpiredOwnedRows(spec.table, cutoff, limit),
  };
}

type Titled = { title: string | null };

const titled = (value: string | null, fallback: string): string => value?.trim() || fallback;

const okOr404 = (done: boolean): OwnedTrashResult => (done ? 'ok' : 'not_found');

const userAgentHandler = ownedRowHandler<Titled>({
  kind: 'user_agent',
  table: USER_AGENT_TRASH,
  title: (row) => titled(row.title, 'Unbenannter Agent'),
  trash: async (userId, id) => okOr404(await deleteUserAgent(userId, id)),
  purge: purgeUserAgent,
});

const userTemplateHandler = ownedRowHandler<Titled>({
  kind: 'user_template',
  table: USER_TEMPLATE_TRASH,
  title: (row) => titled(row.title, 'Unbenannte Vorlage'),
  trash: async (userId, id) => okOr404((await trashUserTemplates(userId, [id])).length > 0),
  purge: purgeUserTemplate,
});

const userTextFormHandler = ownedRowHandler<Titled>({
  kind: 'user_text_form',
  table: TEXT_FORM_TRASH,
  title: (row) => titled(row.title, 'Unbenanntes Rezept'),
  trash: (userId, id) => trashOwnedRow(TEXT_FORM_TRASH, userId, id),
  purge: purgeTextForm,
});

const customPromptHandler = ownedRowHandler<Titled>({
  kind: 'custom_prompt',
  table: CUSTOM_PROMPT_TRASH,
  title: (row) => titled(row.title, 'Unbenannter Prompt'),
  trash: (userId, id) => trashOwnedRow(CUSTOM_PROMPT_TRASH, userId, id),
  purge: purgeCustomPrompt,
});

const userSiteHandler = ownedRowHandler<Titled>({
  kind: 'user_site',
  table: USER_SITE_TRASH,
  title: (row) => titled(row.title, 'Unbenannte Website'),
  trash: (userId, id) => trashOwnedRow(USER_SITE_TRASH, userId, id),
  restore: restoreUserSite,
  purge: purgeUserSite,
});

const recurringTaskHandler = ownedRowHandler<Titled>({
  kind: 'recurring_task',
  table: RECURRING_TASK_TRASH,
  title: (row) => titled(row.title, 'Unbenannte Wiederkehrende Aufgabe'),
  trash: async (userId, id) => okOr404(await deleteRecurringTask(userId, id)),
  purge: purgeRecurringTask,
});

const userLetterheadHandler = ownedRowHandler<Titled>({
  kind: 'user_letterhead',
  table: LETTERHEAD_TRASH,
  title: (row) => titled(row.title, 'Unbenannter Briefkopf'),
  trash: async (userId, id) => okOr404(isRowId(id) && (await deleteLetterhead(userId, id))),
  purge: purgeLetterhead,
});

const userDocumentHandler = ownedRowHandler<Titled>({
  kind: 'user_document',
  table: SAVED_TEXT_TRASH,
  title: (row) => titled(row.title, 'Unbenannter Text'),
  trash: async (userId, id) => okOr404((await trashSavedTexts(userId, [id])).length > 0),
  purge: purgeSavedText,
});

const userKnowledgeHandler = ownedRowHandler<Titled>({
  kind: 'user_knowledge',
  table: KNOWLEDGE_TRASH,
  title: (row) => titled(row.title, 'Unbenannter Eintrag'),
  trash: (userId, id) => trashOwnedRow(KNOWLEDGE_TRASH, userId, id),
  purge: (id, cutoff) => getKnowledgeService().purgeUserKnowledge(id, cutoff),
});

const groupItem = (row: TrashedGroup): TrashItem =>
  toTrashItem({
    kind: 'group',
    id: row.id,
    title: titled(row.name, 'Unbenanntes Projekt'),
    subtype: row.group_type,
    deletedAt: new Date(row.deleted_at),
  });

/** Rights are creator or admin member, not `user_id` — hence not an owned-row kind. */
const groupHandler: TrashKindHandler = {
  async listTrashed(userId, opts) {
    return (await listTrashedGroups(userId, opts)).map(groupItem);
  },
  async getTrashed(userId, id) {
    const found = await getTrashedGroup(userId, id);
    return typeof found === 'string' ? found : groupItem(found);
  },
  async trash(userId, id) {
    const result = await trashGroup(userId, id);
    return result === 'system' ? 'forbidden' : result;
  },
  restore: restoreGroup,
  purge: purgeGroup,
  listExpired: listExpiredGroups,
};

export const TRASH_KINDS = {
  collaborative_document: collaborativeDocumentHandler,
  chat_thread: chatThreadHandler,
  notebook: notebookHandler,
  document: documentHandler,
  shared_media: sharedMediaHandler,
  subtitler_project: subtitlerProjectHandler,
  user_agent: userAgentHandler,
  user_template: userTemplateHandler,
  user_text_form: userTextFormHandler,
  custom_prompt: customPromptHandler,
  user_site: userSiteHandler,
  recurring_task: recurringTaskHandler,
  user_letterhead: userLetterheadHandler,
  user_document: userDocumentHandler,
  user_knowledge: userKnowledgeHandler,
  group: groupHandler,
} satisfies Record<TrashKind, TrashKindHandler>;

export function trashHandlerFor(kind: TrashKind): TrashKindHandler {
  return TRASH_KINDS[kind];
}
