import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export interface WolkeFavouriteFolder {
  shareLinkId: string;
  folderPath: string;
  folderName: string;
}

export type BackupInterval = 'hourly' | 'daily';

export interface WolkeAutoBackupConfig {
  enabled: boolean;
  shareLinkId: string | null;
  folderPath: string | null;
  folderName: string | null;
  interval: BackupInterval;
}

interface WolkePreferencesState {
  favourites: WolkeFavouriteFolder[];
  autoBackup: WolkeAutoBackupConfig;
}

interface WolkePreferencesActions {
  addFavourite: (folder: WolkeFavouriteFolder) => void;
  removeFavourite: (shareLinkId: string, folderPath: string) => void;
  toggleFavourite: (folder: WolkeFavouriteFolder) => void;
  isFavourite: (shareLinkId: string, folderPath: string) => boolean;
  getFavouritesForShareLink: (shareLinkId: string) => WolkeFavouriteFolder[];
  setAutoBackupEnabled: (enabled: boolean) => void;
  setAutoBackupTarget: (shareLinkId: string, folderPath: string, folderName: string) => void;
  clearAutoBackupTarget: () => void;
  setAutoBackupInterval: (interval: BackupInterval) => void;
}

type WolkePreferencesStore = WolkePreferencesState & WolkePreferencesActions;

const DEFAULT_AUTO_BACKUP: WolkeAutoBackupConfig = {
  enabled: false,
  shareLinkId: null,
  folderPath: null,
  folderName: null,
  interval: 'daily',
};

const useWolkePreferencesStore = create<WolkePreferencesStore>()(
  persist(
    (set, get) => ({
      favourites: [],
      autoBackup: DEFAULT_AUTO_BACKUP,

      addFavourite: (folder) => {
        const { favourites } = get();
        const exists = favourites.some(
          (f) => f.shareLinkId === folder.shareLinkId && f.folderPath === folder.folderPath
        );
        if (exists) return;
        set({ favourites: [...favourites, folder] });
      },

      removeFavourite: (shareLinkId, folderPath) => {
        const state = get();
        const newFavourites = state.favourites.filter(
          (f) => !(f.shareLinkId === shareLinkId && f.folderPath === folderPath)
        );
        const updates: Partial<WolkePreferencesState> = { favourites: newFavourites };
        if (
          state.autoBackup.shareLinkId === shareLinkId &&
          state.autoBackup.folderPath === folderPath
        ) {
          updates.autoBackup = {
            ...state.autoBackup,
            shareLinkId: null,
            folderPath: null,
            folderName: null,
          };
        }
        set(updates);
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
        get().favourites.some(
          (f) => f.shareLinkId === shareLinkId && f.folderPath === folderPath
        ),

      getFavouritesForShareLink: (shareLinkId) =>
        get().favourites.filter((f) => f.shareLinkId === shareLinkId),

      setAutoBackupEnabled: (enabled) => {
        set({ autoBackup: { ...get().autoBackup, enabled } });
      },

      setAutoBackupTarget: (shareLinkId, folderPath, folderName) => {
        set({
          autoBackup: { ...get().autoBackup, shareLinkId, folderPath, folderName },
        });
      },

      clearAutoBackupTarget: () => {
        set({
          autoBackup: {
            ...get().autoBackup,
            shareLinkId: null,
            folderPath: null,
            folderName: null,
          },
        });
      },

      setAutoBackupInterval: (interval) => {
        set({ autoBackup: { ...get().autoBackup, interval } });
      },
    }),
    {
      name: 'wolke-preferences',
      storage: createJSONStorage(() => localStorage),
    }
  )
);

export default useWolkePreferencesStore;
