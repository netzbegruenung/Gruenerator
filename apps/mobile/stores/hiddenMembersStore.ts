import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export interface HiddenMember {
  userId: string;
  name: string;
  hiddenAt: string;
}

interface HiddenMembersState {
  /** Owner user id -> the people that account hid on this device. */
  byUser: Record<string, HiddenMember[]>;
}

interface HiddenMembersActions {
  hide: (ownerId: string, userId: string, name: string) => void;
  unhide: (ownerId: string, userId: string) => void;
}

/** v1 was a flat device-wide list (dev builds only); it cannot be attributed to an owner, so it is dropped. */
export function migrateHiddenMembers(persisted: unknown): HiddenMembersState {
  const raw =
    persisted && typeof persisted === 'object' ? (persisted as { byUser?: unknown }).byUser : null;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { byUser: {} };
  const byUser: Record<string, HiddenMember[]> = {};
  for (const [owner, list] of Object.entries(raw)) {
    if (!Array.isArray(list)) continue;
    byUser[owner] = list.filter(
      (m): m is HiddenMember =>
        !!m &&
        typeof m === 'object' &&
        typeof (m as HiddenMember).userId === 'string' &&
        typeof (m as HiddenMember).name === 'string' &&
        typeof (m as HiddenMember).hiddenAt === 'string'
    );
  }
  return { byUser };
}

/** Device-local only: hiding never leaves the phone and never touches membership. */
export const useHiddenMembersStore = create<HiddenMembersState & HiddenMembersActions>()(
  persist(
    (set, get) => ({
      byUser: {},

      hide: (ownerId, userId, name) => {
        const list = get().byUser[ownerId] ?? [];
        if (list.some((m) => m.userId === userId)) return;
        set({
          byUser: {
            ...get().byUser,
            [ownerId]: [...list, { userId, name, hiddenAt: new Date().toISOString() }],
          },
        });
      },

      unhide: (ownerId, userId) =>
        set({
          byUser: {
            ...get().byUser,
            [ownerId]: (get().byUser[ownerId] ?? []).filter((m) => m.userId !== userId),
          },
        }),
    }),
    {
      name: 'gruenerator-hidden-members',
      version: 2,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ byUser: s.byUser }),
      migrate: (persisted) => migrateHiddenMembers(persisted),
    }
  )
);
