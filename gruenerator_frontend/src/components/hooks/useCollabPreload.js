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
 * @returns {string|null} - The preloaded document ID, or null.
 */
export const useCollabPreload = (content, hasAccess, isEnabled, user = null, title = null, documentType = 'text') => {
  const preloadedDocIdRef = useRef(null);
  
  useEffect(() => {
    // Only run if the feature is enabled, user has access, there is content, and no doc has been preloaded yet.
    if (isEnabled && hasAccess && content && !preloadedDocIdRef.current) {
      const createDoc = async () => {
        try {
          const documentId = uuidv4();
          console.log(`[useCollabPreload] Preloading document with ID: ${documentId}`);
          await apiClient.post('/collab-editor/init-doc', { 
            documentId, 
            content,
            userId: user?.id || null,
            title: title || 'Unbenanntes Dokument',
            documentType: documentType || 'text'
          });
          preloadedDocIdRef.current = documentId;
          console.log(`[useCollabPreload] Document ${documentId} successfully preloaded.`);
        } catch (error) {
          console.error('[useCollabPreload] Preload document creation failed:', error);
        }
      };
      
      // Preload component code as well
      import('../../pages/CollabEditorPage/CollabEditorPage.jsx');
      import('../../stores/collabEditorStore.js');
      
      createDoc();
    }
  }, [content, hasAccess, isEnabled]);
  
  return preloadedDocIdRef.current;
}; 