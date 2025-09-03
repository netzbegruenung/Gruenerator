import { create } from 'zustand';

// Collaborative Editor Store using Zustand
const useCollabEditorStore = create((set, get) => ({
  // Core state
  documentId: null,
  connectionStatus: 'disconnected', // 'disconnected', 'connecting', 'connected', 'error'
  activeUsers: [],
  providerType: null, // 'websocket' | 'hocuspocus'
  
  // Yjs objects (stored as refs to avoid reactivity issues)
  ydoc: null,
  ytext: null,
  yChatHistory: null,
  provider: null,
  awareness: null,
  
  // Editor instance (TipTap or Quill)
  editorInstance: null,
  
  // Y.js UndoManager instance
  undoManager: null,
  
  // Track undo/redo state (since Y.js doesn't expose stack lengths directly)
  canUndoState: false,
  canRedoState: false,
  
  // Initialization flag
  isInitialized: false,
  
  // Actions
  initializeDocument: async (documentId, providerType = 'hocuspocus') => {
    const state = get();
    
    // Don't reinitialize if already initialized with the same document and provider
    if (state.isInitialized && state.documentId === documentId && state.providerType === providerType) {
      console.log('[CollabEditorStore] Document already initialized:', documentId, 'with provider:', providerType);
      return;
    }
    
    // Clean up existing document if switching documents
    if (state.isInitialized) {
      state.cleanup();
    }
    
    console.log('[CollabEditorStore] Initializing document:', documentId, 'with provider:', providerType);
    
    // Create new Yjs document (import the module namespace; yjs has no default export)
    const Y = await import('yjs');
    const ydoc = new Y.Doc();
    const ytext = ydoc.getText('content'); // Use 'content' instead of 'quill' for TipTap
    const yChatHistory = ydoc.getArray('chatHistory');
    
    let provider, awareness;
    
    if (providerType === 'hocuspocus') {
      // Use Hocuspocus provider
      const { HocuspocusProvider } = await import('@hocuspocus/provider');
      const hocuspocusUrl = import.meta.env.VITE_HOCUSPOCUS_URL || 'ws://localhost:1240';
      
      console.log('[CollabEditorStore] Using Hocuspocus URL:', hocuspocusUrl);
      
      provider = new HocuspocusProvider({
        url: hocuspocusUrl,
        name: documentId,
        document: ydoc,
      });
      
      awareness = provider.awareness;
      
      // Set up Hocuspocus event listeners
      provider.on('status', (event) => {
        console.log('[CollabEditorStore] Hocuspocus status:', event.status);
        const next = event.status;
        // Avoid React warning by deferring store updates during render
        const doUpdate = () => set({ connectionStatus: next });
        if (typeof window !== 'undefined') {
          setTimeout(doUpdate, 0);
        } else {
          doUpdate();
        }
      });
      
      provider.on('connect', () => {
        console.log('[CollabEditorStore] Hocuspocus connected');
      });

      // Hocuspocus uses 'synced' (not 'sync') once the initial state is in sync
      provider.on('synced', () => {
        console.log('[CollabEditorStore] Hocuspocus synced');
        const doUpdate = () => set({ connectionStatus: 'connected' });
        if (typeof window !== 'undefined') {
          setTimeout(doUpdate, 0);
        } else {
          doUpdate();
        }
      });
      
      provider.on('disconnect', () => {
        console.log('[CollabEditorStore] Hocuspocus disconnected');
        const doUpdate = () => set({ connectionStatus: 'disconnected' });
        if (typeof window !== 'undefined') {
          setTimeout(doUpdate, 0);
        } else {
          doUpdate();
        }
      });
      
    } else {
      // Fallback to WebSocket provider
      const { WebsocketProvider } = await import('y-websocket');
      const websocketUrl = import.meta.env.VITE_YJS_WEBSOCKET_URL || 'wss://gruenerator.de/yjs';
      
      console.log('[CollabEditorStore] Using Y.js WebSocket URL:', websocketUrl);
      
      provider = new WebsocketProvider(websocketUrl, documentId, ydoc);
      awareness = provider.awareness;
      
      // Set up WebSocket event listeners
      provider.on('status', ({ status }) => {
        console.log('[CollabEditorStore] WebSocket status:', status);
        const next = status;
        const doUpdate = () => set({ connectionStatus: next });
        if (typeof window !== 'undefined') {
          setTimeout(doUpdate, 0);
        } else {
          doUpdate();
        }
      });
    }
    
    // Common provider setup
    provider.on('sync', (isSynced) => {
      console.log(`[CollabEditorStore] Sync event. isSynced: ${isSynced}, ytext.length: ${ytext.length}`);
    });
    
    // Track active users
    awareness.on('change', () => {
      const activeUserIds = Array.from(awareness.getStates().keys());
      const doUpdate = () => set({ activeUsers: activeUserIds });
      // Defer to avoid setState during render (e.g., when TipTap initializes)
      if (typeof window !== 'undefined') {
        setTimeout(doUpdate, 0);
      } else {
        doUpdate();
      }
    });
    
    // Update state
    set({
      documentId,
      providerType,
      ydoc,
      ytext,
      yChatHistory,
      provider,
      awareness,
      connectionStatus: 'connecting',
      isInitialized: true,
    });
  },
  
  cleanup: () => {
    const state = get();
    
    console.log('[CollabEditorStore] Cleaning up document:', state.documentId);
    
    // Disconnect and destroy provider
    if (state.provider) {
      state.provider.disconnect();
      // state.provider.destroy(); // Optional: more aggressive cleanup
    }
    
    // Destroy Yjs document
    if (state.ydoc) {
      state.ydoc.destroy();
    }
    
    // Clean up UndoManager event listeners if they exist
    const { undoManager } = state;
    if (undoManager && undoManager._storeCleanup) {
      console.log('[CollabEditorStore] Cleaning up UndoManager event listeners');
      undoManager._storeCleanup();
      delete undoManager._storeCleanup; // Remove the reference
    }

    // Reset state
    set({
      documentId: null,
      ydoc: null,
      ytext: null,
      yChatHistory: null,
      provider: null,
      awareness: null,
      connectionStatus: 'disconnected',
      activeUsers: [],
      providerType: null,
      editorInstance: null,
      undoManager: null,
      canUndoState: false,
      canRedoState: false,
      isInitialized: false,
    });
  },
  
  setEditorInstance: (instance) => {
    console.log('[CollabEditorStore] Setting editor instance:', instance);
    const doUpdate = () => set({ editorInstance: instance });
    if (typeof window !== 'undefined') {
      setTimeout(doUpdate, 0);
    } else {
      doUpdate();
    }
  },
  
  // Backward compatibility
  setQuillInstance: (instance) => {
    console.log('[CollabEditorStore] Setting Quill instance (legacy):', instance);
    const doUpdate = () => set({ editorInstance: instance });
    if (typeof window !== 'undefined') {
      setTimeout(doUpdate, 0);
    } else {
      doUpdate();
    }
  },

  // Helper method to check actual UndoManager stack state
  _updateUndoRedoState: () => {
    const { undoManager } = get();
    if (undoManager) {
      // Y.js UndoManager exposes the stack arrays directly
      let canUndoActual = false;
      let canRedoActual = false;
      
      try {
        // Check if undo stack has items
        canUndoActual = undoManager.undoStack && undoManager.undoStack.length > 0;
      } catch (e) {
        canUndoActual = false;
      }
      
      try {
        // Check if redo stack has items
        canRedoActual = undoManager.redoStack && undoManager.redoStack.length > 0;
      } catch (e) {
        canRedoActual = false;
      }
      
      
      set({ 
        canUndoState: canUndoActual, 
        canRedoState: canRedoActual 
      });
    } else {
      set({ 
        canUndoState: false, 
        canRedoState: false 
      });
    }
  },

  setUndoManager: (undoManager) => {
    console.log('[CollabEditorStore] Setting Y.js UndoManager:', undoManager);
    
    // Clean up previous UndoManager if it exists
    const prevUndoManager = get().undoManager;
    if (prevUndoManager && prevUndoManager._storeCleanup) {
      prevUndoManager._storeCleanup();
    }
    
    if (undoManager) {
      const store = { get, set };
      
      const handleStackItemAdded = (event) => {
        store.get()._updateUndoRedoState();
      };

      const handleStackItemPopped = (event) => {
        store.get()._updateUndoRedoState();
      };

      const handleStackItemUpdated = (event) => {
        store.get()._updateUndoRedoState();
      };

      undoManager.on('stack-item-added', handleStackItemAdded);
      undoManager.on('stack-item-popped', handleStackItemPopped);
      undoManager.on('stack-item-updated', handleStackItemUpdated);
      
      // Store cleanup function for the event listeners
      undoManager._storeCleanup = () => {
        undoManager.off('stack-item-added', handleStackItemAdded);
        undoManager.off('stack-item-popped', handleStackItemPopped);
        undoManager.off('stack-item-updated', handleStackItemUpdated);
      };
      
      // Initial state update
      setTimeout(() => store.get()._updateUndoRedoState(), 0);
    }
    
    set({ undoManager });
  },
  
  // Undo/redo operations using Y.js UndoManager
  undo: () => {
    const { undoManager, _updateUndoRedoState } = get();
    if (undoManager) {
      console.log('[CollabEditorStore] Performing undo with Y.js UndoManager');
      try {
        undoManager.undo();
        // State will be updated by event listeners, but do immediate update for responsiveness
        _updateUndoRedoState();
      } catch (error) {
        console.warn('[CollabEditorStore] Undo operation failed:', error);
        _updateUndoRedoState();
      }
    } else {
      console.warn('[CollabEditorStore] UndoManager not available for undo operation');
    }
  },
  
  redo: () => {
    const { undoManager, _updateUndoRedoState } = get();
    if (undoManager) {
      console.log('[CollabEditorStore] Performing redo with Y.js UndoManager');
      try {
        undoManager.redo();
        // State will be updated by event listeners, but do immediate update for responsiveness
        _updateUndoRedoState();
      } catch (error) {
        console.warn('[CollabEditorStore] Redo operation failed:', error);
        _updateUndoRedoState();
      }
    } else {
      console.warn('[CollabEditorStore] UndoManager not available for redo operation');
    }
  },
  
  canUndo: () => {
    const { canUndoState } = get();
    return canUndoState;
  },
  
  canRedo: () => {
    const { canRedoState } = get();
    return canRedoState;
  },
  
  // Text operations using Yjs
  insertText: (index, text) => {
    const { ytext, ydoc } = get();
    if (ytext && ydoc) {
      ydoc.transact(() => {
        ytext.insert(index, text);
      });
    }
  },
  
  deleteText: (index, length) => {
    const { ytext, ydoc } = get();
    if (ytext && ydoc) {
      ydoc.transact(() => {
        ytext.delete(index, length);
      });
    }
  },
  
  replaceText: (index, length, newText) => {
    const { ytext, ydoc } = get();
    if (ytext && ydoc) {
      ydoc.transact(() => {
        ytext.delete(index, length);
        ytext.insert(index, newText);
      });
    }
  },
  
  // Apply initial content to empty document
  applyInitialContent: (htmlContent) => {
    const { ytext, ydoc, editorInstance } = get();
    
    if (!ytext || !ydoc || !htmlContent || ytext.length > 0) {
      return false; // Don't apply if conditions aren't met
    }
    
    console.log('[CollabEditorStore] Applying initial content. Length:', htmlContent.length);
    
    // For TipTap, we can directly insert HTML content
    if (editorInstance && editorInstance.commands) {
      // TipTap editor
      ydoc.transact(() => {
        editorInstance.commands.setContent(htmlContent);
      }, 'initial-content');
    } else {
      // Fallback: Use temporary Quill instance to convert HTML to Delta
      console.log('[CollabEditorStore] Using Quill fallback for initial content');
      import('quill').then(({ default: Quill }) => {
        const tempDiv = document.createElement('div');
        const tempQuill = new Quill(tempDiv);
        tempQuill.clipboard.dangerouslyPasteHTML(0, htmlContent);
        const delta = tempQuill.getContents();
        
        // Apply delta to ytext
        ydoc.transact(() => {
          ytext.applyDelta(delta.ops);
        }, 'initial-content');
      }).catch(console.error);
    }
    
    console.log('[CollabEditorStore] Initial content applied successfully');
    return true;
  },
  
  // Get current document content as HTML
  getContentAsHtml: () => {
    const { editorInstance } = get();
    
    if (editorInstance && editorInstance.getHTML) {
      // TipTap editor
      return editorInstance.getHTML();
    } else if (editorInstance && editorInstance.root) {
      // Quill editor (legacy)
      return editorInstance.root.innerHTML || '';
    }
    
    return '';
  },
  
  // Get current document content as plain text
  getContentAsText: () => {
    const { editorInstance, ytext } = get();
    
    if (editorInstance && editorInstance.getText) {
      // TipTap editor
      return editorInstance.getText();
    } else if (ytext) {
      // Fallback to Y.js text
      return ytext.toString() || '';
    }
    
    return '';
  },
}));

export default useCollabEditorStore;
