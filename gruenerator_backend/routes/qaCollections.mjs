import express from 'express';
import { createClient } from '@supabase/supabase-js';
import authMiddleware from '../middleware/authMiddleware.js';
const { requireAuth } = authMiddleware;

const router = express.Router();

// Initialize Supabase client
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

// GET /api/qa-collections - List user's Q&A collections
router.get('/', requireAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        console.log('[QA Collections] GET / - User ID:', userId);

        const { data, error } = await supabase
            .from('qa_collections')
            .select(`
                *,
                qa_collection_documents (
                    document_id,
                    documents (
                        id,
                        title,
                        page_count,
                        created_at
                    )
                )
            `)
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        console.log('[QA Collections] GET / - Supabase query result:', { data, error });

        if (error) {
            console.error('[QA Collections] Error fetching collections:', error);
            return res.status(500).json({ error: 'Failed to fetch Q&A collections' });
        }

        // Transform data to include document count and documents array
        const transformedData = data.map(collection => ({
            ...collection,
            document_count: collection.qa_collection_documents.length,
            documents: collection.qa_collection_documents.map(qcd => qcd.documents)
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

        // Verify user owns all selected documents
        const { data: userDocuments, error: docsError } = await supabase
            .from('documents')
            .select('id')
            .eq('user_id', userId)
            .in('id', documents);

        if (docsError || userDocuments.length !== documents.length) {
            return res.status(403).json({ error: 'Access denied to one or more documents' });
        }

        // Create the collection
        const { data: collection, error: collectionError } = await supabase
            .from('qa_collections')
            .insert({
                name: name.trim(),
                description: description?.trim() || null,
                custom_prompt: custom_prompt?.trim() || null,
                user_id: userId
            })
            .select()
            .single();

        if (collectionError) {
            console.error('[QA Collections] Error creating collection:', collectionError);
            return res.status(500).json({ error: 'Failed to create Q&A collection' });
        }

        // Add documents to the collection
        const documentInserts = documents.map(docId => ({
            collection_id: collection.id,
            document_id: docId
        }));

        const { error: docsInsertError } = await supabase
            .from('qa_collection_documents')
            .insert(documentInserts);

        if (docsInsertError) {
            console.error('[QA Collections] Error adding documents:', docsInsertError);
            // Clean up - delete the collection if document insertion failed
            await supabase.from('qa_collections').delete().eq('id', collection.id);
            return res.status(500).json({ error: 'Failed to add documents to collection' });
        }

        res.status(201).json({
            success: true,
            collection: {
                ...collection,
                document_count: documents.length
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
        const { data: existingCollection, error: collectionError } = await supabase
            .from('qa_collections')
            .select('id')
            .eq('id', collectionId)
            .eq('user_id', userId)
            .single();

        if (collectionError || !existingCollection) {
            return res.status(404).json({ error: 'Q&A collection not found' });
        }

        // Verify user owns all selected documents
        const { data: userDocuments, error: docsError } = await supabase
            .from('documents')
            .select('id')
            .eq('user_id', userId)
            .in('id', documents);

        if (docsError || userDocuments.length !== documents.length) {
            return res.status(403).json({ error: 'Access denied to one or more documents' });
        }

        // Update collection metadata
        const { error: updateError } = await supabase
            .from('qa_collections')
            .update({
                name: name.trim(),
                description: description?.trim() || null,
                custom_prompt: custom_prompt?.trim() || null
            })
            .eq('id', collectionId);

        if (updateError) {
            console.error('[QA Collections] Error updating collection:', updateError);
            return res.status(500).json({ error: 'Failed to update Q&A collection' });
        }

        // Update document associations
        // First, remove existing associations
        const { error: deleteError } = await supabase
            .from('qa_collection_documents')
            .delete()
            .eq('collection_id', collectionId);

        if (deleteError) {
            console.error('[QA Collections] Error removing old documents:', deleteError);
            return res.status(500).json({ error: 'Failed to update document associations' });
        }

        // Then add new associations
        const documentInserts = documents.map(docId => ({
            collection_id: collectionId,
            document_id: docId
        }));

        const { error: insertError } = await supabase
            .from('qa_collection_documents')
            .insert(documentInserts);

        if (insertError) {
            console.error('[QA Collections] Error adding new documents:', insertError);
            return res.status(500).json({ error: 'Failed to update document associations' });
        }

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
        const { data: existingCollection, error: collectionError } = await supabase
            .from('qa_collections')
            .select('id, name')
            .eq('id', collectionId)
            .eq('user_id', userId)
            .single();

        if (collectionError || !existingCollection) {
            return res.status(404).json({ error: 'Q&A collection not found' });
        }

        // Delete the collection (cascade will handle related records)
        const { error: deleteError } = await supabase
            .from('qa_collections')
            .delete()
            .eq('id', collectionId);

        if (deleteError) {
            console.error('[QA Collections] Error deleting collection:', deleteError);
            return res.status(500).json({ error: 'Failed to delete Q&A collection' });
        }

        res.json({ 
            success: true,
            message: 'Q&A collection deleted successfully' 
        });
    } catch (error) {
        console.error('[QA Collections] Error in DELETE /:id:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /api/qa-collections/:id/share - Generate public sharing link
router.post('/:id/share', requireAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        const collectionId = req.params.id;

        // Verify user owns the collection
        const { data: collection, error: collectionError } = await supabase
            .from('qa_collections')
            .select('id, name')
            .eq('id', collectionId)
            .eq('user_id', userId)
            .single();

        if (collectionError || !collection) {
            return res.status(404).json({ error: 'Q&A collection not found' });
        }

        // Use the Supabase function to create public access
        const { data, error } = await supabase
            .rpc('create_qa_public_access', { collection_uuid: collectionId });

        if (error) {
            console.error('[QA Collections] Error creating public access:', error);
            return res.status(500).json({ error: 'Failed to generate public link' });
        }

        const publicUrl = `${process.env.BASE_URL}/qa/public/${data}`;

        res.json({
            success: true,
            public_url: publicUrl,
            access_token: data,
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
        const { data: collection, error: collectionError } = await supabase
            .from('qa_collections')
            .select('id')
            .eq('id', collectionId)
            .eq('user_id', userId)
            .single();

        if (collectionError || !collection) {
            return res.status(404).json({ error: 'Q&A collection not found' });
        }

        // Use the Supabase function to revoke public access
        const { error } = await supabase
            .rpc('revoke_qa_public_access', { collection_uuid: collectionId });

        if (error) {
            console.error('[QA Collections] Error revoking public access:', error);
            return res.status(500).json({ error: 'Failed to revoke public access' });
        }

        res.json({ 
            success: true,
            message: 'Public access revoked successfully' 
        });
    } catch (error) {
        console.error('[QA Collections] Error in DELETE /:id/share:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

export default router;