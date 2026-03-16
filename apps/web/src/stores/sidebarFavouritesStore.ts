import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

const MAX_FAVOURITES = 3;

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
    }
  )
);

export default useSidebarFavouritesStore;
