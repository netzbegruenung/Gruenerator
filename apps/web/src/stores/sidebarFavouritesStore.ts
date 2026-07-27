import { useCallback } from 'react';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

import { LEGACY_TOOL_ID_ALIASES } from '../config/toolRegistry';

const MAX_FAVOURITES = 6;

// Pinned ids survive tool renames in localStorage: map them onto the current
// ids on rehydrate so the star state and favourites-first ordering keep
// matching the renamed tiles. The alias map lives in the registry.
const canonicalizeIds = (ids: string[]): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const id of ids) {
    const canonical = LEGACY_TOOL_ID_ALIASES[id] ?? id;
    if (!seen.has(canonical)) {
      seen.add(canonical);
      result.push(canonical);
    }
  }
  return result;
};

interface SidebarFavouritesState {
  favouriteIds: string[];
}

interface SidebarFavouritesActions {
  addFavourite: (id: string) => void;
  removeFavourite: (id: string) => void;
  toggleFavourite: (id: string) => void;
  isFavourite: (id: string) => boolean;
  isFull: () => boolean;
}

type SidebarFavouritesStore = SidebarFavouritesState & SidebarFavouritesActions;

const useSidebarFavouritesStore = create<SidebarFavouritesStore>()(
  persist(
    (set, get) => ({
      favouriteIds: [],

      addFavourite: (id: string) => {
        const { favouriteIds } = get();
        if (favouriteIds.length >= MAX_FAVOURITES || favouriteIds.includes(id)) return;
        set({ favouriteIds: [...favouriteIds, id] });
      },

      removeFavourite: (id: string) => {
        set({ favouriteIds: get().favouriteIds.filter((fid) => fid !== id) });
      },

      toggleFavourite: (id: string) => {
        const { favouriteIds, addFavourite, removeFavourite } = get();
        if (favouriteIds.includes(id)) {
          removeFavourite(id);
        } else {
          addFavourite(id);
        }
      },

      isFavourite: (id: string) => get().favouriteIds.includes(id),

      isFull: () => get().favouriteIds.length >= MAX_FAVOURITES,
    }),
    {
      name: 'sidebar-favourites',
      storage: createJSONStorage(() => localStorage),
      version: 1,
      migrate: (persisted) => {
        const state = persisted as SidebarFavouritesState;
        return { ...state, favouriteIds: canonicalizeIds(state.favouriteIds ?? []) };
      },
    }
  )
);

/**
 * Hook for a single item's favourite status.
 * Only re-renders when THIS item's status changes (not when other items change).
 */
export function useIsFavourite(id: string): boolean {
  return useSidebarFavouritesStore(useCallback((s) => s.favouriteIds.includes(id), [id]));
}

/**
 * Hook for whether the favourites list is full.
 * Only re-renders when the count crosses the threshold.
 */
export function useIsFavouritesFull(): boolean {
  return useSidebarFavouritesStore((s) => s.favouriteIds.length >= MAX_FAVOURITES);
}

export default useSidebarFavouritesStore;
