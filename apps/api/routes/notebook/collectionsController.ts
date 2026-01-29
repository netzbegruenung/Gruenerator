/**
 * Notebook Collections Controller
 *
 * Handles CRUD operations for notebook collections including:
 * - Creating/updating/deleting collections
 * - Managing document associations
 * - Wolke share link integration
 * - Public sharing functionality
 */

import express, { Response } from 'express';
import { NotebookQdrantHelper } from '../../database/services/NotebookQdrantHelper.js';
import { getPostgresInstance } from '../../database/services/PostgresService.js';
import authMiddleware from '../../middleware/authMiddleware.js';
import { createLogger } from '../../utils/logger.js';
import { processUploadedDocument } from '../../services/document-services/DocumentProcessingService/index.js';
import { getPostgresDocumentService } from '../../services/document-services/PostgresDocumentService/index.js';
import { getQdrantDocumentService } from '../../services/document-services/DocumentSearchService/index.js';
import type { AuthenticatedRequest } from '../../middleware/types.js';
import type {
  CreateCollectionBody,
  UpdateCollectionBody,
  BulkDeleteBody,
  DocumentRecord,
  WolkeShareLink,
  TransformedCollection,
  NotebookCollectionFromQdrant,
} from './types.js';

const log = createLogger('notebookCollections');
const { requireAuth } = authMiddleware;

const router = express.Router();

const notebookHelper = new NotebookQdrantHelper();
const postgres = getPostgresInstance();

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Resolve Wolke share link IDs to document IDs for a user
 */
async function resolveWolkeLinksToDocuments(
  userId: string,
  wolkeShareLinkIds: string[]
): Promise<DocumentRecord[]> {
  if (!wolkeShareLinkIds || !Array.isArray(wolkeShareLinkIds) || wolkeShareLinkIds.length === 0) {
    return [];
  }

  try {
    const documents = (await postgres.query(
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
    )) as unknown as DocumentRecord[];

    log.debug(
      `[Notebook Collections] Resolved ${wolkeShareLinkIds.length} Wolke links to ${documents.length} documents`
    );
    return documents;
  } catch (error) {
    log.error('[Notebook Collections] Error resolving Wolke links:', error);
    throw new Error('Failed to resolve Wolke links to documents');
  }
}

/**
 * Validate user access to Wolke share links
 */
async function validateWolkeShareLinks(
  userId: string,
  wolkeShareLinkIds: string[]
): Promise<boolean> {
  if (!wolkeShareLinkIds || !Array.isArray(wolkeShareLinkIds) || wolkeShareLinkIds.length === 0) {
    return true;
  }

  try {
    log.debug(
      `[Notebook Collections] Validating access to ${wolkeShareLinkIds.length} Wolke share links for user ${userId}`
    );
    return true;
  } catch (error) {
    log.error('[Notebook Collections] Error validating Wolke share links:', error);
    return false;
  }
}

// =============================================================================
// Routes
// =============================================================================

/**
 * GET /api/notebook-collections
 * List user's Notebook collections
 */
router.get('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    log.debug('[Notebook Collections] GET / - User ID:', userId);

    const collections = (await notebookHelper.getUserNotebookCollections(
      userId
    )) as NotebookCollectionFromQdrant[];

    const transformedData: TransformedCollection[] = await Promise.all(
      collections.map(async (collection) => {
        const documentIds = (collection.notebook_collection_documents || []).map(
          (qcd) => qcd.document_id
        );

        let documents: DocumentRecord[] = [];
        if (documentIds.length > 0) {
          documents = (await postgres.query(
            'SELECT id, title, page_count, created_at, source_type, wolke_share_link_id FROM documents WHERE id = ANY($1)',
            [documentIds]
          )) as unknown as DocumentRecord[];
        }

        let wolke_share_links: WolkeShareLink[] = [];
        if (collection.wolke_share_link_ids) {
          try {
            wolke_share_links = collection.wolke_share_link_ids.map((id) => ({ id }));
          } catch (error) {
            log.error('[Notebook Collections] Error fetching Wolke share links:', error);
          }
        }

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
        };
      })
    );

    log.debug('[Notebook Collections] GET / - Transformed data:', transformedData);

    return res.json({
      success: true,
      collections: transformedData,
    });
  } catch (error) {
    log.error('[Notebook Collections] Error in GET /:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/notebook-collections
 * Create new Notebook collection
 */
router.post('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const {
      name,
      description,
      custom_prompt,
      selection_mode = 'documents',
      document_ids = [],
      wolke_share_link_ids = [],
      auto_sync = false,
      remove_missing_on_sync = false,
    } = req.body as CreateCollectionBody;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Name is required' });
    }

    if (Array.isArray(document_ids) && document_ids.length > 1) {
      return res.status(400).json({ error: 'Currently limited to 1 document per notebook' });
    }

    let allDocumentIds: string[] = [];
    let wolkeDocuments: DocumentRecord[] = [];

    if (selection_mode === 'wolke') {
      if (
        !wolke_share_link_ids ||
        !Array.isArray(wolke_share_link_ids) ||
        wolke_share_link_ids.length === 0
      ) {
        return res.status(400).json({ error: 'At least one Wolke share link must be selected' });
      }

      const hasAccess = await validateWolkeShareLinks(userId, wolke_share_link_ids);
      if (!hasAccess) {
        return res.status(403).json({ error: 'Access denied to one or more Wolke share links' });
      }

      wolkeDocuments = await resolveWolkeLinksToDocuments(userId, wolke_share_link_ids);
      allDocumentIds = wolkeDocuments.map((doc) => doc.id);

      if (allDocumentIds.length === 0) {
        return res.status(400).json({
          error: 'No documents found in the selected Wolke folders. Please sync the folders first.',
        });
      }
    } else {
      if (!document_ids || !Array.isArray(document_ids) || document_ids.length === 0) {
        return res.status(400).json({ error: 'At least one document must be selected' });
      }

      const userDocuments = (await postgres.query(
        'SELECT id FROM documents WHERE user_id = $1 AND id = ANY($2)',
        [userId, document_ids]
      )) as Array<{ id: string }>;

      if (userDocuments.length !== document_ids.length) {
        return res.status(403).json({ error: 'Access denied to one or more documents' });
      }

      allDocumentIds = document_ids;
    }

    const collectionData = {
      user_id: userId,
      name: name.trim(),
      description: description?.trim() || null,
      custom_prompt: custom_prompt?.trim() || null,
      selection_mode,
      document_count: allDocumentIds.length,
      wolke_share_link_ids: selection_mode === 'wolke' ? wolke_share_link_ids : null,
      auto_sync: selection_mode === 'wolke' ? !!auto_sync : false,
      remove_missing_on_sync: selection_mode === 'wolke' ? !!remove_missing_on_sync : false,
    };

    const result = await notebookHelper.storeNotebookCollection(collectionData);
    const collectionId = result.collection_id;

    try {
      await notebookHelper.addDocumentsToCollection(collectionId, allDocumentIds, userId);
    } catch (docError) {
      log.error('[Notebook Collections] Error adding documents:', docError);
      await notebookHelper.deleteNotebookCollection(collectionId);
      return res.status(500).json({ error: 'Failed to add documents to collection' });
    }

    // Fire-and-forget: process any documents that are still in 'uploaded' state
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
            log.error(`[Notebook Collections] Background processing failed for doc ${doc.id}:`, err);
          });
        }
        log.debug(
          `[Notebook Collections] Kicked off background processing for ${pendingDocs.length} document(s)`
        );
      }
    }

    return res.status(201).json({
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
    });
  } catch (error) {
    log.error('[Notebook Collections] Error in POST /:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /api/notebook-collections/:id
 * Update Notebook collection
 */
router.put('/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const collectionId = req.params.id;
    const {
      name,
      description,
      custom_prompt,
      selection_mode = 'documents',
      document_ids = [],
      wolke_share_link_ids = [],
      auto_sync,
      remove_missing_on_sync,
    } = req.body as UpdateCollectionBody;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Name is required' });
    }

    if (Array.isArray(document_ids) && document_ids.length > 1) {
      return res.status(400).json({ error: 'Currently limited to 1 document per notebook' });
    }

    const existingCollection = await notebookHelper.getNotebookCollection(collectionId);
    if (!existingCollection || existingCollection.user_id !== userId) {
      return res.status(404).json({ error: 'Notebook collection not found' });
    }

    let allDocumentIds: string[] = [];
    let wolkeDocuments: DocumentRecord[] = [];

    if (selection_mode === 'wolke') {
      if (
        !wolke_share_link_ids ||
        !Array.isArray(wolke_share_link_ids) ||
        wolke_share_link_ids.length === 0
      ) {
        return res.status(400).json({ error: 'At least one Wolke share link must be selected' });
      }

      const hasAccess = await validateWolkeShareLinks(userId, wolke_share_link_ids);
      if (!hasAccess) {
        return res.status(403).json({ error: 'Access denied to one or more Wolke share links' });
      }

      wolkeDocuments = await resolveWolkeLinksToDocuments(userId, wolke_share_link_ids);
      allDocumentIds = wolkeDocuments.map((doc) => doc.id);

      if (allDocumentIds.length === 0) {
        return res.status(400).json({
          error: 'No documents found in the selected Wolke folders. Please sync the folders first.',
        });
      }
    } else {
      if (!document_ids || !Array.isArray(document_ids) || document_ids.length === 0) {
        return res.status(400).json({ error: 'At least one document must be selected' });
      }

      const userDocuments = (await postgres.query(
        'SELECT id FROM documents WHERE user_id = $1 AND id = ANY($2)',
        [userId, document_ids]
      )) as Array<{ id: string }>;

      if (userDocuments.length !== document_ids.length) {
        return res.status(403).json({ error: 'Access denied to one or more documents' });
      }

      allDocumentIds = document_ids;
    }

    const updateData: Record<string, any> = {
      name: name.trim(),
      description: description?.trim() || null,
      custom_prompt: custom_prompt?.trim() || null,
      selection_mode,
      document_count: allDocumentIds.length,
      wolke_share_link_ids: selection_mode === 'wolke' ? wolke_share_link_ids : null,
    };

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

    return res.json({
      success: true,
      message: `Notebook collection updated successfully with ${allDocumentIds.length} document(s)`,
      documents_from_wolke: selection_mode === 'wolke' ? wolkeDocuments.length : 0,
      wolke_share_links: selection_mode === 'wolke' ? wolke_share_link_ids : [],
    });
  } catch (error) {
    log.error('[Notebook Collections] Error in PUT /:id:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/notebook-collections/:id/sync
 * Sync Wolke-based collection with current documents
 */
router.post('/:id/sync', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const collectionId = req.params.id;

    const collection = await notebookHelper.getNotebookCollection(collectionId);
    if (!collection || collection.user_id !== userId) {
      return res.status(404).json({ error: 'Notebook collection not found' });
    }

    if ((collection.selection_mode || 'documents') !== 'wolke') {
      return res.status(400).json({ error: 'Sync is only available for Wolke-based collections' });
    }

    const wolkeLinkIds = collection.wolke_share_link_ids || [];
    if (!Array.isArray(wolkeLinkIds) || wolkeLinkIds.length === 0) {
      return res.status(400).json({ error: 'No Wolke share links configured for this collection' });
    }

    const hasAccess = await validateWolkeShareLinks(userId, wolkeLinkIds);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied to one or more Wolke share links' });
    }

    const wolkeDocuments = await resolveWolkeLinksToDocuments(userId, wolkeLinkIds);
    const currentDocIds = new Set((wolkeDocuments || []).map((d) => d.id));

    const existing = await notebookHelper.getCollectionDocuments(collectionId);
    const existingIds = new Set((existing || []).map((ed) => ed.document_id));

    const docsToAdd = [...currentDocIds].filter((id) => !existingIds.has(id));
    const shouldRemove = !!collection.remove_missing_on_sync;
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
    await notebookHelper.updateNotebookCollection(collectionId, {
      document_count: newTotal,
    });

    return res.json({
      success: true,
      message: `Collection synchronized. ${addedCount} added, ${removedCount} removed.`,
      added_count: addedCount,
      removed_count: removedCount,
      total_count: newTotal,
      wolke_share_links: wolkeLinkIds,
    });
  } catch (error) {
    log.error('[Notebook Collections] Error in POST /:id/sync:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/notebook-collections/:id
 * Delete Notebook collection
 */
router.delete('/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const collectionId = req.params.id;

    const existingCollection = await notebookHelper.getNotebookCollection(collectionId);
    if (!existingCollection || existingCollection.user_id !== userId) {
      return res.status(404).json({ error: 'Notebook collection not found' });
    }

    await notebookHelper.deleteNotebookCollection(collectionId);

    return res.json({
      success: true,
      message: 'Notebook collection deleted successfully',
    });
  } catch (error) {
    log.error('[Notebook Collections] Error in DELETE /:id:', error);
    return res.status(500).json({ error: 'Failed to delete Notebook collection' });
  }
});

/**
 * POST /api/notebook-collections/:id/share
 * Generate public sharing link
 */
router.post('/:id/share', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const collectionId = req.params.id;

    const collection = await notebookHelper.getNotebookCollection(collectionId);
    if (!collection || collection.user_id !== userId) {
      return res.status(404).json({ error: 'Notebook collection not found' });
    }

    const result = await notebookHelper.createPublicAccess(collectionId, userId);
    const publicUrl = `${process.env.BASE_URL}/notebook/public/${result.access_token}`;

    return res.json({
      success: true,
      public_url: publicUrl,
      access_token: result.access_token,
      message: 'Public link generated successfully',
    });
  } catch (error) {
    log.error('[Notebook Collections] Error in POST /:id/share:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/notebook-collections/:id/share
 * Revoke public access
 */
router.delete('/:id/share', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const collectionId = req.params.id;

    const collection = await notebookHelper.getNotebookCollection(collectionId);
    if (!collection || collection.user_id !== userId) {
      return res.status(404).json({ error: 'Notebook collection not found' });
    }

    await notebookHelper.revokePublicAccess(collectionId);

    return res.json({
      success: true,
      message: 'Public access revoked successfully',
    });
  } catch (error) {
    log.error('[Notebook Collections] Error in DELETE /:id/share:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/notebook-collections/bulk
 * Bulk delete Notebook collections
 */
router.delete('/bulk', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { ids } = req.body as BulkDeleteBody;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Array of collection IDs is required',
      });
    }

    if (ids.length > 100) {
      return res.status(400).json({
        success: false,
        message: 'Maximum 100 collections can be deleted at once',
      });
    }

    log.debug(
      `[Notebook Collections] Bulk delete request for ${ids.length} collections from user ${userId}`
    );

    const result = await notebookHelper.bulkDeleteCollections(ids, userId);

    const deletedIds = result.results.deleted;
    const failedIds = result.results.failed.map((f) => f.id);

    log.debug(
      `[Notebook Collections] Bulk delete completed: ${deletedIds.length} deleted, ${failedIds.length} failed`
    );

    return res.json({
      success: true,
      message: `Bulk delete completed: ${deletedIds.length} of ${ids.length} Notebook collections deleted successfully`,
      deleted_count: deletedIds.length,
      failed_ids: failedIds,
      total_requested: ids.length,
      deleted_ids: deletedIds,
    });
  } catch (error) {
    log.error('[Notebook Collections] Error in bulk delete:', error);
    const err = error as Error;
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to perform bulk delete of Notebook collections',
    });
  }
});

export default router;
