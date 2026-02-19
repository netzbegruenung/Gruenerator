import { create } from 'zustand';

interface DocumentChatStore {
  /** Current picker selection (before sending a message) */
  documentChatIds: string[];
  /** Persistent per-thread document IDs for conversation continuity */
  threadDocumentChatIds: Map<string, string[]>;

  setDocumentChatIds: (ids: string[]) => void;
  /** Persist current picker IDs to a specific thread */
  bindToThread: (threadId: string) => void;
  /** Get persisted IDs for a thread (empty array if none) */
  getForThread: (threadId: string | null) => string[];
  /** Add a document ID to a thread's persisted list (e.g. from SSE document_indexed) */
  addToThread: (threadId: string, documentId: string) => void;
  /** Remove a specific doc ID from the current picker selection */
  removeDocumentChatId: (id: string) => void;
  clearDocumentChatIds: () => void;
}

export const useDocumentChatStore = create<DocumentChatStore>((set, get) => ({
  documentChatIds: [],
  threadDocumentChatIds: new Map(),

  setDocumentChatIds: (ids) => set({ documentChatIds: ids }),

  bindToThread: (threadId) => {
    const { documentChatIds, threadDocumentChatIds } = get();
    if (documentChatIds.length === 0) return;
    const updated = new Map(threadDocumentChatIds);
    const existing = updated.get(threadId) || [];
    const merged = [...new Set([...existing, ...documentChatIds])];
    updated.set(threadId, merged);
    set({ threadDocumentChatIds: updated });
  },

  getForThread: (threadId) => {
    if (!threadId) return [];
    return get().threadDocumentChatIds.get(threadId) || [];
  },

  addToThread: (threadId, documentId) => {
    const { threadDocumentChatIds } = get();
    const updated = new Map(threadDocumentChatIds);
    const existing = updated.get(threadId) || [];
    if (!existing.includes(documentId)) {
      updated.set(threadId, [...existing, documentId]);
      set({ threadDocumentChatIds: updated });
    }
  },

  removeDocumentChatId: (id) =>
    set((state) => ({
      documentChatIds: state.documentChatIds.filter((did) => did !== id),
    })),

  clearDocumentChatIds: () => set({ documentChatIds: [] }),
}));
