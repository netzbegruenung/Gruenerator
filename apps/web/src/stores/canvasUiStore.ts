import { type SidebarTabId } from '@gruenerator/canvas-editor';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

/** Canvases whose open chat is remembered; older ones fall off the front. */
const MAX_REMEMBERED = 50;

interface CanvasUiState {
  /** Canvas ids whose chat tab was open when last seen, most recent last. */
  chatOpenCanvasIds: string[];
}

interface CanvasUiActions {
  /** Records the editor's open sidebar tab; only the chat is remembered. */
  setActiveTab: (canvasId: string, tab: SidebarTabId | null) => void;
  /** The tab to open the editor with: the chat if it was open last time. */
  initialTabFor: (canvasId: string) => SidebarTabId | null;
}

type CanvasUiStore = CanvasUiState & CanvasUiActions;

const useCanvasUiStore = create<CanvasUiStore>()(
  persist(
    (set, get) => ({
      chatOpenCanvasIds: [],
      setActiveTab: (canvasId, tab) => {
        const ids = get().chatOpenCanvasIds;
        const has = ids.includes(canvasId);
        // Called on every tab change — bail when nothing moves, or persist
        // would rewrite localStorage each time.
        if (tab === 'chat') {
          if (ids.at(-1) === canvasId) return;
          const next = [...ids.filter((id) => id !== canvasId), canvasId];
          set({ chatOpenCanvasIds: next.slice(-MAX_REMEMBERED) });
          return;
        }
        if (has) set({ chatOpenCanvasIds: ids.filter((id) => id !== canvasId) });
      },
      initialTabFor: (canvasId) => (get().chatOpenCanvasIds.includes(canvasId) ? 'chat' : null),
    }),
    {
      // F0 since its first deploy: renaming the key forgets every open chat.
      name: 'gruenerator-canvas-ui',
      storage: createJSONStorage(() => localStorage),
      version: 1,
      partialize: (state) => ({ chatOpenCanvasIds: state.chatOpenCanvasIds }),
      migrate: (persistedState) => {
        const ids = (persistedState as Partial<CanvasUiState> | null)?.chatOpenCanvasIds;
        return {
          chatOpenCanvasIds: Array.isArray(ids)
            ? ids.filter((id): id is string => typeof id === 'string')
            : [],
        } as unknown as CanvasUiStore;
      },
    }
  )
);

export default useCanvasUiStore;
