import { SKILLS } from '@gruenerator/shared/agents';
import { useCallback } from 'react';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface AgentFavoritesState {
  // Keys are SYSTEM_AGENTS identifiers.
  favoriteIdentifiers: string[];
}

interface AgentFavoritesActions {
  add: (identifier: string) => void;
  remove: (identifier: string) => void;
  toggle: (identifier: string) => void;
  isFavorite: (identifier: string) => boolean;
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
  return { favoriteIdentifiers: [...identifiers] };
}

const useAgentFavoritesStore = create<AgentFavoritesStore>()(
  persist(
    (set, get) => ({
      favoriteIdentifiers: [],
      add: (identifier) => {
        const { favoriteIdentifiers } = get();
        if (favoriteIdentifiers.includes(identifier)) return;
        set({ favoriteIdentifiers: [...favoriteIdentifiers, identifier] });
      },
      remove: (identifier) => {
        set({
          favoriteIdentifiers: get().favoriteIdentifiers.filter((id) => id !== identifier),
        });
      },
      toggle: (identifier) => {
        const { favoriteIdentifiers, add, remove } = get();
        if (favoriteIdentifiers.includes(identifier)) remove(identifier);
        else add(identifier);
      },
      isFavorite: (identifier) => get().favoriteIdentifiers.includes(identifier),
    }),
    {
      name: 'sidebar-agent-favorites',
      storage: createJSONStorage(() => localStorage),
      version: 1,
      migrate: (persistedState, version) => {
        if (version >= 1) return persistedState as AgentFavoritesStore;
        return migrateV0ToV1(persistedState) as unknown as AgentFavoritesStore;
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
