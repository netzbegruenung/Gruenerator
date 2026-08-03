/**
 * Push-ingest target: user notebook.
 *
 * Pushes an article into a user-created notebook (not a curated LV collection).
 * Reuses the existing document pipeline: `processUrlContent` creates the document
 * + embeds it into the shared `documents` Qdrant collection, then
 * `addDocumentsToCollection` links it to the notebook. Authorization is the API
 * key user's edit permission on the notebook (`requireNotebookEdit`).
 *
 * Dedup key: the article's source url, stored at `documents.metadata.originalUrl`
 * by `processUrlContent`. A re-push of an edited article deletes the old document
 * first (→ 'updated'); an unchanged re-push still replaces (idempotent by url).
 */
import { extractSlugSuffix } from '@gruenerator/shared/utils';

import { NotebookQdrantHelper } from '../../database/services/NotebookQdrantHelper.js';
import { getPostgresInstance } from '../../database/services/PostgresService/index.js';
import { requireNotebookEdit } from '../../routes/notebook/notebookAccess.js';
import { getDocumentProcessingService } from '../document-services/DocumentProcessingService/index.js';
import { getQdrantDocumentService } from '../document-services/DocumentSearchService/index.js';
import { getPostgresDocumentService } from '../document-services/PostgresDocumentService/index.js';

import { PushIngestError } from './errors.js';

import type { DeleteOutcome, IngestOutcome } from './landesverbandTarget.js';

const NOTEBOOK_SOURCE_TYPE = 'wordpress_plugin';

export interface NotebookIngestInput {
  notebookId: string;
  userId: string;
  sourceUrl: string;
  title: string;
  contentText: string;
}

const helper = new NotebookQdrantHelper();

/** Resolve a notebook by UUID or Notion-style slug, then assert the user may edit it. */
async function resolveOwnedNotebook(notebookId: string, userId: string): Promise<string> {
  let collection = await helper.getNotebookCollection(notebookId);
  if (!collection) {
    const suffix = extractSlugSuffix(notebookId) ?? notebookId;
    collection = await helper.getNotebookCollectionBySlugSuffix(suffix);
  }
  if (!collection) throw new PushIngestError(404, `Unknown notebook: ${notebookId}`);

  const denied = await requireNotebookEdit(collection.id, userId);
  if (denied) throw new PushIngestError(denied.status, denied.body.error);

  return collection.id;
}

/** Find a user's existing pushed document for a source url (dedup key). */
async function findExistingDocumentId(userId: string, sourceUrl: string): Promise<string | null> {
  const postgres = getPostgresInstance();
  const row = await postgres.queryOne<{ id: string }>(
    `SELECT id FROM documents
       WHERE user_id = $1
         AND source_type = $2
         AND metadata->>'originalUrl' = $3
       ORDER BY created_at DESC
       LIMIT 1`,
    [userId, NOTEBOOK_SOURCE_TYPE, sourceUrl]
  );
  return row?.id ?? null;
}

/** Fully remove a document: vectors, metadata row, and any notebook links. */
async function purgeDocument(
  documentId: string,
  userId: string,
  notebookId: string
): Promise<void> {
  await helper.removeDocumentsFromCollection(notebookId, [documentId]);
  await getQdrantDocumentService().deleteDocumentVectors(documentId, userId);
  await getPostgresDocumentService().deleteDocument(documentId, userId);
}

/** Ingest one article into a user notebook (replacing any earlier version by url). */
export async function ingestNotebookArticle(input: NotebookIngestInput): Promise<IngestOutcome> {
  const notebookId = await resolveOwnedNotebook(input.notebookId, input.userId);

  const existingId = await findExistingDocumentId(input.userId, input.sourceUrl);
  if (existingId) {
    await purgeDocument(existingId, input.userId, notebookId);
  }

  const result = await getDocumentProcessingService().processUrlContent(
    input.userId,
    input.sourceUrl,
    input.title,
    input.contentText,
    NOTEBOOK_SOURCE_TYPE
  );

  await helper.addDocumentsToCollection(notebookId, [result.id], input.userId);

  return {
    action: existingId ? 'updated' : 'stored',
    documentId: result.id,
    vectors: result.vectorCount,
    reason: null,
  };
}

/** Delete a previously-pushed article from a user notebook by source url. */
export async function deleteNotebookArticle(
  notebookId: string,
  userId: string,
  sourceUrl: string
): Promise<DeleteOutcome> {
  const resolvedId = await resolveOwnedNotebook(notebookId, userId);

  const existingId = await findExistingDocumentId(userId, sourceUrl);
  if (!existingId) return { action: 'skipped', removed: 0 };

  await purgeDocument(existingId, userId, resolvedId);
  return { action: 'deleted', removed: 1 };
}
