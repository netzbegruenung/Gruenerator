/**
 * ts-rest contract router for /api/auth/notebook-collections (CRUD routes).
 *
 * Wraps the same NotebookQdrantHelper + service calls as collectionsController.ts
 * using a contract-driven router from @ts-rest/express.
 *
 * Mount BEFORE the legacy collectionsController router in routes.ts so
 * ts-rest matches its own routes first; unmatched paths fall through to
 * the legacy router.
 *
 * ## Authentication
 * All routes require authentication. `requireAuth` middleware is applied at
 * the path prefix in routes.ts before this contract is mounted, so
 * `req.user` is always present. `getUserId()` throws when it is not (safety
 * guard only — should never fire in production).
 */

import { notebookCollectionsContract } from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import { env } from '../../config/env.js';
import { NotebookQdrantHelper } from '../../database/services/NotebookQdrantHelper.js';
import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { processUploadedDocument } from '../../services/document-services/DocumentProcessingService/index.js';
import { getQdrantDocumentService } from '../../services/document-services/DocumentSearchService/index.js';
import { getPostgresDocumentService } from '../../services/document-services/PostgresDocumentService/index.js';
import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { createLogger } from '../../utils/logger.js';
import { fromParam, type DocumentId, type NotebookId } from '../../utils/types/branded.js';

import type { DocumentRecord, WolkeShareLink } from './types.js';
import type { UserProfile } from '../../services/user/types.js';
import type { Application, Request } from 'express';

const log = createLogger('notebookCollectionsContractRouter');
const notebookHelper = new NotebookQdrantHelper();

/**
 * Extract the authenticated user id.
 * The requireAuth middleware in routes.ts ensures req.user is set before
 * this router is reached — this function is a safety guard only.
 */
function getUserId(req: Request): string {
  const user = req.user as UserProfile | undefined;
  if (!user?.id) {
    log.error(
      '[notebookCollectionsContract] getUserId called with undefined req.user — middleware bypassed? url=%s',
      req.originalUrl
    );
    throw new Error('Authentication required');
  }
  return user.id;
}

// ── Helpers copied from collectionsController ──────────────────────────────

async function resolveWolkeLinksToDocuments(
  userId: string,
  wolkeShareLinkIds: string[]
): Promise<DocumentRecord[]> {
  if (!wolkeShareLinkIds || !Array.isArray(wolkeShareLinkIds) || wolkeShareLinkIds.length === 0) {
    return [];
  }
  const postgres = getPostgresInstance();
  try {
    const documents = await postgres.query<DocumentRecord>(
      `
      SELECT id, title, page_count, created_at, source_type, wolke_share_link_id
      FROM documents
      WHERE user_id = $1
      AND source_type = 'wolke'
      AND wolke_share_link_id = ANY($2)
      AND status = 'completed'
      ORDER BY created_at DESC
      `,
      [userId, wolkeShareLinkIds]
    );
    log.debug(
      `[notebookCollectionsContract] Resolved ${wolkeShareLinkIds.length} Wolke links to ${documents.length} documents`
    );
    return documents;
  } catch (error) {
    log.error('[notebookCollectionsContract] Error resolving Wolke links:', error);
    throw new Error('Failed to resolve Wolke links to documents');
  }
}

async function validateWolkeShareLinks(
  _userId: string,
  wolkeShareLinkIds: string[]
): Promise<boolean> {
  if (!wolkeShareLinkIds || !Array.isArray(wolkeShareLinkIds) || wolkeShareLinkIds.length === 0) {
    return true;
  }
  // Validation logic is currently a pass-through (mirrors collectionsController).
  return true;
}

// ── Contract router ────────────────────────────────────────────────────────

const s = initServer();

export const notebookCollectionsContractRouter = s.router(notebookCollectionsContract, {
  listCollections: async (args) => {
    try {
      const userId = getUserId(args.req);
      const postgres = getPostgresInstance();

      type NotebookCollectionFromQdrantRaw = {
        id: string;
        user_id: string;
        name: string;
        description: string | null;
        custom_prompt: string | null;
        selection_mode?: string | undefined;
        wolke_share_link_ids?: string[] | null | undefined;
        auto_sync?: boolean | undefined;
        remove_missing_on_sync?: boolean | undefined;
        created_at: string;
        updated_at: string;
        settings?: Record<string, unknown> | undefined;
        notebook_collection_documents?: Array<{ document_id: string }>;
      };

      const collections = (await notebookHelper.getUserNotebookCollections(
        userId
      )) as NotebookCollectionFromQdrantRaw[];

      const transformedData = await Promise.all(
        collections.map(async (collection) => {
          const documentIds = (collection.notebook_collection_documents || []).map(
            (qcd) => qcd.document_id
          );

          let documents: DocumentRecord[] = [];
          if (documentIds.length > 0) {
            documents = await postgres.query<DocumentRecord>(
              'SELECT id, title, page_count, created_at, source_type, wolke_share_link_id FROM documents WHERE id = ANY($1)',
              [documentIds]
            );
          }

          let wolke_share_links: WolkeShareLink[] = [];
          if (collection.wolke_share_link_ids) {
            try {
              wolke_share_links = collection.wolke_share_link_ids.map((id) => ({ id }));
            } catch (error) {
              log.error('[notebookCollectionsContract] Error fetching Wolke share links:', error);
            }
          }

          const settings = (collection.settings as Record<string, unknown>) || {};
          const labels = Array.isArray(settings.labels) ? (settings.labels as string[]) : [];

          return {
            ...collection,
            documents,
            document_count: documents.length,
            selection_mode: collection.selection_mode || 'documents',
            wolke_share_links,
            has_wolke_sources: wolke_share_links.length > 0,
            documents_from_wolke: documents.filter((doc) => doc.source_type === 'wolke').length,
            auto_sync: !!collection.auto_sync,
            remove_missing_on_sync: !!collection.remove_missing_on_sync,
            labels,
          };
        })
      );

      return {
        status: 200 as const,
        body: { success: true, collections: transformedData },
      };
    } catch (error) {
      log.error('[notebookCollectionsContract.listCollections] Error:', error);
      return { status: 500 as const, body: { error: 'Internal server error' } };
    }
  },

  createCollection: async (args) => {
    try {
      const userId = getUserId(args.req);
      const postgres = getPostgresInstance();

      const {
        name,
        description,
        custom_prompt,
        selection_mode: selectionModeRaw,
        document_ids: documentIdsRaw,
        wolke_share_link_ids: wolkeLinkIdsRaw,
        auto_sync,
        remove_missing_on_sync,
        labels,
      } = args.body;

      const selection_mode = selectionModeRaw ?? 'documents';
      const document_ids = documentIdsRaw ?? [];
      const wolke_share_link_ids = wolkeLinkIdsRaw ?? [];

      if (!name || !name.trim()) {
        return { status: 400 as const, body: { error: 'Name is required' } };
      }

      if (Array.isArray(document_ids) && document_ids.length > 100) {
        return {
          status: 400 as const,
          body: { error: 'A notebook can contain at most 100 documents' },
        };
      }

      let allDocumentIds: string[] = [];
      let wolkeDocuments: DocumentRecord[] = [];

      if (selection_mode === 'wolke') {
        if (wolke_share_link_ids.length === 0) {
          return {
            status: 400 as const,
            body: { error: 'At least one Wolke share link must be selected' },
          };
        }

        const hasAccess = await validateWolkeShareLinks(userId, wolke_share_link_ids);
        if (!hasAccess) {
          return {
            status: 403 as const,
            body: { error: 'Access denied to one or more Wolke share links' },
          };
        }

        wolkeDocuments = await resolveWolkeLinksToDocuments(userId, wolke_share_link_ids);
        allDocumentIds = wolkeDocuments.map((doc) => doc.id);

        if (allDocumentIds.length === 0) {
          return {
            status: 400 as const,
            body: {
              error:
                'No documents found in the selected Wolke folders. Please sync the folders first.',
            },
          };
        }
      } else {
        if (document_ids.length === 0) {
          return {
            status: 400 as const,
            body: { error: 'At least one document must be selected' },
          };
        }

        const userDocuments = (await postgres.query(
          'SELECT id FROM documents WHERE user_id = $1 AND id = ANY($2)',
          [userId, document_ids]
        )) as Array<{ id: string }>;

        if (userDocuments.length !== document_ids.length) {
          return {
            status: 403 as const,
            body: { error: 'Access denied to one or more documents' },
          };
        }

        allDocumentIds = document_ids;
      }

      const collectionData = {
        user_id: userId,
        name: name.trim(),
        description: description?.trim() ?? null,
        custom_prompt: custom_prompt?.trim() ?? null,
        selection_mode,
        document_count: allDocumentIds.length,
        wolke_share_link_ids: selection_mode === 'wolke' ? wolke_share_link_ids : null,
        auto_sync: selection_mode === 'wolke' ? !!(auto_sync ?? false) : false,
        remove_missing_on_sync:
          selection_mode === 'wolke' ? !!(remove_missing_on_sync ?? false) : false,
        settings: {
          ...(Array.isArray(labels) ? { labels: labels.map((l) => l.trim()).filter(Boolean) } : {}),
        },
      };

      const result = await notebookHelper.storeNotebookCollection(collectionData);
      const collectionId = result.collection_id;

      try {
        await notebookHelper.addDocumentsToCollection(collectionId, allDocumentIds, userId);
      } catch (docError) {
        log.error(
          '[notebookCollectionsContract.createCollection] Error adding documents:',
          docError
        );
        await notebookHelper.deleteNotebookCollection(collectionId);
        return { status: 500 as const, body: { error: 'Failed to add documents to collection' } };
      }

      // Fire-and-forget: process any documents still in 'uploaded' state
      if (selection_mode !== 'wolke' && allDocumentIds.length > 0) {
        const pendingDocs = (await postgres.query(
          `SELECT id FROM documents WHERE id = ANY($1) AND user_id = $2 AND status = 'uploaded'`,
          [allDocumentIds, userId]
        )) as Array<{ id: string }>;

        if (pendingDocs.length > 0) {
          const pgDocService = getPostgresDocumentService();
          const qdrantDocService = getQdrantDocumentService();
          for (const doc of pendingDocs) {
            processUploadedDocument(pgDocService, qdrantDocService, doc.id, userId).catch((err) => {
              log.error(
                `[notebookCollectionsContract.createCollection] Background processing failed for doc ${doc.id} in collection ${collectionId}:`,
                err
              );
            });
          }
        }
      }

      return {
        status: 201 as const,
        body: {
          success: true,
          collection: {
            id: collectionId,
            ...collectionData,
            document_count: allDocumentIds.length,
            documents_from_wolke: selection_mode === 'wolke' ? wolkeDocuments.length : 0,
            wolke_share_links: selection_mode === 'wolke' ? wolke_share_link_ids : [],
            created_at: new Date().toISOString(),
          },
          message: `Notebook collection created successfully with ${allDocumentIds.length} document(s)`,
        },
      };
    } catch (error) {
      log.error('[notebookCollectionsContract.createCollection] Error:', error);
      return { status: 500 as const, body: { error: 'Internal server error' } };
    }
  },

  updateCollection: async (args) => {
    try {
      const userId = getUserId(args.req);
      const postgres = getPostgresInstance();
      const collectionId = fromParam<NotebookId>(args.params.id);

      const {
        name,
        description,
        custom_prompt,
        selection_mode: selectionModeRaw,
        document_ids: documentIdsRaw,
        wolke_share_link_ids: wolkeLinkIdsRaw,
        auto_sync,
        remove_missing_on_sync,
        labels,
      } = args.body;

      const selection_mode = selectionModeRaw ?? 'documents';
      const document_ids = documentIdsRaw ?? [];
      const wolke_share_link_ids = wolkeLinkIdsRaw ?? [];

      if (!name || !name.trim()) {
        return { status: 400 as const, body: { error: 'Name is required' } };
      }

      if (Array.isArray(document_ids) && document_ids.length > 100) {
        return {
          status: 400 as const,
          body: { error: 'A notebook can contain at most 100 documents' },
        };
      }

      const existingCollection = await notebookHelper.getNotebookCollection(collectionId);
      if (!existingCollection || existingCollection.user_id !== userId) {
        return { status: 404 as const, body: { error: 'Notebook collection not found' } };
      }

      let allDocumentIds: string[] = [];
      let wolkeDocuments: DocumentRecord[] = [];

      if (selection_mode === 'wolke') {
        if (wolke_share_link_ids.length === 0) {
          return {
            status: 400 as const,
            body: { error: 'At least one Wolke share link must be selected' },
          };
        }

        const hasAccess = await validateWolkeShareLinks(userId, wolke_share_link_ids);
        if (!hasAccess) {
          return {
            status: 403 as const,
            body: { error: 'Access denied to one or more Wolke share links' },
          };
        }

        wolkeDocuments = await resolveWolkeLinksToDocuments(userId, wolke_share_link_ids);
        allDocumentIds = wolkeDocuments.map((doc) => doc.id);

        if (allDocumentIds.length === 0) {
          return {
            status: 400 as const,
            body: {
              error:
                'No documents found in the selected Wolke folders. Please sync the folders first.',
            },
          };
        }
      } else {
        if (document_ids.length === 0) {
          return {
            status: 400 as const,
            body: { error: 'At least one document must be selected' },
          };
        }

        const userDocuments = (await postgres.query(
          'SELECT id FROM documents WHERE user_id = $1 AND id = ANY($2)',
          [userId, document_ids]
        )) as Array<{ id: string }>;

        if (userDocuments.length !== document_ids.length) {
          return {
            status: 403 as const,
            body: { error: 'Access denied to one or more documents' },
          };
        }

        allDocumentIds = document_ids;
      }

      const updateData: Record<string, unknown> = {
        name: name.trim(),
        description: description?.trim() ?? null,
        custom_prompt: custom_prompt?.trim() ?? null,
        selection_mode,
        document_count: allDocumentIds.length,
        wolke_share_link_ids: selection_mode === 'wolke' ? wolke_share_link_ids : null,
      };

      if (Array.isArray(labels)) {
        const existingSettings = (existingCollection.settings as Record<string, unknown>) || {};
        updateData.settings = {
          ...existingSettings,
          labels: labels.map((l) => l.trim()).filter(Boolean),
        };
      }

      if (selection_mode === 'wolke') {
        if (typeof auto_sync === 'boolean') updateData.auto_sync = auto_sync;
        if (typeof remove_missing_on_sync === 'boolean')
          updateData.remove_missing_on_sync = remove_missing_on_sync;
      } else {
        updateData.auto_sync = false;
        updateData.remove_missing_on_sync = false;
      }

      await notebookHelper.updateNotebookCollection(collectionId, updateData);

      const existingDocuments = await notebookHelper.getCollectionDocuments(collectionId);
      const existingDocIds = existingDocuments.map((doc) => doc.document_id);

      if (existingDocIds.length > 0) {
        await notebookHelper.removeDocumentsFromCollection(collectionId, existingDocIds);
      }

      await notebookHelper.addDocumentsToCollection(collectionId, allDocumentIds, userId);

      return {
        status: 200 as const,
        body: {
          success: true,
          message: `Notebook collection updated successfully with ${allDocumentIds.length} document(s)`,
          documents_from_wolke: selection_mode === 'wolke' ? wolkeDocuments.length : 0,
          wolke_share_links: selection_mode === 'wolke' ? wolke_share_link_ids : [],
        },
      };
    } catch (error) {
      log.error('[notebookCollectionsContract.updateCollection] Error:', error);
      return { status: 500 as const, body: { error: 'Internal server error' } };
    }
  },

  syncCollection: async (args) => {
    try {
      const userId = getUserId(args.req);
      const collectionId = fromParam<NotebookId>(args.params.id);

      const collection = await notebookHelper.getNotebookCollection(collectionId);
      if (!collection || collection.user_id !== userId) {
        return { status: 404 as const, body: { error: 'Notebook collection not found' } };
      }

      if ((collection.selection_mode || 'documents') !== 'wolke') {
        return {
          status: 400 as const,
          body: { error: 'Sync is only available for Wolke-based collections' },
        };
      }

      const wolkeLinkIds = (collection.wolke_share_link_ids as string[] | null) || [];
      if (!Array.isArray(wolkeLinkIds) || wolkeLinkIds.length === 0) {
        return {
          status: 400 as const,
          body: { error: 'No Wolke share links configured for this collection' },
        };
      }

      const hasAccess = await validateWolkeShareLinks(userId, wolkeLinkIds);
      if (!hasAccess) {
        return {
          status: 403 as const,
          body: { error: 'Access denied to one or more Wolke share links' },
        };
      }

      const wolkeDocuments = await resolveWolkeLinksToDocuments(userId, wolkeLinkIds);
      const currentDocIds = new Set((wolkeDocuments || []).map((d) => d.id));

      const existing = await notebookHelper.getCollectionDocuments(collectionId);
      const existingIds = new Set((existing || []).map((ed) => ed.document_id));

      const docsToAdd = [...currentDocIds].filter((id) => !existingIds.has(id));
      const shouldRemove = !!(collection.remove_missing_on_sync as boolean | undefined);
      const docsToRemove = shouldRemove
        ? [...existingIds].filter((id) => !currentDocIds.has(id))
        : [];

      let addedCount = 0;
      if (docsToAdd.length > 0) {
        await notebookHelper.addDocumentsToCollection(collectionId, docsToAdd, userId);
        addedCount = docsToAdd.length;
      }

      let removedCount = 0;
      if (docsToRemove.length > 0) {
        await notebookHelper.removeDocumentsFromCollection(collectionId, docsToRemove);
        removedCount = docsToRemove.length;
      }

      const newTotal = existingIds.size + addedCount - removedCount;
      await notebookHelper.updateNotebookCollection(collectionId, { document_count: newTotal });

      return {
        status: 200 as const,
        body: {
          success: true,
          message: `Collection synchronized. ${addedCount} added, ${removedCount} removed.`,
          added_count: addedCount,
          removed_count: removedCount,
          total_count: newTotal,
          wolke_share_links: wolkeLinkIds,
        },
      };
    } catch (error) {
      log.error('[notebookCollectionsContract.syncCollection] Error:', error);
      return { status: 500 as const, body: { error: 'Internal server error' } };
    }
  },

  searchCollection: async (args) => {
    try {
      const userId = getUserId(args.req);
      const collectionId = fromParam<NotebookId>(args.params.id);
      const query = args.query.q.trim();

      if (!query) {
        return {
          status: 400 as const,
          body: { error: 'Query parameter "q" is required' },
        };
      }

      const collection = await notebookHelper.getNotebookCollection(collectionId);
      if (!collection || collection.user_id !== userId) {
        return { status: 404 as const, body: { error: 'Notebook collection not found' } };
      }

      const collectionDocs = await notebookHelper.getCollectionDocuments(collectionId);
      const documentIds = collectionDocs.map((d) => d.document_id);

      if (documentIds.length === 0) {
        return { status: 200 as const, body: [] };
      }

      const documentSearchService = getQdrantDocumentService();
      const response = await documentSearchService.search({
        query,
        userId,
        options: { limit: 8, mode: 'hybrid', threshold: 0.2 },
        filters: { documentIds },
      });

      const results = (response.results || []).slice(0, 8).map((r) => ({
        documentId: r.document_id,
        title: r.title || r.source_url || 'Unbekannt',
        excerpt: (r.relevant_content || '').slice(0, 200),
        score: r.similarity_score ?? 0,
      }));

      return { status: 200 as const, body: results };
    } catch (error) {
      log.error('[notebookCollectionsContract.searchCollection] Error:', error);
      return { status: 500 as const, body: { error: 'Search failed' } };
    }
  },

  deleteCollection: async (args) => {
    try {
      const userId = getUserId(args.req);
      const collectionId = fromParam<NotebookId>(args.params.id);

      const existingCollection = await notebookHelper.getNotebookCollection(collectionId);
      if (!existingCollection || existingCollection.user_id !== userId) {
        return { status: 404 as const, body: { error: 'Notebook collection not found' } };
      }

      await notebookHelper.deleteNotebookCollection(collectionId);

      return {
        status: 200 as const,
        body: { success: true, message: 'Notebook collection deleted successfully' },
      };
    } catch (error) {
      log.error('[notebookCollectionsContract.deleteCollection] Error:', error);
      return {
        status: 500 as const,
        body: { error: 'Failed to delete Notebook collection' },
      };
    }
  },

  shareCollection: async (args) => {
    try {
      const userId = getUserId(args.req);
      const collectionId = fromParam<NotebookId>(args.params.id);

      const collection = await notebookHelper.getNotebookCollection(collectionId);
      if (!collection || collection.user_id !== userId) {
        return { status: 404 as const, body: { error: 'Notebook collection not found' } };
      }

      const result = await notebookHelper.createPublicAccess(collectionId, userId);
      const publicUrl = `${env.BASE_URL}/notebook/public/${result.access_token}`;

      return {
        status: 200 as const,
        body: {
          success: true,
          public_url: publicUrl,
          access_token: result.access_token,
          message: 'Public link generated successfully',
        },
      };
    } catch (error) {
      log.error('[notebookCollectionsContract.shareCollection] Error:', error);
      return { status: 500 as const, body: { error: 'Internal server error' } };
    }
  },

  revokeShare: async (args) => {
    try {
      const userId = getUserId(args.req);
      const collectionId = fromParam<NotebookId>(args.params.id);

      const collection = await notebookHelper.getNotebookCollection(collectionId);
      if (!collection || collection.user_id !== userId) {
        return { status: 404 as const, body: { error: 'Notebook collection not found' } };
      }

      await notebookHelper.revokePublicAccess(collectionId);

      return {
        status: 200 as const,
        body: { success: true, message: 'Public access revoked successfully' },
      };
    } catch (error) {
      log.error('[notebookCollectionsContract.revokeShare] Error:', error);
      return { status: 500 as const, body: { error: 'Internal server error' } };
    }
  },

  removeDocument: async (args) => {
    try {
      const userId = getUserId(args.req);
      const collectionId = fromParam<NotebookId>(args.params.id);
      const documentId = fromParam<DocumentId>(args.params.documentId);

      const collection = await notebookHelper.getNotebookCollection(collectionId);
      if (!collection || collection.user_id !== userId) {
        return { status: 404 as const, body: { error: 'Notebook collection not found' } };
      }

      await notebookHelper.removeDocumentsFromCollection(collectionId, [documentId]);

      log.debug(
        `[notebookCollectionsContract] Removed document ${documentId} from collection ${collectionId}`
      );

      return {
        status: 200 as const,
        body: { success: true, message: 'Document removed from collection' },
      };
    } catch (error) {
      log.error('[notebookCollectionsContract.removeDocument] Error:', error);
      return { status: 500 as const, body: { error: 'Internal server error' } };
    }
  },

  bulkDelete: async (args) => {
    try {
      const userId = getUserId(args.req);
      const { ids } = args.body;

      if (!Array.isArray(ids) || ids.length === 0) {
        return {
          status: 400 as const,
          body: { error: 'Array of collection IDs is required' },
        };
      }

      if (ids.length > 100) {
        return {
          status: 400 as const,
          body: { error: 'Maximum 100 collections can be deleted at once' },
        };
      }

      const result = await notebookHelper.bulkDeleteCollections(ids, userId);

      const deletedIds = result.results.deleted;
      const failedIds = result.results.failed.map((f: { id: string }) => f.id);

      return {
        status: 200 as const,
        body: {
          success: true,
          message: `Bulk delete completed: ${deletedIds.length} of ${ids.length} Notebook collections deleted successfully`,
          deleted_count: deletedIds.length,
          failed_ids: failedIds,
          total_requested: ids.length,
          deleted_ids: deletedIds,
        },
      };
    } catch (error) {
      log.error('[notebookCollectionsContract.bulkDelete] Error:', error);
      const err = error as Error;
      return {
        status: 500 as const,
        body: {
          error: err.message || 'Failed to perform bulk delete of Notebook collections',
        },
      };
    }
  },
});

/**
 * Mount the ts-rest notebook collections contract router onto an Express app.
 * Call this from routes.ts BEFORE mounting the legacy collectionsController router.
 *
 * `requireAuth` middleware MUST be applied at the path prefix in routes.ts
 * before calling this function — all 10 routes require authentication.
 */
export function mountNotebookCollectionsContractRouter(app: Application): void {
  createExpressEndpoints(notebookCollectionsContract, notebookCollectionsContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'notebookCollectionsContract'),
  });
}
