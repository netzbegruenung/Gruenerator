import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Starred recipes ("Rezepte"), the set that decides what the composer's "+"
 * offers without a search (see `lib/plusMenu.ts`).
 *
 * The list lives on the server (user-default `profile.skillFavorites`) and is
 * mirrored to localStorage so the composer renders instantly on reload. The
 * store itself has no API client — the host app injects `onPersist` and calls
 * `hydrate` once the server value arrives, the same seam `setCustomAgents` and
 * `setMentionLocale` use in `lib/mentionables.ts`.
 */
interface SkillFavoritesState {
  favorites: string[];
  /** True once server values were merged in; guards the first write-back. */
  isHydrated: boolean;
}

interface SkillFavoritesActions {
  toggleFavorite: (mention: string) => void;
  isFavorite: (mention: string) => boolean;
  /**
   * Merge the server list with whatever this device already had.
   *
   * `serverFavorites` is `null` when the key has never been written — the one
   * moment a caller may pass `seed` (e.g. the recipes of a Landesverband the
   * user's roles point at). On every later call the stored list is
   * authoritative, so an unstarred recipe stays unstarred.
   */
  hydrate: (serverFavorites: readonly string[] | null, seed?: readonly string[]) => void;
  /** Add without removing — used to pre-star a Landesverband's recipes. */
  addFavorites: (mentions: readonly string[]) => void;
}

/**
 * Where a changed list gets written. Set once by the host app; a no-op keeps the
 * store usable on its own (tests, and mobile before it wires persistence up).
 */
let onPersist: (favorites: string[]) => void = () => {};

export function setSkillFavoritesPersister(persister: (favorites: string[]) => void): void {
  onPersist = persister;
}

export const useSkillFavoritesStore = create<SkillFavoritesState & SkillFavoritesActions>()(
  persist(
    (set, get) => ({
      favorites: [],
      isHydrated: false,

      toggleFavorite: (mention: string) => {
        const current = get().favorites;
        const lower = mention.toLowerCase();
        const next = current.includes(lower)
          ? current.filter((f) => f !== lower)
          : [...current, lower];
        set({ favorites: next });
        onPersist(next);
      },

      isFavorite: (mention: string) => {
        return get().favorites.includes(mention.toLowerCase());
      },

      hydrate: (serverFavorites: readonly string[] | null, seed: readonly string[] = []) => {
        // Union, not replace: a device may hold stars set before this list moved
        // to the server, and dropping them would look like data loss. The union
        // is written back once so both sides agree from then on.
        const server = (serverFavorites ?? []).map((f) => f.toLowerCase());
        const merged = [
          ...new Set([...server, ...(serverFavorites === null ? seed : []), ...get().favorites]),
        ];
        const changed =
          serverFavorites === null
            ? merged.length > 0
            : merged.length !== server.length || merged.some((f) => !server.includes(f));
        set({ favorites: merged, isHydrated: true });
        if (changed) onPersist(merged);
      },

      addFavorites: (mentions: readonly string[]) => {
        const current = get().favorites;
        const additions = mentions.map((m) => m.toLowerCase()).filter((m) => !current.includes(m));
        if (additions.length === 0) return;
        const next = [...current, ...additions];
        set({ favorites: next });
        onPersist(next);
      },
    }),
    {
      name: 'gruenerator-skill-favorites',
      version: 1,
      // v0 stored the bare `favorites` array. Nothing to reshape — but a
      // rehydrated device must still merge the server list before it counts as
      // authoritative, so `isHydrated` always starts false.
      migrate: (persisted) => {
        const state = persisted as Partial<SkillFavoritesState> | undefined;
        return { favorites: state?.favorites ?? [], isHydrated: false };
      },
      partialize: (state) => ({ favorites: state.favorites }) as SkillFavoritesState,
    }
  )
);
