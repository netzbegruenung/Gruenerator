import { useCallback } from 'react';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface ChatPinsState {
  pinnedIds: string[];
}

interface ChatPinsActions {
  pin: (id: string) => void;
  unpin: (id: string) => void;
  togglePin: (id: string) => void;
  isPinned: (id: string) => boolean;
}

type ChatPinsStore = ChatPinsState & ChatPinsActions;

const useChatPinsStore = create<ChatPinsStore>()(
  persist(
    (set, get) => ({
      pinnedIds: [],

      pin: (id) => {
        const { pinnedIds } = get();
        if (pinnedIds.includes(id)) return;
        set({ pinnedIds: [...pinnedIds, id] });
      },

      unpin: (id) => {
        set({ pinnedIds: get().pinnedIds.filter((pid) => pid !== id) });
      },

      togglePin: (id) => {
        const { pinnedIds, pin, unpin } = get();
        if (pinnedIds.includes(id)) unpin(id);
        else pin(id);
      },

      isPinned: (id) => get().pinnedIds.includes(id),
    }),
    {
      name: 'chat-pins',
      storage: createJSONStorage(() => localStorage),
    }
  )
);

export function useIsChatPinned(id: string | undefined): boolean {
  return useChatPinsStore(useCallback((s) => (id ? s.pinnedIds.includes(id) : false), [id]));
}

export default useChatPinsStore;
