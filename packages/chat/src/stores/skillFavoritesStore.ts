import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SkillFavoritesState {
  favorites: string[];
}

interface SkillFavoritesActions {
  toggleFavorite: (mention: string) => void;
  isFavorite: (mention: string) => boolean;
}

export const useSkillFavoritesStore = create<SkillFavoritesState & SkillFavoritesActions>()(
  persist(
    (set, get) => ({
      favorites: [],

      toggleFavorite: (mention: string) => {
        const current = get().favorites;
        const lower = mention.toLowerCase();
        if (current.includes(lower)) {
          set({ favorites: current.filter((f) => f !== lower) });
        } else {
          set({ favorites: [...current, lower] });
        }
      },

      isFavorite: (mention: string) => {
        return get().favorites.includes(mention.toLowerCase());
      },
    }),
    {
      name: 'gruenerator-skill-favorites',
    }
  )
);
