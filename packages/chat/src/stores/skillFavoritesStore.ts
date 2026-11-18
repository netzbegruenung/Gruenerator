import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SkillFavoritesState {
  favorites: string[];
}

interface SkillFavoritesActions {
  /** Nur noch für die Übersicht (`useMarketCards`) und Mobile; Chat und Rezept-Detail nutzen die Bibliothek. */
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
      // Die Sterne leben seit der Bibliothek (`user_library_items`) am Konto.
      // Dieser Speicher (F0-Schlüssel) wird nur noch gelesen: `useStarImport`
      // holt die alten Sterne einmal hinüber. `migrate` lässt die Daten stehen.
      version: 1,
      migrate: (persisted) => persisted as SkillFavoritesState,
    }
  )
);
