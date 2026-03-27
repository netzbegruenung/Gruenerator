import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ToolbarMode = 'floating' | 'fixed';

interface EditorPreferencesState {
  toolbarMode: ToolbarMode;
  setToolbarMode: (mode: ToolbarMode) => void;
}

export const useEditorPreferencesStore = create<EditorPreferencesState>()(
  persist(
    (set) => ({
      toolbarMode: 'floating',
      setToolbarMode: (mode) => set({ toolbarMode: mode }),
    }),
    { name: 'docs-editor-preferences' }
  )
);
