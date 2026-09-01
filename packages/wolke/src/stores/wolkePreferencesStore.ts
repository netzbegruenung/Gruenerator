import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export interface WolkeFavouriteFolder {
  shareLinkId: string;
  folderPath: string;
  folderName: string;
}

interface WolkePreferencesState {
  favourites: WolkeFavouriteFolder[];
}

interface WolkePreferencesActions {
  addFavourite: (folder: WolkeFavouriteFolder) => void;
  removeFavourite: (shareLinkId: string, folderPath: string) => void;
  toggleFavourite: (folder: WolkeFavouriteFolder) => void;
  isFavourite: (shareLinkId: string, folderPath: string) => boolean;
  getFavouritesForShareLink: (shareLinkId: string) => WolkeFavouriteFolder[];
}

type WolkePreferencesStore = WolkePreferencesState & WolkePreferencesActions;

const useWolkePreferencesStore = create<WolkePreferencesStore>()(
  persist(
    (set, get) => ({
      favourites: [],

      addFavourite: (folder) => {
        const { favourites } = get();
        const exists = favourites.some(
          (f) => f.shareLinkId === folder.shareLinkId && f.folderPath === folder.folderPath
        );
        if (exists) return;
        set({ favourites: [...favourites, folder] });
      },

      removeFavourite: (shareLinkId, folderPath) => {
        set({
          favourites: get().favourites.filter(
            (f) => !(f.shareLinkId === shareLinkId && f.folderPath === folderPath)
          ),
        });
      },

      toggleFavourite: (folder) => {
        const { isFavourite, addFavourite, removeFavourite } = get();
        if (isFavourite(folder.shareLinkId, folder.folderPath)) {
          removeFavourite(folder.shareLinkId, folder.folderPath);
        } else {
          addFavourite(folder);
        }
      },

      isFavourite: (shareLinkId, folderPath) =>
        get().favourites.some((f) => f.shareLinkId === shareLinkId && f.folderPath === folderPath),

      getFavouritesForShareLink: (shareLinkId) =>
        get().favourites.filter((f) => f.shareLinkId === shareLinkId),
    }),
    {
      name: 'wolke-preferences',
      storage: createJSONStorage(() => localStorage),
      // v2 verwirft die toten autoBackup/transferFolder-Keys (Wolke ist nur
      // noch lesend; Auto-Backup und Transfer sind entfernt).
      version: 2,
      migrate: (persisted) => {
        const state = persisted as Partial<WolkePreferencesState> & Record<string, unknown>;
        return { favourites: state.favourites ?? [] };
      },
    }
  )
);

export default useWolkePreferencesStore;
