import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

const STORAGE_KEY = 'notebook-favourites';
const MAX_FAVOURITES = 3;

/**
 * Client-side favourites for system notebooks — mirrors web's localStorage-only
 * `sidebarFavouritesStore` (curated system notebooks aren't user-owned, so there's
 * no backend). Manual AsyncStorage sync; no `persist` middleware (unused in mobile).
 */
interface FavoritesState {
  favouriteIds: string[];
  loaded: boolean;
  load: () => Promise<void>;
  toggle: (id: string) => void;
  isFavourite: (id: string) => boolean;
}

export const useFavoritesStore = create<FavoritesState>((set, get) => ({
  favouriteIds: [],
  loaded: false,
  load: async () => {
    if (get().loaded) return;
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      set({ favouriteIds: raw ? (JSON.parse(raw) as string[]) : [], loaded: true });
    } catch {
      set({ loaded: true });
    }
  },
  toggle: (id) => {
    const current = get().favouriteIds;
    const next = current.includes(id)
      ? current.filter((x) => x !== id)
      : [id, ...current].slice(0, MAX_FAVOURITES);
    set({ favouriteIds: next });
    void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  },
  isFavourite: (id) => get().favouriteIds.includes(id),
}));
