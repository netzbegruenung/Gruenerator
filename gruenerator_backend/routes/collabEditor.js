const express = require('express');
const router = express.Router();
// Import supabaseService and alias it to supabase for use in this file
const { supabaseService: supabase } = require('../utils/supabaseClient');
let Y = null;
try {
  // Optional dependency: allow running without yjs installed
  // Used only for decoding existing snapshots; otherwise we fallback to plain content
  // eslint-disable-next-line global-require
  Y = require('yjs');
} catch (e) {
  console.log('[Collab Editor Route] yjs not available; snapshot decoding disabled');
}
const pako = require('pako');

// POST /api/collab-editor/init-doc
// Speichert den initialen Inhalt für ein neues kollaboratives Dokument.
router.post('/init-doc', async (req, res) => {
  const { documentId, content, userId, title, documentType } = req.body;

  if (!documentId || typeof content === 'undefined') {
    return res.status(400).json({ message: 'documentId and content are required.' });
  }

  console.log(`[Collab Editor Route] Initializing document (Supabase): ${documentId}, content length: ${content.length}`);

  try {
    // Store document metadata
    if (userId) {
      const { error: metadataError } = await supabase
        .from('user_document_metadata')
        .upsert([{ 
          user_id: userId, 
          document_id: documentId, 
          title: title || 'Unbenanntes Dokument',
          document_type: documentType || 'text'
        }]);

      if (metadataError) {
        console.warn('[Collab Editor Route] Error storing document metadata:', metadataError);
      }
    }

    // Store initial content in temporary init table for Y.js to pick up
    const { data, error } = await supabase
      .from('collaborative_documents_init')
      .insert([{ document_id: documentId, initial_content: content, created_at: new Date() }])
      .select();

    if (error) throw error;
    console.log('[Collab Editor Route] Document initialized in Supabase:', data);
    res.status(201).json({ message: 'Document initialized successfully.', documentId, data });
  } catch (error) {
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

  try {
    // First, try to get from temporary initialization table
    const { data: docData, error: fetchError } = await supabase
      .from('collaborative_documents_init')
      .select('initial_content')
      .eq('document_id', documentId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (fetchError) throw fetchError;

    if (docData && typeof docData.initial_content !== 'undefined') {
      console.log('[Collab Editor Route] Document found in init table:', documentId);
      
      // QUICKFIX: Don't delete immediately - keep for future loads
      // TODO: Implement scheduled cleanup for old documents (>24h)
      // const { error: deleteError } = await supabase
      //   .from('collaborative_documents_init')
      //   .delete()
      //   .eq('document_id', documentId);

      // if (deleteError) {
      //   console.warn('[Collab Editor Route] Error deleting document after retrieval:', deleteError);
      // }

      res.status(200).json({ initialContent: docData.initial_content });
    } else {
      // If not found in init table, try to get from Y.js snapshots (only if yjs available)
      try {
        const { data: snapshotData, error: snapshotError } = await supabase
          .from('yjs_document_snapshots')
          .select('snapshot_data')
          .eq('document_id', documentId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (snapshotError) throw snapshotError;

        let foundInSnapshot = false;
        
        if (Y && snapshotData && snapshotData.snapshot_data) {
          console.log('[Collab Editor Route] Document found in snapshots:', documentId);
          
          try {
            // Decompress and apply Y.js snapshot to get HTML content
            const ydoc = new Y.Doc();
            const decompressedSnapshot = pako.inflate(Buffer.from(snapshotData.snapshot_data));
            Y.applyUpdate(ydoc, decompressedSnapshot);
            
            // Get text content from Y.js document
            const ytext = ydoc.getText('quill');
            const textContent = ytext.toString();
            
            console.log('[Collab Editor Route] Successfully converted Y.js snapshot to text content:', documentId);
            res.status(200).json({ initialContent: textContent });
            foundInSnapshot = true;
          } catch (snapshotProcessingError) {
            console.warn('[Collab Editor Route] Error processing Y.js snapshot:', snapshotProcessingError);
            // Continue to user_texts fallback
          }
        }
        
        if (!foundInSnapshot) {
          // Last fallback: try to get from user_texts table
          try {
            const { data: userTextData, error: userTextError } = await supabase
              .from('user_texts')
              .select('content')
              .eq('id', documentId)
              .maybeSingle();

            if (userTextError) throw userTextError;

            if (userTextData && userTextData.content) {
              console.log('[Collab Editor Route] Document found in user_texts table:', documentId);
              res.status(200).json({ initialContent: userTextData.content });
            } else {
              console.log('[Collab Editor Route] Document not found anywhere, returning empty content:', documentId);
              res.status(200).json({ initialContent: '' });
            }
          } catch (userTextError) {
            console.warn('[Collab Editor Route] Error checking user_texts, returning empty content:', userTextError);
            res.status(200).json({ initialContent: '' });
          }
        }
      } catch (snapshotError) {
        console.warn('[Collab Editor Route] Error checking snapshots, returning empty content:', snapshotError);
        res.status(200).json({ initialContent: '' });
      }
    }
  } catch (error) {
    console.error('[Collab Editor Route] Error fetching document from Supabase:', error);
    res.status(500).json({ message: 'Error fetching document.', error: error.message });
  }
});

// GET /api/collab-editor/get-doc-preview/:documentId
// Ruft den initialen Inhalt für ein kollaboratives Dokument im Preview-Modus ab.
router.get('/get-doc-preview/:documentId', async (req, res) => {
  const { documentId } = req.params;

  if (!documentId) {
    return res.status(400).json({ message: 'documentId is required.' });
  }

  console.log(`[Collab Editor Route] Getting document for preview: ${documentId}`);

  try {
    // Same logic as get-doc but with preview access mode
    // First, try to get from temporary initialization table
    const { data: docData, error: fetchError } = await supabase
      .from('collaborative_documents_init')
      .select('initial_content')
      .eq('document_id', documentId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (fetchError) throw fetchError;

    if (docData && typeof docData.initial_content !== 'undefined') {
      console.log('[Collab Editor Route] Preview document found in init table:', documentId);
      res.status(200).json({ 
        initialContent: docData.initial_content, 
        accessMode: 'preview' 
      });
    } else {
      // Try Y.js snapshots fallback (only if yjs available)
      try {
        const { data: snapshotData, error: snapshotError } = await supabase
          .from('yjs_document_snapshots')
          .select('snapshot_data')
          .eq('document_id', documentId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (snapshotError) throw snapshotError;

        let foundInSnapshot = false;
        
        if (Y && snapshotData && snapshotData.snapshot_data) {
          console.log('[Collab Editor Route] Preview document found in snapshots:', documentId);
          
          try {
            // Decompress and apply Y.js snapshot to get HTML content
            const ydoc = new Y.Doc();
            const decompressedSnapshot = pako.inflate(Buffer.from(snapshotData.snapshot_data));
            Y.applyUpdate(ydoc, decompressedSnapshot);
            
            // Get text content from Y.js document
            const ytext = ydoc.getText('quill');
            const textContent = ytext.toString();
            
            console.log('[Collab Editor Route] Successfully converted Y.js snapshot to text content for preview:', documentId);
            res.status(200).json({ 
              initialContent: textContent, 
              accessMode: 'preview' 
            });
            foundInSnapshot = true;
          } catch (snapshotProcessingError) {
            console.warn('[Collab Editor Route] Error processing Y.js snapshot for preview:', snapshotProcessingError);
          }
        }
        
        if (!foundInSnapshot) {
          // Last fallback: try to get from user_texts table
          try {
            const { data: userTextData, error: userTextError } = await supabase
              .from('user_texts')
              .select('content')
              .eq('id', documentId)
              .maybeSingle();

            if (userTextError) throw userTextError;

            if (userTextData && userTextData.content) {
              console.log('[Collab Editor Route] Preview document found in user_texts table:', documentId);
              res.status(200).json({ 
                initialContent: userTextData.content, 
                accessMode: 'preview' 
              });
            } else {
              console.log('[Collab Editor Route] Preview document not found anywhere, returning empty content:', documentId);
              res.status(200).json({ 
                initialContent: '', 
                accessMode: 'preview' 
              });
            }
          } catch (userTextError) {
            console.warn('[Collab Editor Route] Error checking user_texts for preview, returning empty content:', userTextError);
            res.status(200).json({ 
              initialContent: '', 
              accessMode: 'preview' 
            });
          }
        }
      } catch (snapshotError) {
        console.warn('[Collab Editor Route] Error checking snapshots for preview, returning empty content:', snapshotError);
        res.status(200).json({ 
          initialContent: '', 
          accessMode: 'preview' 
        });
      }
    }
  } catch (error) {
    console.error('[Collab Editor Route] Error fetching preview document from Supabase:', error);
    res.status(500).json({ message: 'Error fetching preview document.', error: error.message });
  }
});

// GET /api/collab-editor/get-doc-metadata/:documentId
// Ruft die Metadaten für ein kollaboratives Dokument ab.
router.get('/get-doc-metadata/:documentId', async (req, res) => {
  const { documentId } = req.params;

  if (!documentId) {
    return res.status(400).json({ message: 'documentId is required.' });
  }

  console.log(`[Collab Editor Route] Getting document metadata: ${documentId}`);

  try {
    const { data: metadata, error } = await supabase
      .from('user_document_metadata')
      .select('*')
      .eq('document_id', documentId)
      .maybeSingle();

    if (error) throw error;

    if (metadata) {
      console.log('[Collab Editor Route] Document metadata found:', documentId);
      res.status(200).json({ metadata });
    } else {
      console.log('[Collab Editor Route] Document metadata not found:', documentId);
      res.status(404).json({ message: 'Document metadata not found.' });
    }
  } catch (error) {
    console.error('[Collab Editor Route] Error fetching document metadata:', error);
    res.status(500).json({ message: 'Error fetching document metadata.', error: error.message });
  }
});

module.exports = router; 
