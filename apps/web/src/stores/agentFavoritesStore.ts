import { useCallback } from 'react';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface AgentFavoritesState {
  // Skill mentions (unique handles across platform variants)
  mentions: string[];
}

interface AgentFavoritesActions {
  add: (mention: string) => void;
  remove: (mention: string) => void;
  toggle: (mention: string) => void;
  isFavorite: (mention: string) => boolean;
}

type AgentFavoritesStore = AgentFavoritesState & AgentFavoritesActions;

const useAgentFavoritesStore = create<AgentFavoritesStore>()(
  persist(
    (set, get) => ({
      mentions: [],
      add: (mention) => {
        const { mentions } = get();
        if (mentions.includes(mention)) return;
        set({ mentions: [...mentions, mention] });
      },
      remove: (mention) => {
        set({ mentions: get().mentions.filter((m) => m !== mention) });
      },
      toggle: (mention) => {
        const { mentions, add, remove } = get();
        if (mentions.includes(mention)) remove(mention);
        else add(mention);
      },
      isFavorite: (mention) => get().mentions.includes(mention),
    }),
    {
      name: 'sidebar-agent-favorites',
      storage: createJSONStorage(() => localStorage),
    }
  )
);

export function useIsAgentFavorite(mention: string | undefined): boolean {
  return useAgentFavoritesStore(
    useCallback((s) => (mention ? s.mentions.includes(mention) : false), [mention])
  );
}

export default useAgentFavoritesStore;
