import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'ready'
  | 'installing'
  | 'error'
  | 'up-to-date';

export interface UpdateInfo {
  version: string;
  currentVersion: string;
  date?: string;
  body?: string;
}

interface UpdateState {
  status: UpdateStatus;
  updateInfo: UpdateInfo | null;
  downloadProgress: number;
  error: string | null;
  lastCheckTime: number | null;
  isUpdateDismissed: boolean;
}

interface UpdateActions {
  setStatus: (status: UpdateStatus) => void;
  setUpdateInfo: (info: UpdateInfo | null) => void;
  setDownloadProgress: (progress: number) => void;
  setError: (error: string | null) => void;
  setLastCheckTime: (time: number) => void;
  dismissUpdate: () => void;
  reset: () => void;
}

const initialState: UpdateState = {
  status: 'idle',
  updateInfo: null,
  downloadProgress: 0,
  error: null,
  lastCheckTime: null,
  isUpdateDismissed: false,
};

export const useDesktopUpdateStore = create<UpdateState & UpdateActions>()(
  subscribeWithSelector((set) => ({
    ...initialState,

    setStatus: (status) => set({ status, error: status === 'error' ? undefined : null }),

    setUpdateInfo: (updateInfo) => set({ updateInfo }),

    setDownloadProgress: (downloadProgress) => set({ downloadProgress }),

    setError: (error) => set({ error, status: error ? 'error' : 'idle' }),

    setLastCheckTime: (lastCheckTime) => set({ lastCheckTime }),

    dismissUpdate: () => set({ isUpdateDismissed: true }),

    reset: () => set(initialState),
  }))
);

export const useUpdateStatus = () => useDesktopUpdateStore((state) => state.status);
export const useUpdateInfo = () => useDesktopUpdateStore((state) => state.updateInfo);
export const useDownloadProgress = () => useDesktopUpdateStore((state) => state.downloadProgress);
export const useIsUpdateReady = () => useDesktopUpdateStore((state) => state.status === 'ready');
export const useIsUpdateAvailable = () =>
  useDesktopUpdateStore((state) => state.status === 'available');
