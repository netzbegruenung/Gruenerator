import express from 'express';
import { supabaseService } from '../utils/supabaseClient.js';
import authMiddlewareModule from '../middleware/authMiddleware.js';
import passport from '../config/passportSetup.mjs';

const { requireAuth: ensureAuthenticated } = authMiddlewareModule;
const router = express.Router();

// Add Passport session middleware for user texts routes
router.use(passport.session());

// Add debugging middleware to all user text routes
router.use((req, res, next) => {
  console.log(`[UserTexts] ${req.method} ${req.originalUrl} - User ID: ${req.user?.id}`);
  next();
});

// Get user's texts/documents
router.get('/', ensureAuthenticated, async (req, res) => {
  try {
    console.log('[UserTexts] Getting user texts for user:', req.user?.id);

    // Query the new simplified user_documents table
    const { data: documents, error: documentsError } = await supabaseService
      .from('user_documents')
      .select(`
        id,
        document_id,
        title,
        document_type,
        content,
        content_html,
        word_count,
        character_count,
        created_at,
        updated_at
      `)
      .eq('user_id', req.user.id)
      .order('updated_at', { ascending: false });

    if (documentsError) {
      console.error('[UserTexts] Error fetching documents:', documentsError);
      throw new Error('Failed to fetch user texts');
    }

    // Format the response to match the frontend expectations
    const formattedDocuments = documents.map(doc => ({
      id: doc.document_id, // Use document_id as the main ID for compatibility
      title: doc.title,
      content_preview: doc.content ? doc.content.substring(0, 200) : '',
      full_content: doc.content || '',
      content_html: doc.content_html || '',
      type: doc.document_type,
      created_at: doc.created_at,
      updated_at: doc.updated_at,
      word_count: doc.word_count || 0,
      character_count: doc.character_count || 0
    }));

    console.log(`[UserTexts] Found ${formattedDocuments.length} documents for user ${req.user.id}`);

    res.json({
      success: true,
      data: formattedDocuments,
      message: `Found ${formattedDocuments.length} documents`
    });

  } catch (error) {
    console.error('[UserTexts] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch user texts'
    });
  }
});

// Update document metadata (title, type)
router.post('/:documentId/metadata', ensureAuthenticated, async (req, res) => {
  try {
    const { documentId } = req.params;
    const { title, document_type } = req.body;

    if (!title && !document_type) {
      return res.status(400).json({
        success: false,
        message: 'Title or document_type is required'
      });
    }

    // Check if document belongs to user
    const { data: existingDoc, error: checkError } = await supabaseService
      .from('user_documents')
      .select('id')
      .eq('user_id', req.user.id)
      .eq('document_id', documentId)
      .single();

    if (checkError || !existingDoc) {
      return res.status(404).json({
        success: false,
        message: 'Document not found or access denied'
      });
    }

    // Update document
    const updateData = {};
    if (title) updateData.title = title.trim();
    if (document_type) updateData.document_type = document_type;

    const { data, error } = await supabaseService
      .from('user_documents')
      .update(updateData)
      .eq('user_id', req.user.id)
      .eq('document_id', documentId)
      .select()
      .single();

    if (error) {
      console.error('[UserTexts] Error updating document:', error);
      throw new Error('Failed to update document metadata');
    }

    res.json({
      success: true,
      data,
      message: 'Document metadata updated successfully'
    });

  } catch (error) {
    console.error('[UserTexts] Error updating metadata:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to update document metadata'
    });
  }
});

// Bulk delete documents
router.delete('/bulk', ensureAuthenticated, async (req, res) => {
  console.log('[UserTexts] BULK DELETE ROUTE HIT - Route is accessible');
  console.log('[UserTexts] Request method:', req.method);
  console.log('[UserTexts] Request URL:', req.originalUrl);
  console.log('[UserTexts] User authenticated:', !!req.user);
  console.log('[UserTexts] User ID:', req.user?.id);
  console.log('[UserTexts] Request body:', JSON.stringify(req.body, null, 2));
  
  try {
    const { ids } = req.body;

    // Validate input
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Array of document IDs is required'
      });
    }

    console.log(`[UserTexts] Bulk delete request for ${ids.length} documents from user ${req.user.id}`);
    console.log('[UserTexts] Document IDs to delete:', ids);

    // First, verify all documents belong to the user
    console.log('[UserTexts] Starting ownership verification...');
    const { data: verifyDocuments, error: verifyError } = await supabaseService
      .from('user_documents')
      .select('document_id')
      .eq('user_id', req.user.id)
      .in('document_id', ids);

    console.log('[UserTexts] Ownership verification result:', {
      error: verifyError,
      documentsFound: verifyDocuments?.length || 0,
      documents: verifyDocuments
    });

    if (verifyError) {
      console.error('[UserTexts] Error verifying document ownership:', verifyError);
      throw new Error('Failed to verify document ownership');
    }

    const ownedIds = verifyDocuments.map(doc => doc.document_id);
    const unauthorizedIds = ids.filter(id => !ownedIds.includes(id));

    console.log('[UserTexts] Ownership analysis:', {
      requestedIds: ids,
      ownedIds: ownedIds,
      unauthorizedIds: unauthorizedIds,
      authorizationPassed: unauthorizedIds.length === 0
    });

    if (unauthorizedIds.length > 0) {
      console.log('[UserTexts] AUTHORIZATION FAILED - returning 403');
      return res.status(403).json({
        success: false,
        message: `Access denied for documents: ${unauthorizedIds.join(', ')}`,
        unauthorized_ids: unauthorizedIds
      });
    }

    // Perform bulk delete
    console.log('[UserTexts] Starting bulk delete operation...');
    const { data: deletedData, error: deleteError } = await supabaseService
      .from('user_documents')
      .delete()
      .eq('user_id', req.user.id)
      .in('document_id', ids)
      .select('document_id');

    console.log('[UserTexts] Bulk delete operation result:', {
      error: deleteError,
      deletedCount: deletedData?.length || 0,
      deletedData: deletedData
    });

    if (deleteError) {
      console.error('[UserTexts] Error during bulk delete:', deleteError);
      throw new Error('Failed to delete documents');
    }

    const deletedIds = deletedData ? deletedData.map(doc => doc.document_id) : [];
    const failedIds = ids.filter(id => !deletedIds.includes(id));

    console.log(`[UserTexts] Bulk delete completed: ${deletedIds.length} deleted, ${failedIds.length} failed`);

    res.json({
      success: true,
      message: `Bulk delete completed: ${deletedIds.length} of ${ids.length} documents deleted successfully`,
      deleted_count: deletedIds.length,
      failed_ids: failedIds,
      total_requested: ids.length,
      deleted_ids: deletedIds
    });

  } catch (error) {
    console.error('[UserTexts] Error in bulk delete:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to perform bulk delete'
    });
  }
});

// Delete document
router.delete('/:documentId', ensureAuthenticated, async (req, res) => {
  try {
    const { documentId } = req.params;

    // Check if document belongs to user and get it
    const { data: document, error: getError } = await supabaseService
      .from('user_documents')
      .select('*')
      .eq('user_id', req.user.id)
      .eq('document_id', documentId)
      .single();

    if (getError || !document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found or access denied'
      });
    }

    // Delete the document
    const { error: deleteError } = await supabaseService
      .from('user_documents')
      .delete()
      .eq('user_id', req.user.id)
      .eq('document_id', documentId);

    if (deleteError) {
      console.error('[UserTexts] Error deleting document:', deleteError);
      throw new Error('Failed to delete document');
    }

    res.json({
      success: true,
      message: 'Document deleted successfully'
    });

  } catch (error) {
    console.error('[UserTexts] Error deleting document:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to delete document'
    });
  }
});

// Search user texts
router.post('/search', ensureAuthenticated, async (req, res) => {
  try {
    const { query } = req.body;

    if (!query || !query.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Search query is required'
      });
    }

    const searchTerm = query.trim().toLowerCase();

    // Search in the user_documents table directly
    const { data: documents, error: searchError } = await supabaseService
      .from('user_documents')
      .select(`
        id,
        document_id,
        title,
        document_type,
        content,
        content_html,
        word_count,
        character_count,
        created_at,
        updated_at
      `)
      .eq('user_id', req.user.id)
      .or(`title.ilike.%${searchTerm}%,content.ilike.%${searchTerm}%`)
      .order('updated_at', { ascending: false });

    if (searchError) {
      console.error('[UserTexts] Error searching documents:', searchError);
      throw new Error('Failed to search user texts');
    }

    // Format the response to match the frontend expectations
    const formattedDocuments = documents.map(doc => ({
      id: doc.document_id,
      title: doc.title,
      content_preview: doc.content ? doc.content.substring(0, 200) : '',
      full_content: doc.content || '',
      content_html: doc.content_html || '',
      type: doc.document_type,
      created_at: doc.created_at,
      updated_at: doc.updated_at,
      word_count: doc.word_count || 0,
      character_count: doc.character_count || 0
    }));

    res.json({
      success: true,
      data: formattedDocuments,
      message: `Found ${formattedDocuments.length} documents matching "${query}"`
    });

  } catch (error) {
    console.error('[UserTexts] Error searching:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to search user texts'
    });
  }
});

// Get single document content
router.get('/:documentId', ensureAuthenticated, async (req, res) => {
  try {
    const { documentId } = req.params;

    // Get document from user_documents table
    const { data: document, error: documentError } = await supabaseService
      .from('user_documents')
      .select('*')
      .eq('user_id', req.user.id)
      .eq('document_id', documentId)
      .single();

    if (documentError || !document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found or access denied'
      });
    }

    res.json({
      success: true,
      data: {
        id: document.document_id,
        title: document.title,
        content: document.content || '',
        content_html: document.content_html || '',
        type: document.document_type,
        created_at: document.created_at,
        updated_at: document.updated_at,
        word_count: document.word_count || 0,
        character_count: document.character_count || 0
      }
    });

  } catch (error) {
    console.error('[UserTexts] Error getting document:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to get document'
    });
  }
});

export default router;