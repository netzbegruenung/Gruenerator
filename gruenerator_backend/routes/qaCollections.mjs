import express from 'express';
import { QAQdrantHelper } from '../database/services/QAQdrantHelper.js';
import { getPostgresInstance } from '../database/services/PostgresService.js';
import authMiddleware from '../middleware/authMiddleware.js';
const { requireAuth } = authMiddleware;

const router = express.Router();

// Initialize services
const qaHelper = new QAQdrantHelper();
const postgres = getPostgresInstance();

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
                    'SELECT id, title, page_count, created_at FROM documents WHERE id = ANY($1)',
                    [documentIds]
                );
            }

            return {
                ...collection,
                documents: documents,
                document_count: documents.length
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
        const { name, description, custom_prompt, documents } = req.body;

        // Validate input
        if (!name || !name.trim()) {
            return res.status(400).json({ error: 'Name is required' });
        }

        if (!documents || !Array.isArray(documents) || documents.length === 0) {
            return res.status(400).json({ error: 'At least one document must be selected' });
        }

        // Verify user owns all selected documents (using PostgreSQL)
        const userDocuments = await postgres.query(
            'SELECT id FROM documents WHERE user_id = $1 AND id = ANY($2)',
            [userId, documents]
        );

        if (userDocuments.length !== documents.length) {
            return res.status(403).json({ error: 'Access denied to one or more documents' });
        }

        // Create the collection in Qdrant
        const collectionData = {
            user_id: userId,
            name: name.trim(),
            description: description?.trim() || null,
            custom_prompt: custom_prompt?.trim() || null,
            document_count: documents.length
        };

        const result = await qaHelper.storeQACollection(collectionData);
        
        if (!result.success) {
            console.error('[QA Collections] Error creating collection:', result.error);
            return res.status(500).json({ error: 'Failed to create Q&A collection' });
        }

        const collectionId = result.collection_id;

        // Add documents to the collection
        try {
            await qaHelper.addDocumentsToCollection(collectionId, documents, userId);
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
                document_count: documents.length,
                created_at: new Date().toISOString()
            },
            message: 'Q&A collection created successfully'
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
        const { name, description, custom_prompt, documents } = req.body;

        // Validate input
        if (!name || !name.trim()) {
            return res.status(400).json({ error: 'Name is required' });
        }

        if (!documents || !Array.isArray(documents) || documents.length === 0) {
            return res.status(400).json({ error: 'At least one document must be selected' });
        }

        // Verify user owns the collection
        const existingCollection = await qaHelper.getQACollection(collectionId);
        if (!existingCollection || existingCollection.user_id !== userId) {
            return res.status(404).json({ error: 'Q&A collection not found' });
        }

        // Verify user owns all selected documents (using PostgreSQL)
        const userDocuments = await postgres.query(
            'SELECT id FROM documents WHERE user_id = $1 AND id = ANY($2)',
            [userId, documents]
        );

        if (userDocuments.length !== documents.length) {
            return res.status(403).json({ error: 'Access denied to one or more documents' });
        }

        // Update collection metadata
        const updateData = {
            name: name.trim(),
            description: description?.trim() || null,
            custom_prompt: custom_prompt?.trim() || null,
            document_count: documents.length
        };

        await qaHelper.updateQACollection(collectionId, updateData);

        // Update document associations
        // Remove existing associations
        const existingDocuments = await qaHelper.getCollectionDocuments(collectionId);
        const existingDocIds = existingDocuments.map(doc => doc.document_id);
        
        if (existingDocIds.length > 0) {
            await qaHelper.removeDocumentsFromCollection(collectionId, existingDocIds);
        }

        // Add new associations
        await qaHelper.addDocumentsToCollection(collectionId, documents, userId);

        res.json({ 
            success: true,
            message: 'Q&A collection updated successfully' 
        });
    } catch (error) {
        console.error('[QA Collections] Error in PUT /:id:', error);
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