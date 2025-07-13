import React, { useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import Quill from 'quill';
import 'quill/dist/quill.bubble.css'; // Für das Bubble Theme

// Yjs-spezifische Importe
import { QuillBinding } from 'y-quill';
import * as Y from 'yjs';

// Use Zustand store for collaborative editor state
import useCollabEditorStore from '../../../../stores/collabEditorStore';
import { extractTitleFromContent } from '../../../utils/titleExtractor';

// Quill Editor Configuration
const EDITOR_MODULES = {
  toolbar: [
    ['bold', 'italic', 'underline'],
    [{ 'header': [1, 2, 3, 4, 5, 6, false] }],
    [{ 'list': 'ordered' }, { 'list': 'bullet' }],
    ['link', 'blockquote'],
    ['clean']
  ]
  // Note: history module removed - using Y.js UndoManager instead
};

const EDITOR_FORMATS = [
  'bold', 'italic', 'underline', 'header',
  'list', 'link', 'blockquote', 'background'
];

const QuillYjsEditor = ({ documentId, initialContent, onQuillInstanceReady, onSelectionChange, readOnly = false }) => {
  const editorRef = useRef(null); // Ref für das Quill-Container-Div
  const quillInstanceRef = useRef(null); // Ref für die Quill-Instanz selbst
  const bindingRef = useRef(null);
  const undoManagerRef = useRef(null); // Ref für Y.js UndoManager
  const initialContentLoadedRef = useRef(false);

  const { 
    ydoc, 
    ytext, 
    provider, 
    awareness, 
    connectionStatus,
    setQuillInstance,
    setUndoManager,
    initializeDocument,
    applyInitialContent
  } = useCollabEditorStore();

  // Initialize document when component mounts or documentId changes
  useEffect(() => {
    if (documentId) {
      initializeDocument(documentId);
    }
  }, [documentId, initializeDocument]);

  // Effect for Quill initialization and Yjs binding
  useEffect(() => {
    // 1. Initialize Quill instance if editorRef is available and Quill isn't already initialized
    if (editorRef.current && !quillInstanceRef.current) {
      const documentTitle = initialContent ? extractTitleFromContent(initialContent, `Doc-${documentId}`) : `Doc-${documentId}`;
      console.log(`[QuillYjsEditor] Initializing Quill. DocumentId: ${documentId}, Title: "${documentTitle}"`);
      
      const quill = new Quill(editorRef.current, {
        theme: 'bubble',
        modules: EDITOR_MODULES,
        formats: EDITOR_FORMATS,
        placeholder: readOnly ? 'Vorschaumodus - Nur Lesen' : 'Verbinde mit Kollaborations-Server...',
        readOnly: true, // Start as read-only, will be enabled later if not in readOnly mode
      });
      quillInstanceRef.current = quill;
      
      // Update the store with the Quill instance
      setQuillInstance(quill);

      if (onQuillInstanceReady) {
        onQuillInstanceReady(quill);
      }

      if (onSelectionChange) {
        quill.on('selection-change', (range, oldRange, source) => {
          if (source === 'user') {
            if (range) { // range is an object if there's a selection or caret
              const selectedText = quill.getText(range.index, range.length);
              onSelectionChange(selectedText, range);
            } else { // range is null if editor loses focus
              onSelectionChange('', null); // Notify parent about lost focus / deselection
            }
          }
        });
      }
    }

    // 2. Manage Yjs binding and editor interactivity based on Yjs objects and connectionStatus
    if (quillInstanceRef.current && ydoc && ytext && provider && awareness) { // Ensure Yjs core objects are present
      if (connectionStatus === 'connected') {
        if (!bindingRef.current) {
          // Yjs is connected, core objects available, and no binding yet: CREATE BINDING
          const documentTitle = initialContent ? extractTitleFromContent(initialContent, `Doc-${documentId}`) : `Doc-${documentId}`;
          console.log(`[QuillYjsEditor] Yjs connected. Attempting to create QuillBinding. DocumentId: ${documentId}, Title: \"${documentTitle}\"`);
          const binding = new QuillBinding(ytext, quillInstanceRef.current, awareness);
          bindingRef.current = binding;

          // Create Y.js UndoManager after QuillBinding
          if (!undoManagerRef.current) {
            console.log('[QuillYjsEditor] Creating Y.js UndoManager');
            const undoManager = new Y.UndoManager(ytext, {
              captureTimeout: 500,
              deleteFilter: () => true,
              trackedOrigins: new Set([null, binding, 'ai-assistant', 'form-context-set', 'initial-content']) // Track user, QuillBinding, AI, and initial content operations
            });
            
            
            undoManagerRef.current = undoManager;
            setUndoManager(undoManager);
            console.log('[QuillYjsEditor] Y.js UndoManager created and stored');
          }

          if (!readOnly) {
            quillInstanceRef.current.enable(); // Make editable only if not in readOnly mode
            quillInstanceRef.current.root.dataset.placeholder = 'Beginne mit der Bearbeitung...';
            console.log('[QuillYjsEditor] QuillBinding created. Editor is now interactive.');
          } else {
            quillInstanceRef.current.disable(); // Keep disabled in readOnly mode
            quillInstanceRef.current.root.dataset.placeholder = 'Vorschaumodus - Nur Lesen';
            console.log('[QuillYjsEditor] QuillBinding created. Editor remains read-only (preview mode).');
          }
        } else {
           // Already connected and bound, ensure editor is interactive (e.g. if it was re-enabled after a disconnect)
          if (quillInstanceRef.current.options.readOnly && !readOnly) { // Check if it's currently read-only and not in readOnly mode
              quillInstanceRef.current.enable();
              quillInstanceRef.current.root.dataset.placeholder = 'Beginne mit der Bearbeitung...';
              console.log('[QuillYjsEditor] Re-enabled editor upon confirmed connection.');
          }
        }
      } else { // Not 'connected' (e.g., 'disconnected', 'connecting', 'error')
        if (bindingRef.current) {
          // Was connected and bound, but Yjs is no longer in 'connected' state: DESTROY BINDING
          console.warn(`[QuillYjsEditor] Yjs not 'connected' (status: ${connectionStatus}). Destroying existing binding.`);
          bindingRef.current.destroy();
          bindingRef.current = null;
        }
        
        // Note: UndoManager is NOT destroyed on connection loss - it preserves history
        // UndoManager will only be destroyed when document changes or component unmounts
        // Set editor to read-only and update placeholder regardless of previous binding state, if Quill exists
        quillInstanceRef.current.disable(); // Make read-only
        if (connectionStatus === 'connecting') {
          quillInstanceRef.current.root.dataset.placeholder = 'Verbinde mit Kollaborations-Server...';
        } else { // 'disconnected', 'error', or other states
          quillInstanceRef.current.root.dataset.placeholder = 'Verbindungsproblem. Bitte warten oder Seite neu laden.';
        }
      }
    } else if (quillInstanceRef.current && (!ydoc || !ytext || !provider || !awareness)) {
        // Quill is there, but Yjs objects from context are not (e.g. during context re-init)
        console.warn('[QuillYjsEditor] Quill instance exists, but Yjs context objects are missing. Setting to read-only.');
        quillInstanceRef.current.disable();
        quillInstanceRef.current.root.dataset.placeholder = 'Editor wird initialisiert...';
    }
  // Dependencies:
  // - documentId: for re-initialization if document changes.
  // - onQuillInstanceReady, onSelectionChange: callbacks.
  // - ydoc, ytext, provider, awareness, connectionStatus: for Yjs binding logic and editor state.
  }, [documentId, onQuillInstanceReady, onSelectionChange, ydoc, ytext, provider, awareness, connectionStatus]);

  // Separate effect to load initialContent into ytext if ytext is empty
  useEffect(() => {
    // Ensure ytext is available, initialContent is provided, and content hasn't been loaded yet
    if (ytext && initialContent && ytext.length === 0 && !initialContentLoadedRef.current) {
      console.log('[QuillYjsEditor] ytext is empty and initialContent is available. Applying initialContent. Length:', initialContent.length);
      
      // Use the store method to apply initial content
      const applied = applyInitialContent(initialContent);
      
      if (applied) {
        initialContentLoadedRef.current = true; // Mark that initial content has been loaded
        console.log('[QuillYjsEditor] Applied initialContent to Yjs document and set flag for:', documentId);
      }
    }
  }, [initialContent, ytext, documentId, applyInitialContent]);
  
  // Effect to reset the initialContentLoadedRef when the documentId changes
  useEffect(() => {
    console.log('[QuillYjsEditor] DocumentId changed, resetting initialContentLoadedRef.');
    initialContentLoadedRef.current = false;
  }, [documentId]);

  // Targeted cleanup for the Yjs binding and UndoManager when documentId changes or the component unmounts.
  // This ensures that if the documentId changes, the old binding is destroyed before
  // the main effect attempts to set up a new one for the new documentId.
  useEffect(() => {
    return () => {
      if (bindingRef.current) {
        console.log(`[QuillYjsEditor] Destroying Yjs binding for document: ${documentId} (on unmount or documentId change)`);
        bindingRef.current.destroy();
        bindingRef.current = null;
      }
      
      if (undoManagerRef.current) {
        console.log(`[QuillYjsEditor] Destroying Y.js UndoManager for document: ${documentId} (on unmount or documentId change)`);
        undoManagerRef.current.destroy();
        undoManagerRef.current = null;
        setUndoManager(null);
      }
      // We don't null out quillInstanceRef.current here because its lifecycle is tied to
      // editorRef.current by the main useEffect. If editorRef persists (e.g. if the component
      // itself isn't unmounted but documentId changes), the main effect will handle
      // re-initialization of Quill if quillInstanceRef.current was somehow cleared or
      // if it decides to based on its logic (currently it reuses if !quillInstanceRef.current is false).
    };
  }, [documentId, setUndoManager]); // Only re-run this cleanup if documentId changes.

  return (
    <div 
      ref={editorRef} 
      id={`quill-editor-${documentId}`} 
      className="collab-editor-quill"
    >
      {/* Quill rendert hier hinein */}
    </div>
  );
};

QuillYjsEditor.propTypes = {
  documentId: PropTypes.string.isRequired,
  initialContent: PropTypes.string,
  onQuillInstanceReady: PropTypes.func.isRequired,
  onSelectionChange: PropTypes.func,
  readOnly: PropTypes.bool,
};

QuillYjsEditor.defaultProps = {
  initialContent: '',
  onSelectionChange: () => {},
  readOnly: false,
};

export default QuillYjsEditor; 