import { create } from 'zustand';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import Quill from 'quill';

// Collaborative Editor Store using Zustand
const useCollabEditorStore = create((set, get) => ({
  // Core state
  documentId: null,
  connectionStatus: 'disconnected', // 'disconnected', 'connecting', 'connected', 'error'
  activeUsers: [],
  
  // Yjs objects (stored as refs to avoid reactivity issues)
  ydoc: null,
  ytext: null,
  yChatHistory: null,
  provider: null,
  awareness: null,
  
  // Quill instance
  quillInstance: null,
  
  // Y.js UndoManager instance
  undoManager: null,
  
  // Track undo/redo state (since Y.js doesn't expose stack lengths directly)
  canUndoState: false,
  canRedoState: false,
  
  // Initialization flag
  isInitialized: false,
  
  // Actions
  initializeDocument: (documentId) => {
    const state = get();
    
    // Don't reinitialize if already initialized with the same document
    if (state.isInitialized && state.documentId === documentId) {
      console.log('[CollabEditorStore] Document already initialized:', documentId);
      return;
    }
    
    // Clean up existing document if switching documents
    if (state.isInitialized) {
      state.cleanup();
    }
    
    console.log('[CollabEditorStore] Initializing document:', documentId);
    
    // Create new Yjs document
    const ydoc = new Y.Doc();
    const ytext = ydoc.getText('quill');
    const yChatHistory = ydoc.getArray('chatHistory');
    
    // Get WebSocket URL from environment or use defaults based on environment
    const websocketUrl = import.meta.env.VITE_YJS_WEBSOCKET_URL || 
      (import.meta.env.VITE_APP_ENV === 'development' 
        ? 'ws://localhost:1234' 
        : 'wss://gruenerator.de/yjs');
    
    if (!websocketUrl) {
      console.error('[CollabEditorStore] Failed to determine Y.js WebSocket URL');
      set({ connectionStatus: 'error' });
      return;
    }
    
    console.log('[CollabEditorStore] Using Y.js WebSocket URL:', websocketUrl);
    
    // Create WebSocket provider
    const provider = new WebsocketProvider(websocketUrl, documentId, ydoc);
    const awareness = provider.awareness;
    
    // Set up event listeners
    provider.on('status', ({ status }) => {
      console.log('[CollabEditorStore] WebSocket status:', status);
      set({ connectionStatus: status });
    });
    
    provider.on('sync', (isSynced) => {
      console.log(`[CollabEditorStore] Sync event. isSynced: ${isSynced}, ytext.length: ${ytext.length}`);
    });
    
    // Track active users
    awareness.on('change', () => {
      const activeUserIds = Array.from(awareness.getStates().keys());
      set({ activeUsers: activeUserIds });
    });
    
    // Update state
    set({
      documentId,
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
      quillInstance: null,
      undoManager: null,
      canUndoState: false,
      canRedoState: false,
      isInitialized: false,
    });
  },
  
  setQuillInstance: (instance) => {
    console.log('[CollabEditorStore] Setting Quill instance:', instance);
    set({ quillInstance: instance });
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
    const { ytext, ydoc } = get();
    
    if (!ytext || !ydoc || !htmlContent || ytext.length > 0) {
      return false; // Don't apply if conditions aren't met
    }
    
    console.log('[CollabEditorStore] Applying initial content. Length:', htmlContent.length);
    
    // Use a temporary Quill instance to convert HTML to Delta
    const tempDiv = document.createElement('div');
    const tempQuill = new Quill(tempDiv);
    tempQuill.clipboard.dangerouslyPasteHTML(0, htmlContent);
    const delta = tempQuill.getContents();
    
    // Apply delta to ytext
    ydoc.transact(() => {
      ytext.applyDelta(delta.ops);
    }, 'initial-content');
    
    console.log('[CollabEditorStore] Initial content applied successfully');
    return true;
  },
  
  // Get current document content as HTML
  getContentAsHtml: () => {
    const { quillInstance } = get();
    return quillInstance?.root?.innerHTML || '';
  },
  
  // Get current document content as plain text
  getContentAsText: () => {
    const { ytext } = get();
    return ytext?.toString() || '';
  },
}));

export default useCollabEditorStore;