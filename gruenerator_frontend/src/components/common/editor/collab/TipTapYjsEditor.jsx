import React, { useEffect, useRef, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import * as Y from 'yjs';
import { HocuspocusProvider } from '@hocuspocus/provider';
import { Editor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCursor from '@tiptap/extension-collaboration-cursor';

// Import highlight extensions
import { SelectionHighlight, AIHighlight } from '../utils/tiptapHighlightUtils';

// Use Zustand store for collaborative editor state
import useCollabEditorStore from '../../../../stores/collabEditorStore';
import { extractTitleFromContent } from '../../../utils/titleExtractor';

const TipTapYjsEditor = ({ 
  documentId, 
  initialContent, 
  onEditorInstanceReady, 
  onSelectionChange, 
  readOnly = false 
}) => {
  const editorInstanceRef = useRef(null);
  const initialContentLoadedRef = useRef(false);
  const [user] = useState(() => ({
    id: Math.random().toString(36).slice(2, 8),
    name: `User-${Math.random().toString(36).slice(2, 5)}`,
    color: '#58a6ff', // Default blue
  }));

  const { 
    ydoc, 
    provider, 
    awareness, 
    connectionStatus,
    setEditorInstance,
    initializeDocument,
    applyInitialContent
  } = useCollabEditorStore();

  // Initialize document when component mounts or documentId changes
  useEffect(() => {
    if (documentId) {
      const providerPref = import.meta.env.VITE_COLLAB_PROVIDER || 'hocuspocus';
      initializeDocument(documentId, providerPref);
    }
  }, [documentId, initializeDocument]);

  // Create TipTap editor with collaborative extensions
  const editor = useMemo(() => {
    if (!ydoc || !provider || !awareness) return null;

    const documentTitle = initialContent 
      ? extractTitleFromContent(initialContent, `Doc-${documentId}`) 
      : `Doc-${documentId}`;
    
    console.log(`[TipTapYjsEditor] Initializing TipTap editor for document: ${documentId}, Title: "${documentTitle}"`);

    return new Editor({
      extensions: [
        StarterKit,
        Collaboration.configure({
          document: ydoc,
        }),
        CollaborationCursor.configure({
          provider,
          user,
        }),
        SelectionHighlight,
        AIHighlight,
      ],
      autofocus: !readOnly,
      editable: !readOnly,
      content: '',
      onSelectionUpdate: ({ editor }) => {
        if (onSelectionChange && !readOnly) {
          const { from, to, empty } = editor.state.selection;
          if (!empty) {
            const selectedText = editor.state.doc.textBetween(from, to, ' ');
            onSelectionChange(selectedText, { index: from, length: to - from });
          } else {
            onSelectionChange('', null);
          }
        }
      },
      onFocus: ({ editor }) => {
        console.log('[TipTapYjsEditor] Editor focused');
      },
      onBlur: ({ editor }) => {
        console.log('[TipTapYjsEditor] Editor blurred');
        if (onSelectionChange) {
          onSelectionChange('', null);
        }
      },
      onCreate: ({ editor }) => {
        console.log('[TipTapYjsEditor] Editor created successfully');
        editorInstanceRef.current = editor;
        setEditorInstance(editor);
        
        if (onEditorInstanceReady) {
          onEditorInstanceReady(editor);
        }
      },
      onUpdate: ({ editor }) => {
        // Editor content has been updated
        console.log('[TipTapYjsEditor] Editor content updated');
      },
    });
  }, [ydoc, provider, awareness, documentId, initialContent, onEditorInstanceReady, onSelectionChange, readOnly, setEditorInstance, user]);

  // Apply initial content when available and editor is ready
  useEffect(() => {
    if (editor && initialContent && !initialContentLoadedRef.current && connectionStatus === 'connected') {
      console.log('[TipTapYjsEditor] Applying initial content. Length:', initialContent.length);
      
      const applied = applyInitialContent(initialContent);
      
      if (applied) {
        initialContentLoadedRef.current = true;
        console.log('[TipTapYjsEditor] Applied initial content to Y.js document for:', documentId);
      }
    }
  }, [editor, initialContent, documentId, connectionStatus, applyInitialContent]);

  // Reset initial content flag when documentId changes
  useEffect(() => {
    console.log('[TipTapYjsEditor] DocumentId changed, resetting initial content flag.');
    initialContentLoadedRef.current = false;
  }, [documentId]);

  // Update editor state based on connection status
  useEffect(() => {
    if (!editor) return;

    if (connectionStatus === 'connected') {
      if (!readOnly) {
        editor.setEditable(true);
        console.log('[TipTapYjsEditor] Editor enabled - connected to collaboration server');
      }
    } else {
      editor.setEditable(false);
      console.log(`[TipTapYjsEditor] Editor disabled - connection status: ${connectionStatus}`);
    }
  }, [editor, connectionStatus, readOnly]);

  // Cleanup editor on unmount
  useEffect(() => {
    return () => {
      if (editor) {
        console.log(`[TipTapYjsEditor] Destroying editor for document: ${documentId}`);
        editor.destroy();
      }
    };
  }, [editor, documentId]);

  // Show loading state while editor is being initialized
  if (!editor) {
    return (
      <div className="tiptap-editor-loading">
        <div className="loading-placeholder">
          {connectionStatus === 'connecting' ? 'Verbinde mit Server...' : 'Editor wird geladen...'}
        </div>
      </div>
    );
  }

  return (
    <div 
      className={`tiptap-editor-container ${readOnly ? 'read-only' : ''} ${connectionStatus}`}
      data-document-id={documentId}
    >
      {connectionStatus !== 'connected' && (
        <div className="connection-status-bar">
          {connectionStatus === 'connecting' && 'Verbinde mit Kollaborations-Server...'}
          {connectionStatus === 'disconnected' && 'Verbindung unterbrochen. Versuche Wiederverbindung...'}
          {connectionStatus === 'error' && 'Verbindungsfehler. Bitte Seite neu laden.'}
        </div>
      )}
      <EditorContent editor={editor} />
      {readOnly && (
        <div className="read-only-overlay">
          <span>👁️ Vorschaumodus - Nur Lesen</span>
        </div>
      )}
    </div>
  );
};

TipTapYjsEditor.propTypes = {
  documentId: PropTypes.string.isRequired,
  initialContent: PropTypes.string,
  onEditorInstanceReady: PropTypes.func.isRequired,
  onSelectionChange: PropTypes.func,
  readOnly: PropTypes.bool,
};

TipTapYjsEditor.defaultProps = {
  initialContent: '',
  onSelectionChange: () => {},
  readOnly: false,
};

export default TipTapYjsEditor;
