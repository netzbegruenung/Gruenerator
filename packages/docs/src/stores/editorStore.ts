import { create } from 'zustand';
import type { BlockNoteEditor } from '@blocknote/core';

type EditorInstance = BlockNoteEditor | any;

interface EditorStore {
  editors: Record<string, EditorInstance | null>;
  setEditor: (documentId: string, editor: EditorInstance | null) => void;
  getEditor: (documentId: string) => EditorInstance | null;
  removeEditor: (documentId: string) => void;
}

export const useEditorStore = create<EditorStore>((set, get) => ({
  editors: {},

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

  removeEditor: (documentId) =>
    set((state) => {
      const { [documentId]: removed, ...rest } = state.editors;
      return { editors: rest };
    }),
}));
