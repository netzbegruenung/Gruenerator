import { create } from 'zustand';

interface NotificationStoreState {
  unreadCount: number;
  sseConnected: boolean;
  setUnreadCount: (count: number) => void;
  incrementUnreadCount: () => void;
  decrementUnreadCount: () => void;
  setSseConnected: (connected: boolean) => void;
}

export const useNotificationStore = create<NotificationStoreState>((set) => ({
  unreadCount: 0,
  sseConnected: false,
  setUnreadCount: (count) => set({ unreadCount: count }),
  incrementUnreadCount: () => set((state) => ({ unreadCount: state.unreadCount + 1 })),
  decrementUnreadCount: () => set((state) => ({ unreadCount: Math.max(0, state.unreadCount - 1) })),
  setSseConnected: (connected) => set({ sseConnected: connected }),
}));
