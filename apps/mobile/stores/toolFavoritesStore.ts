import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

interface ToolFavoritesState {
  favorites: string[];
}

interface ToolFavoritesActions {
  toggleFavorite: (id: string) => void;
  isFavorite: (id: string) => boolean;
}

export const useToolFavoritesStore = create<ToolFavoritesState & ToolFavoritesActions>()(
  persist(
    (set, get) => ({
      favorites: [],

      toggleFavorite: (id: string) => {
        const current = get().favorites;
        set({
          favorites: current.includes(id) ? current.filter((f) => f !== id) : [...current, id],
        });
      },

      isFavorite: (id: string) => get().favorites.includes(id),
    }),
    {
      name: 'gruenerator-tool-favorites',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
