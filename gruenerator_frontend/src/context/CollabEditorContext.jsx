import React, { createContext, useState, useCallback, useMemo, useContext, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';

export const CollabEditorContext = createContext(null);

export const CollabEditorProvider = ({ children, documentId, initialContent }) => {
  // Hier können später Status und Funktionen für den kollaborativen Editor hinzugefügt werden,
  // z.B. Verbindungsstatus zum Yjs-Server, Liste der aktiven Benutzer, etc.
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [activeUsers, setActiveUsers] = useState([]);

  const ydocRef = useRef(null);
  const providerRef = useRef(null);
  const ytextRef = useRef(null);
  const yChatHistoryRef = useRef(null); // New Ref for chat history
  const awarenessRef = useRef(null);

  // NEU: Zustand für die Quill-Instanz
  const [quillInstance, setQuillInstance] = useState(null);

  // Memoize Yjs instances to prevent re-creation on every render, only if documentId changes
  useEffect(() => {
    console.log('[CollabEditorContext] Initializing Yjs for document:', documentId);
    const ydoc = new Y.Doc();
    ydocRef.current = ydoc;

    const ytext = ydoc.getText('quill');
    ytextRef.current = ytext;

    const yChatHistory = ydoc.getArray('chatHistory'); // Initialize Y.Array for chat
    yChatHistoryRef.current = yChatHistory; // Store in ref

    const websocketUrl = import.meta.env.VITE_YJS_WEBSOCKET_URL;
    if (!websocketUrl) {
      console.error("[CollabEditorContext] VITE_YJS_WEBSOCKET_URL is not defined.");
      setConnectionStatus('error');
      return;
    }

    const provider = new WebsocketProvider(
      websocketUrl,
      documentId,
      ydoc
    );
    providerRef.current = provider;
    awarenessRef.current = provider.awareness; // Store awareness

    provider.on('status', ({ status }) => {
      console.log('[CollabEditorContext] Websocket status:', status);
      setConnectionStatus(status);
    });

    provider.on('sync', (isSynced) => {
      console.log(`[CollabEditorContext] Sync event. isSynced: ${isSynced}, ytext.length: ${ytextRef.current ? ytextRef.current.length : 'N/A'}`);
      // The main initial content application is handled by QuillYjsEditor itself,
      // when it receives the ytext object and the initialContent prop.
    });
    
    // Placeholder for active users update
    provider.awareness.on('change', () => {
      setActiveUsers(Array.from(provider.awareness.getStates().keys()));
    });

    setConnectionStatus('connecting');

    return () => {
      console.log('[CollabEditorContext] Cleaning up Yjs for document:', documentId);
      if (providerRef.current) {
        providerRef.current.disconnect();
        // providerRef.current.destroy(); // destroy also an option
      }
      if (ydocRef.current) {
        ydocRef.current.destroy();
      }
      ydocRef.current = null;
      providerRef.current = null;
      ytextRef.current = null;
      yChatHistoryRef.current = null; // Clean up chat history ref
      awarenessRef.current = null;
      setConnectionStatus('disconnected');
      setQuillInstance(null); // Quill-Instanz beim Aufräumen zurücksetzen
    };
  }, [documentId]); // REMOVED initialContent from dependencies

  const contextValue = useMemo(() => ({
    documentId,
    connectionStatus,
    activeUsers,
    ydoc: ydocRef.current,
    ytext: ytextRef.current,
    yChatHistory: yChatHistoryRef.current, // Provide chat history in context
    provider: providerRef.current, // Exposing the provider might be too broad, consider specific parts
    awareness: awarenessRef.current, // Expose awareness
    // connectYjs and disconnectYjs might become internal or change role
    quillInstance,
    setQuillInstance,
  }), [documentId, connectionStatus, activeUsers, ydocRef, ytextRef, yChatHistoryRef, providerRef, awarenessRef, quillInstance]);

  return (
    <CollabEditorContext.Provider value={contextValue}>
      {children}
    </CollabEditorContext.Provider>
  );
};

CollabEditorProvider.propTypes = {
  children: PropTypes.node.isRequired,
  documentId: PropTypes.string.isRequired,
  initialContent: PropTypes.string, // Added for initial content handling
};

CollabEditorProvider.defaultProps = {
  initialContent: '',
};

export const useCollabEditor = () => {
  const context = useContext(CollabEditorContext);
  if (context === undefined || context === null) { // Check for null as well
    throw new Error('useCollabEditor must be used within a CollabEditorProvider and context must be available');
  }
  return context;
}; 