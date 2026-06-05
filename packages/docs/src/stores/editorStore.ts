import { create } from 'zustand';
import type { BlockNoteEditor } from '@blocknote/core';
import type { Doc } from 'yjs';
import type { HocuspocusProvider } from '@hocuspocus/provider';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EditorInstance = BlockNoteEditor<any, any, any>;

/**
 * The live collaboration handles for a mounted document editor. Stored
 * alongside the editor so non-React call sites (e.g. `acceptDocumentAI`) can
 * reach the *current* Y.Doc / provider the websocket is actually syncing — not
 * a stale instance BlockNote's AI fork may have captured. Used to verify an
 * accepted AI change lands on the live doc and is broadcast to collaborators.
 */
interface DocContext {
  ydoc: Doc | null;
  provider: HocuspocusProvider | null;
}

interface EditorStore {
  editors: Record<string, EditorInstance | null>;
  docContexts: Record<string, DocContext>;
  setEditor: (documentId: string, editor: EditorInstance | null) => void;
  getEditor: (documentId: string) => EditorInstance | null;
  setDocContext: (documentId: string, context: DocContext) => void;
  getDocContext: (documentId: string) => DocContext | null;
  removeEditor: (documentId: string) => void;
}

export const useEditorStore = create<EditorStore>((set, get) => ({
  editors: {},
  docContexts: {},

  setEditor: (documentId, editor) =>
    set((state) => ({
      editors: {
        ...state.editors,
        [documentId]: editor,
      },
    })),

  getEditor: (documentId) => {
    const state = get();
    return state.editors[documentId] || null;
  },

  setDocContext: (documentId, context) =>
    set((state) => ({
      docContexts: {
        ...state.docContexts,
        [documentId]: context,
      },
    })),

  getDocContext: (documentId) => {
    const state = get();
    return state.docContexts[documentId] || null;
  },

  removeEditor: (documentId) =>
    set((state) => {
      const { [documentId]: removed, ...rest } = state.editors;
      const { [documentId]: removedCtx, ...restCtx } = state.docContexts;
      return { editors: rest, docContexts: restCtx };
    }),
}));
