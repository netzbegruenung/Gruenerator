import { SKILLS } from '@gruenerator/shared/agents';
import { useCallback } from 'react';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface AgentFavoritesState {
  // Agent identifiers — system agents and user-created ones alike.
  favoriteIdentifiers: string[];
  // Title taken at star time, keyed by identifier. The sidebar resolves system
  // agents from the static registry and the user's own from useUserAgents();
  // an agent someone else built and shared through a project is in neither, so
  // without a snapshot it silently dropped out of the sidebar while the star
  // stayed lit. Fetching those instead would hang a per-group round-trip on
  // every page the sidebar mounts on. Only a fallback — live titles win.
  favoriteTitles: Record<string, string>;
}

interface AgentFavoritesActions {
  add: (identifier: string, title?: string) => void;
  remove: (identifier: string) => void;
  toggle: (identifier: string, title?: string) => void;
  isFavorite: (identifier: string) => boolean;
  /** Refresh snapshots for favourites the caller can resolve live. */
  recordTitles: (titles: Record<string, string>) => void;
}

type AgentFavoritesStore = AgentFavoritesState & AgentFavoritesActions;

// Derived from SKILLS so adding a new mention there keeps the migration map
// in sync automatically. Used only at v0→v1 store rehydration.
const SKILL_MENTION_TO_AGENT_ID: Record<string, string> = Object.fromEntries(
  SKILLS.map((skill) => [skill.mention, skill.identifier])
);

interface LegacyV0State {
  mentions?: unknown;
}

function migrateV0ToV1(persistedState: unknown): AgentFavoritesState {
  const legacy = persistedState as LegacyV0State | null | undefined;
  const oldMentions = Array.isArray(legacy?.mentions) ? legacy.mentions : [];
  // Dedupes when legacy mentions collapse to one agent (presse + instagram
  // + facebook → one PR-agent entry). Unknown mentions are dropped — slug
  // and identifier namespaces don't overlap, so passing through unknowns
  // would leave dead favorites that match no agent.
  const identifiers = new Set<string>();
  for (const m of oldMentions) {
    if (typeof m !== 'string') continue;
    const id = SKILL_MENTION_TO_AGENT_ID[m];
    if (id) identifiers.add(id);
  }
  return { favoriteIdentifiers: [...identifiers], favoriteTitles: {} };
}

const useAgentFavoritesStore = create<AgentFavoritesStore>()(
  persist(
    (set, get) => ({
      favoriteIdentifiers: [],
      favoriteTitles: {},
      add: (identifier, title) => {
        const { favoriteIdentifiers, favoriteTitles } = get();
        const titles = title ? { ...favoriteTitles, [identifier]: title } : favoriteTitles;
        if (favoriteIdentifiers.includes(identifier)) {
          set({ favoriteTitles: titles });
          return;
        }
        set({ favoriteIdentifiers: [...favoriteIdentifiers, identifier], favoriteTitles: titles });
      },
      remove: (identifier) => {
        const { favoriteIdentifiers, favoriteTitles } = get();
        const titles = { ...favoriteTitles };
        delete titles[identifier];
        set({
          favoriteIdentifiers: favoriteIdentifiers.filter((id) => id !== identifier),
          favoriteTitles: titles,
        });
      },
      toggle: (identifier, title) => {
        const { favoriteIdentifiers, add, remove } = get();
        if (favoriteIdentifiers.includes(identifier)) remove(identifier);
        else add(identifier, title);
      },
      isFavorite: (identifier) => get().favoriteIdentifiers.includes(identifier),
      recordTitles: (titles) => {
        const { favoriteIdentifiers, favoriteTitles } = get();
        // Written from a render effect — bail unless something actually moved,
        // or persist would rewrite localStorage on every Agentura render.
        const next: Record<string, string> = { ...favoriteTitles };
        let changed = false;
        for (const identifier of favoriteIdentifiers) {
          const title = titles[identifier];
          if (!title || next[identifier] === title) continue;
          next[identifier] = title;
          changed = true;
        }
        if (changed) set({ favoriteTitles: next });
      },
    }),
    {
      name: 'sidebar-agent-favorites',
      storage: createJSONStorage(() => localStorage),
      version: 2,
      // v1 → v2 adds favoriteTitles. Favourites starred before it carry no
      // snapshot and stay sidebar-invisible until the Agentura backfills one.
      migrate: (persistedState, version) => {
        const state: Partial<AgentFavoritesState> =
          version >= 1
            ? (persistedState as Partial<AgentFavoritesState>)
            : migrateV0ToV1(persistedState);
        return {
          favoriteIdentifiers: state.favoriteIdentifiers ?? [],
          favoriteTitles: state.favoriteTitles ?? {},
        } as unknown as AgentFavoritesStore;
      },
    }
  )
);

export function useIsAgentFavorite(identifier: string | undefined): boolean {
  return useAgentFavoritesStore(
    useCallback(
      (s) => (identifier ? s.favoriteIdentifiers.includes(identifier) : false),
      [identifier]
    )
  );
}

export default useAgentFavoritesStore;
