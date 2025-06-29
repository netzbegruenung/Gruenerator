import { useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import apiClient from '../utils/apiClient';

/**
 * A hook to preload a collaborative document in the background.
 * @param {string} content - The content to initialize the document with.
 * @param {boolean} hasAccess - Whether the user has access to the collab feature.
 * @param {boolean} isEnabled - A flag to enable or disable the hook.
 * @param {Object} user - User object with id for document metadata.
 * @param {string} title - Document title.
 * @param {string} documentType - Document type.
 * @param {boolean} autoCreate - Whether to automatically create the document or just preload components.
 * @returns {string|null} - The preloaded document ID, or null.
 */
export const useCollabPreload = (content, hasAccess, isEnabled, user = null, title = null, documentType = 'text', autoCreate = false) => {
  const preloadedDocIdRef = useRef(null);
  
  useEffect(() => {
    // Always preload component code if enabled and user has access
    if (isEnabled && hasAccess) {
      // Preload component code
      import('../../pages/CollabEditorPage/CollabEditorPage.jsx');
      import('../../stores/collabEditorStore.js');
    }
    
    // Only create document if autoCreate is explicitly enabled
    if (isEnabled && hasAccess && content && autoCreate && !preloadedDocIdRef.current) {
      const createDoc = async () => {
        try {
          const documentId = uuidv4();
          console.log(`[useCollabPreload] Auto-creating document with ID: ${documentId}`);
          await apiClient.post('/collab-editor/init-doc', { 
            documentId, 
            content,
            userId: user?.id || null,
            title: title || 'Unbenanntes Dokument',
            documentType: documentType || 'text'
          });
          preloadedDocIdRef.current = documentId;
          console.log(`[useCollabPreload] Document ${documentId} successfully auto-created.`);
        } catch (error) {
          console.error('[useCollabPreload] Auto document creation failed:', error);
        }
      };
      
      createDoc();
    }
  }, [content, hasAccess, isEnabled, autoCreate]);
  
  return preloadedDocIdRef.current;
}; 