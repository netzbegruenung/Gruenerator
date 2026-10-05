import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export interface HiddenMember {
  userId: string;
  name: string;
  hiddenAt: string;
}

interface HiddenMembersState {
  hidden: HiddenMember[];
}

interface HiddenMembersActions {
  hide: (userId: string, name: string) => void;
  unhide: (userId: string) => void;
  isHidden: (userId: string) => boolean;
}

/** Version 1 is the first shape; anything unreadable collapses to an empty list. */
export function migrateHiddenMembers(persisted: unknown): HiddenMembersState {
  const raw =
    persisted && typeof persisted === 'object' ? (persisted as { hidden?: unknown }).hidden : null;
  if (!Array.isArray(raw)) return { hidden: [] };
  const hidden = raw.filter(
    (m): m is HiddenMember =>
      !!m &&
      typeof m === 'object' &&
      typeof (m as HiddenMember).userId === 'string' &&
      typeof (m as HiddenMember).name === 'string' &&
      typeof (m as HiddenMember).hiddenAt === 'string'
  );
  return { hidden };
}

/** Device-local only: hiding never leaves the phone and never touches membership. */
export const useHiddenMembersStore = create<HiddenMembersState & HiddenMembersActions>()(
  persist(
    (set, get) => ({
      hidden: [],

      hide: (userId, name) => {
        if (get().hidden.some((m) => m.userId === userId)) return;
        set({
          hidden: [...get().hidden, { userId, name, hiddenAt: new Date().toISOString() }],
        });
      },

      unhide: (userId) => set({ hidden: get().hidden.filter((m) => m.userId !== userId) }),

      isHidden: (userId) => get().hidden.some((m) => m.userId === userId),
    }),
    {
      name: 'gruenerator-hidden-members',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ hidden: s.hidden }),
      migrate: (persisted) => migrateHiddenMembers(persisted),
    }
  )
);
