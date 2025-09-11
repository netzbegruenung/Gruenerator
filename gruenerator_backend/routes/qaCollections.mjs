import express from 'express';
import { QAQdrantHelper } from '../database/services/QAQdrantHelper.js';
import { getPostgresInstance } from '../database/services/PostgresService.js';
import authMiddleware from '../middleware/authMiddleware.js';
const { requireAuth } = authMiddleware;

const router = express.Router();

// Initialize services
const qaHelper = new QAQdrantHelper();
const postgres = getPostgresInstance();

/**
 * Resolve Wolke share link IDs to document IDs for a user
 */
async function resolveWolkeLinksToDocuments(userId, wolkeShareLinkIds) {
    if (!wolkeShareLinkIds || !Array.isArray(wolkeShareLinkIds) || wolkeShareLinkIds.length === 0) {
        return [];
    }

    try {
        // Get documents that belong to the user and are synced from the specified Wolke share links
        const documents = await postgres.query(`
            SELECT id, title, wolke_share_link_id, created_at 
            FROM documents 
            WHERE user_id = $1 
            AND source_type = 'wolke' 
            AND wolke_share_link_id = ANY($2) 
            AND status = 'completed'
            ORDER BY created_at DESC
        `, [userId, wolkeShareLinkIds]);

        console.log(`[QA Collections] Resolved ${wolkeShareLinkIds.length} Wolke links to ${documents.length} documents`);
        return documents;
    } catch (error) {
        console.error('[QA Collections] Error resolving Wolke links:', error);
        throw new Error('Failed to resolve Wolke links to documents');
    }
}

/**
 * Validate user access to Wolke share links
 */
async function validateWolkeShareLinks(userId, wolkeShareLinkIds) {
    if (!wolkeShareLinkIds || !Array.isArray(wolkeShareLinkIds) || wolkeShareLinkIds.length === 0) {
        return true;
    }

    try {
        // For now, we'll assume all share links belong to the user
        // In a more complex system, you might need to check share link ownership
        // This is a placeholder for proper validation logic
        console.log(`[QA Collections] Validating access to ${wolkeShareLinkIds.length} Wolke share links for user ${userId}`);
        return true;
    } catch (error) {
        console.error('[QA Collections] Error validating Wolke share links:', error);
        return false;
    }
}

// GET /api/qa-collections - List user's Q&A collections
router.get('/', requireAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        console.log('[QA Collections] GET / - User ID:', userId);

        // Get collections from Qdrant
        const collections = await qaHelper.getUserQACollections(userId);

        // Get document details from PostgreSQL for each collection
        const transformedData = await Promise.all(collections.map(async (collection) => {
            const documentIds = collection.qa_collection_documents.map(qcd => qcd.document_id);
            
            let documents = [];
            if (documentIds.length > 0) {
                documents = await postgres.query(
                    'SELECT id, title, page_count, created_at, source_type, wolke_share_link_id FROM documents WHERE id = ANY($1)',
                    [documentIds]
                );
            }

            // Get Wolke share link information if this collection uses Wolke sources
            let wolke_share_links = [];
            if (collection.wolke_share_link_ids) {
                try {
                    // For now, we'll just return the IDs. In a full implementation, you might
                    // want to fetch actual share link details from the Wolke system
                    wolke_share_links = collection.wolke_share_link_ids.map(id => ({
                        id: id,
                        // Add more details here if needed
                    }));
                } catch (error) {
                    console.error('[QA Collections] Error fetching Wolke share links:', error);
                }
            }

            return {
                ...collection,
                documents: documents,
                document_count: documents.length,
                selection_mode: collection.selection_mode || 'documents',
                wolke_share_links: wolke_share_links,
                has_wolke_sources: wolke_share_links.length > 0,
                documents_from_wolke: documents.filter(doc => doc.source_type === 'wolke').length,
                auto_sync: !!collection.auto_sync,
                remove_missing_on_sync: !!collection.remove_missing_on_sync
            };
        }));

        console.log('[QA Collections] GET / - Transformed data:', transformedData);
        
        const responseData = {
            success: true,
            collections: transformedData
        };
        
        console.log('[QA Collections] GET / - Sending response:', responseData);
        res.json(responseData);
    } catch (error) {
        console.error('[QA Collections] Error in GET /:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /api/qa-collections - Create new Q&A collection
router.post('/', requireAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        const { 
            name, 
            description, 
            custom_prompt, 
            selection_mode = 'documents',
            document_ids = [],
            wolke_share_link_ids = [],
            auto_sync = false,
            remove_missing_on_sync = false
        } = req.body;

        // Validate input
        if (!name || !name.trim()) {
            return res.status(400).json({ error: 'Name is required' });
        }

        // Validate selection based on mode
        let allDocumentIds = [];
        let wolkeDocuments = [];
        
        if (selection_mode === 'wolke') {
            if (!wolke_share_link_ids || !Array.isArray(wolke_share_link_ids) || wolke_share_link_ids.length === 0) {
                return res.status(400).json({ error: 'At least one Wolke share link must be selected' });
            }

            // Validate user access to Wolke share links
            const hasAccess = await validateWolkeShareLinks(userId, wolke_share_link_ids);
            if (!hasAccess) {
                return res.status(403).json({ error: 'Access denied to one or more Wolke share links' });
            }

            // Resolve Wolke share links to documents
            wolkeDocuments = await resolveWolkeLinksToDocuments(userId, wolke_share_link_ids);
            allDocumentIds = wolkeDocuments.map(doc => doc.id);
            
            if (allDocumentIds.length === 0) {
                return res.status(400).json({ 
                    error: 'No documents found in the selected Wolke folders. Please sync the folders first.' 
                });
            }
        } else {
            // Documents mode
            if (!document_ids || !Array.isArray(document_ids) || document_ids.length === 0) {
                return res.status(400).json({ error: 'At least one document must be selected' });
            }

            // Verify user owns all selected documents
            const userDocuments = await postgres.query(
                'SELECT id FROM documents WHERE user_id = $1 AND id = ANY($2)',
                [userId, document_ids]
            );

            if (userDocuments.length !== document_ids.length) {
                return res.status(403).json({ error: 'Access denied to one or more documents' });
            }
            
            allDocumentIds = document_ids;
        }

        // Create the collection in Qdrant
        const collectionData = {
            user_id: userId,
            name: name.trim(),
            description: description?.trim() || null,
            custom_prompt: custom_prompt?.trim() || null,
            selection_mode: selection_mode,
            document_count: allDocumentIds.length,
            wolke_share_link_ids: selection_mode === 'wolke' ? wolke_share_link_ids : null,
            auto_sync: selection_mode === 'wolke' ? !!auto_sync : false,
            remove_missing_on_sync: selection_mode === 'wolke' ? !!remove_missing_on_sync : false
        };

        const result = await qaHelper.storeQACollection(collectionData);
        
        if (!result.success) {
            console.error('[QA Collections] Error creating collection:', result.error);
            return res.status(500).json({ error: 'Failed to create Q&A collection' });
        }

        const collectionId = result.collection_id;

        // Add documents to the collection
        try {
            await qaHelper.addDocumentsToCollection(collectionId, allDocumentIds, userId);
        } catch (docError) {
            console.error('[QA Collections] Error adding documents:', docError);
            // Clean up - delete the collection if document insertion failed
            await qaHelper.deleteQACollection(collectionId);
            return res.status(500).json({ error: 'Failed to add documents to collection' });
        }

        res.status(201).json({
            success: true,
            collection: {
                id: collectionId,
                ...collectionData,
                document_count: allDocumentIds.length,
                documents_from_wolke: selection_mode === 'wolke' ? wolkeDocuments.length : 0,
                wolke_share_links: selection_mode === 'wolke' ? wolke_share_link_ids : [],
                created_at: new Date().toISOString()
            },
            message: `Q&A collection created successfully with ${allDocumentIds.length} document(s)`
        });
    } catch (error) {
        console.error('[QA Collections] Error in POST /:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// PUT /api/qa-collections/:id - Update Q&A collection
router.put('/:id', requireAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        const collectionId = req.params.id;
        const { 
            name, 
            description, 
            custom_prompt, 
            selection_mode = 'documents',
            document_ids = [],
            wolke_share_link_ids = [],
            auto_sync = undefined,
            remove_missing_on_sync = undefined
        } = req.body;

        // Validate input
        if (!name || !name.trim()) {
            return res.status(400).json({ error: 'Name is required' });
        }

        // Verify user owns the collection
        const existingCollection = await qaHelper.getQACollection(collectionId);
        if (!existingCollection || existingCollection.user_id !== userId) {
            return res.status(404).json({ error: 'Q&A collection not found' });
        }

        // Validate selection based on mode
        let allDocumentIds = [];
        let wolkeDocuments = [];
        
        if (selection_mode === 'wolke') {
            if (!wolke_share_link_ids || !Array.isArray(wolke_share_link_ids) || wolke_share_link_ids.length === 0) {
                return res.status(400).json({ error: 'At least one Wolke share link must be selected' });
            }

            // Validate user access to Wolke share links
            const hasAccess = await validateWolkeShareLinks(userId, wolke_share_link_ids);
            if (!hasAccess) {
                return res.status(403).json({ error: 'Access denied to one or more Wolke share links' });
            }

            // Resolve Wolke share links to documents
            wolkeDocuments = await resolveWolkeLinksToDocuments(userId, wolke_share_link_ids);
            allDocumentIds = wolkeDocuments.map(doc => doc.id);
            
            if (allDocumentIds.length === 0) {
                return res.status(400).json({ 
                    error: 'No documents found in the selected Wolke folders. Please sync the folders first.' 
                });
            }
        } else {
            // Documents mode
            if (!document_ids || !Array.isArray(document_ids) || document_ids.length === 0) {
                return res.status(400).json({ error: 'At least one document must be selected' });
            }

            // Verify user owns all selected documents
            const userDocuments = await postgres.query(
                'SELECT id FROM documents WHERE user_id = $1 AND id = ANY($2)',
                [userId, document_ids]
            );

            if (userDocuments.length !== document_ids.length) {
                return res.status(403).json({ error: 'Access denied to one or more documents' });
            }
            
            allDocumentIds = document_ids;
        }

        // Update collection metadata
        const updateData = {
            name: name.trim(),
            description: description?.trim() || null,
            custom_prompt: custom_prompt?.trim() || null,
            selection_mode: selection_mode,
            document_count: allDocumentIds.length,
            wolke_share_link_ids: selection_mode === 'wolke' ? wolke_share_link_ids : null
        };

        // Only set flags when provided and relevant
        if (selection_mode === 'wolke') {
            if (typeof auto_sync === 'boolean') updateData.auto_sync = auto_sync;
            if (typeof remove_missing_on_sync === 'boolean') updateData.remove_missing_on_sync = remove_missing_on_sync;
        } else {
            updateData.auto_sync = false;
            updateData.remove_missing_on_sync = false;
        }

        await qaHelper.updateQACollection(collectionId, updateData);

        // Update document associations
        // Remove existing associations
        const existingDocuments = await qaHelper.getCollectionDocuments(collectionId);
        const existingDocIds = existingDocuments.map(doc => doc.document_id);
        
        if (existingDocIds.length > 0) {
            await qaHelper.removeDocumentsFromCollection(collectionId, existingDocIds);
        }

        // Add new associations
        await qaHelper.addDocumentsToCollection(collectionId, allDocumentIds, userId);

        res.json({ 
            success: true,
            message: `Q&A collection updated successfully with ${allDocumentIds.length} document(s)`,
            documents_from_wolke: selection_mode === 'wolke' ? wolkeDocuments.length : 0,
            wolke_share_links: selection_mode === 'wolke' ? wolke_share_link_ids : []
        });
    } catch (error) {
        console.error('[QA Collections] Error in PUT /:id:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /api/qa-collections/:id/sync - Sync Wolke-based collection with current documents
router.post('/:id/sync', requireAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        const collectionId = req.params.id;

        // Verify user owns the collection
        const collection = await qaHelper.getQACollection(collectionId);
        if (!collection || collection.user_id !== userId) {
            return res.status(404).json({ error: 'Q&A collection not found' });
        }

        if ((collection.selection_mode || 'documents') !== 'wolke') {
            return res.status(400).json({ error: 'Sync is only available for Wolke-based collections' });
        }

        const wolkeLinkIds = collection.wolke_share_link_ids || [];
        if (!Array.isArray(wolkeLinkIds) || wolkeLinkIds.length === 0) {
            return res.status(400).json({ error: 'No Wolke share links configured for this collection' });
        }

        // Validate user access and resolve to current documents
        const hasAccess = await validateWolkeShareLinks(userId, wolkeLinkIds);
        if (!hasAccess) {
            return res.status(403).json({ error: 'Access denied to one or more Wolke share links' });
        }

        const wolkeDocuments = await resolveWolkeLinksToDocuments(userId, wolkeLinkIds);
        const currentDocIds = new Set((wolkeDocuments || []).map(d => d.id));

        // Get existing associations
        const existing = await qaHelper.getCollectionDocuments(collectionId);
        const existingIds = new Set((existing || []).map(ed => ed.document_id));

        // Compute additions and optional removals
        const docsToAdd = [...currentDocIds].filter(id => !existingIds.has(id));
        const shouldRemove = !!collection.remove_missing_on_sync;
        const docsToRemove = shouldRemove ? [...existingIds].filter(id => !currentDocIds.has(id)) : [];

        let addedCount = 0;
        if (docsToAdd.length > 0) {
            await qaHelper.addDocumentsToCollection(collectionId, docsToAdd, userId);
            addedCount = docsToAdd.length;
        }
        let removedCount = 0;
        if (docsToRemove.length > 0) {
            await qaHelper.removeDocumentsFromCollection(collectionId, docsToRemove);
            removedCount = docsToRemove.length;
        }

        // Update document_count metadata
        const newTotal = existingIds.size + addedCount - removedCount;
        await qaHelper.updateQACollection(collectionId, {
            document_count: newTotal
        });

        return res.json({
            success: true,
            message: `Collection synchronized. ${addedCount} added, ${removedCount} removed.`,
            added_count: addedCount,
            removed_count: removedCount,
            total_count: newTotal,
            wolke_share_links: wolkeLinkIds
        });
    } catch (error) {
        console.error('[QA Collections] Error in POST /:id/sync:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// DELETE /api/qa-collections/:id - Delete Q&A collection
router.delete('/:id', requireAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        const collectionId = req.params.id;

        // Verify user owns the collection
        const existingCollection = await qaHelper.getQACollection(collectionId);
        if (!existingCollection || existingCollection.user_id !== userId) {
            return res.status(404).json({ error: 'Q&A collection not found' });
        }

        // Delete the collection (includes related records)
        await qaHelper.deleteQACollection(collectionId);

        res.json({ 
            success: true,
            message: 'Q&A collection deleted successfully' 
        });
    } catch (error) {
        console.error('[QA Collections] Error in DELETE /:id:', error);
        res.status(500).json({ error: 'Failed to delete Q&A collection' });
    }
});

// POST /api/qa-collections/:id/share - Generate public sharing link
router.post('/:id/share', requireAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        const collectionId = req.params.id;

        // Verify user owns the collection
        const collection = await qaHelper.getQACollection(collectionId);
        if (!collection || collection.user_id !== userId) {
            return res.status(404).json({ error: 'Q&A collection not found' });
        }

        // Create public access token
        const result = await qaHelper.createPublicAccess(collectionId, userId);

        if (!result.success) {
            console.error('[QA Collections] Error creating public access:', result.error);
            return res.status(500).json({ error: 'Failed to generate public link' });
        }

        const publicUrl = `${process.env.BASE_URL}/qa/public/${result.access_token}`;

        res.json({
            success: true,
            public_url: publicUrl,
            access_token: result.access_token,
            message: 'Public link generated successfully'
        });
    } catch (error) {
        console.error('[QA Collections] Error in POST /:id/share:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// DELETE /api/qa-collections/:id/share - Revoke public access
router.delete('/:id/share', requireAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        const collectionId = req.params.id;

        // Verify user owns the collection
        const collection = await qaHelper.getQACollection(collectionId);
        if (!collection || collection.user_id !== userId) {
            return res.status(404).json({ error: 'Q&A collection not found' });
        }

        // Revoke public access
        await qaHelper.revokePublicAccess(collectionId);

        res.json({ 
            success: true,
            message: 'Public access revoked successfully' 
        });
    } catch (error) {
        console.error('[QA Collections] Error in DELETE /:id/share:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// DELETE /api/qa-collections/bulk - Bulk delete Q&A collections
router.delete('/bulk', requireAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        const { ids } = req.body;

        // Validate input
        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Array of collection IDs is required'
            });
        }

        if (ids.length > 100) {
            return res.status(400).json({
                success: false,
                message: 'Maximum 100 collections can be deleted at once'
            });
        }

        console.log(`[QA Collections] Bulk delete request for ${ids.length} collections from user ${userId}`);

        // Perform bulk delete with ownership verification
        const result = await qaHelper.bulkDeleteCollections(ids, userId);

        const deletedIds = result.results.deleted;
        const failedIds = result.results.failed.map(f => f.id);

        console.log(`[QA Collections] Bulk delete completed: ${deletedIds.length} deleted, ${failedIds.length} failed`);

        res.json({
            success: true,
            message: `Bulk delete completed: ${deletedIds.length} of ${ids.length} Q&A collections deleted successfully`,
            deleted_count: deletedIds.length,
            failed_ids: failedIds,
            total_requested: ids.length,
            deleted_ids: deletedIds
        });

    } catch (error) {
        console.error('[QA Collections] Error in bulk delete:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to perform bulk delete of Q&A collections'
        });
    }
});

export default router;
