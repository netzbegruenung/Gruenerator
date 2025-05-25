const express = require('express');
const router = express.Router();
// Import supabaseService and alias it to supabase for use in this file
const { supabaseService: supabase } = require('../utils/supabaseClient');

// POST /api/collab-editor/init-doc
// Speichert den initialen Inhalt für ein neues kollaboratives Dokument.
router.post('/init-doc', async (req, res) => {
  const { documentId, content } = req.body;

  if (!documentId || typeof content === 'undefined') {
    return res.status(400).json({ message: 'documentId and content are required.' });
  }

  console.log(`[Collab Editor Route] Initializing document (Supabase): ${documentId}, content length: ${content.length}`);

  // Supabase logic
  try {
    const { data, error } = await supabase
      .from('collaborative_documents_init')
      .insert([{ document_id: documentId, initial_content: content, created_at: new Date() }])
      .select();

    if (error) throw error;
    console.log('[Collab Editor Route] Document initialized in Supabase:', data);
    res.status(201).json({ message: 'Document initialized successfully.', documentId, data });
  } catch (error) { // Make sure to catch this error if Supabase is used
    console.error('[Collab Editor Route] Error initializing document in Supabase:', error);
    res.status(500).json({ message: 'Error initializing document.', error: error.message });
  }
});

// GET /api/collab-editor/get-doc/:documentId
// Ruft den initialen Inhalt für ein kollaboratives Dokument ab.
router.get('/get-doc/:documentId', async (req, res) => {
  const { documentId } = req.params;

  if (!documentId) {
    return res.status(400).json({ message: 'documentId is required.' });
  }

  console.log(`[Collab Editor Route] Getting document (Supabase): ${documentId}`);

  // Supabase logic
  try {
    const { data: docData, error: fetchError } = await supabase
      .from('collaborative_documents_init')
      .select('initial_content')
      .eq('document_id', documentId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (fetchError) throw fetchError;

    if (docData && typeof docData.initial_content !== 'undefined') {
      console.log('[Collab Editor Route] Document found in Supabase:', documentId);
      
      // Delete the initial content after retrieval as it's meant to be temporary
      const { error: deleteError } = await supabase
        .from('collaborative_documents_init')
        .delete()
        .eq('document_id', documentId);

      if (deleteError) {
        // Log the error but proceed to send content, as retrieval was successful
        console.warn('[Collab Editor Route] Error deleting document after retrieval, but proceeding to send content:', deleteError);
      }

      res.status(200).json({ initialContent: docData.initial_content });
    } else {
      console.log('[Collab Editor Route] Document not found or no content for:', documentId);
      // If no document is found, return empty content so Yjs can start a new one
      res.status(200).json({ initialContent: '' });
    }
  } catch (error) { // Make sure to catch this error if Supabase is used
    console.error('[Collab Editor Route] Error fetching document from Supabase:', error);
    res.status(500).json({ message: 'Error fetching document.', error: error.message });
  }
});

module.exports = router; 