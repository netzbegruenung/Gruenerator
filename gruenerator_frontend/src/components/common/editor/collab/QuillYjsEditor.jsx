import React, { useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import Quill from 'quill';
import 'quill/dist/quill.bubble.css'; // Für das Bubble Theme

// Yjs-spezifische Importe
import * as Y from 'yjs';
import { QuillBinding } from 'y-quill';
import { WebsocketProvider } from 'y-websocket';

// Yjs, WebsocketProvider werden jetzt vom CollabEditorContext bereitgestellt
import { useCollabEditor } from '../../../../context/CollabEditorContext';

const QuillYjsEditor = ({ documentId, initialContent, onQuillInstanceReady, onSelectionChange }) => {
  const editorRef = useRef(null); // Ref für das Quill-Container-Div
  const quillInstanceRef = useRef(null); // Ref für die Quill-Instanz selbst
  const bindingRef = useRef(null);
  const initialContentLoadedRef = useRef(false);

  const { ydoc, ytext, provider, awareness, connectionStatus } = useCollabEditor();

  // Effect for Quill initialization and Yjs binding
  useEffect(() => {
    // 1. Initialize Quill instance if editorRef is available and Quill isn't already initialized
    if (editorRef.current && !quillInstanceRef.current) {
      console.log('[QuillYjsEditor] Initializing Quill. DocumentId:', documentId);
      
      const quill = new Quill(editorRef.current, {
        theme: 'bubble',
        modules: {
          ...EDITOR_MODULES,
          toolbar: true, // Ensure toolbar is correctly configured for bubble theme
        },
        formats: EDITOR_FORMATS,
        placeholder: 'Verbinde mit Kollaborations-Server...',
        readOnly: true,
      });
      quillInstanceRef.current = quill;

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
          console.log('[QuillYjsEditor] Yjs connected. Attempting to create QuillBinding. DocumentId:', documentId);
          const binding = new QuillBinding(ytext, quillInstanceRef.current, awareness);
          bindingRef.current = binding;

          quillInstanceRef.current.enable(); // Make editable
          quillInstanceRef.current.root.dataset.placeholder = 'Beginne mit der Bearbeitung...';
          console.log('[QuillYjsEditor] QuillBinding created. Editor is now interactive.');
        } else {
           // Already connected and bound, ensure editor is interactive (e.g. if it was re-enabled after a disconnect)
          if (quillInstanceRef.current.options.readOnly) { // Check if it's currently read-only
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
    // Ensure ytext & ydoc are available, initialContent is provided, 
    // ytext is actually empty, and content hasn't been loaded yet.
    // The connectionStatus === 'connected' check is removed to allow earlier content application.
    if (ytext && ydoc && initialContent && ytext.length === 0 && !initialContentLoadedRef.current) {
      console.log('[QuillYjsEditor] ytext is empty and initialContent is available. Applying initialContent. Length:', initialContent.length);
      
      // Use a temporary Quill instance to convert HTML to Delta
      const tempQuill = new Quill(document.createElement('div'));
      tempQuill.clipboard.dangerouslyPasteHTML(0, initialContent);
      const delta = tempQuill.getContents();
      
      // Apply the delta to ytext within a Yjs transaction
      ydoc.transact(() => {
        ytext.applyDelta(delta.ops);
      });
      
      initialContentLoadedRef.current = true; // Mark that initial content has been loaded
      console.log('[QuillYjsEditor] Applied initialContent to Yjs document and set flag for:', documentId);
    }
  // This effect runs if initialContent, ytext, ydoc, or connectionStatus change.
  // initialContentLoadedRef is a ref, so it doesn't need to be in dependencies.
  // documentId is included to re-evaluate if the document changes, which would also trigger the reset effect below.
  }, [initialContent, ytext, ydoc, connectionStatus, documentId]);
  
  // Effect to reset the initialContentLoadedRef when the documentId changes
  useEffect(() => {
    console.log('[QuillYjsEditor] DocumentId changed, resetting initialContentLoadedRef.');
    initialContentLoadedRef.current = false;
  }, [documentId]);

  // Targeted cleanup for the Yjs binding when documentId changes or the component unmounts.
  // This ensures that if the documentId changes, the old binding is destroyed before
  // the main effect attempts to set up a new one for the new documentId.
  useEffect(() => {
    return () => {
      if (bindingRef.current) {
        console.log(`[QuillYjsEditor] Destroying Yjs binding for document: ${documentId} (on unmount or documentId change)`);
        bindingRef.current.destroy();
        bindingRef.current = null;
      }
      // We don't null out quillInstanceRef.current here because its lifecycle is tied to
      // editorRef.current by the main useEffect. If editorRef persists (e.g. if the component
      // itself isn't unmounted but documentId changes), the main effect will handle
      // re-initialization of Quill if quillInstanceRef.current was somehow cleared or
      // if it decides to based on its logic (currently it reuses if !quillInstanceRef.current is false).
    };
  }, [documentId]); // Only re-run this cleanup if documentId changes.

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
};

QuillYjsEditor.defaultProps = {
  initialContent: '',
  onSelectionChange: () => {},
};

export default QuillYjsEditor; 