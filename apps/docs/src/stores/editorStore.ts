import { create } from 'zustand';
import type { Editor } from '@tiptap/react';

interface EditorStore {
  editors: Record<string, Editor | null>;
  setEditor: (documentId: string, editor: Editor | null) => void;
  getEditor: (documentId: string) => Editor | null;
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
