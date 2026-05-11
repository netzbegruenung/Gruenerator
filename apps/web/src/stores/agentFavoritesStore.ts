import { useCallback } from 'react';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface AgentFavoritesState {
  // Agent identifiers (e.g. 'gruenerator-oeffentlichkeitsarbeit',
  // 'gruenerator-oeffentlichkeitsarbeit-berlin'). Each entry corresponds
  // to one SYSTEM_AGENTS entry — the modal/pinned sidebar iterates agents
  // directly, no longer skill-mentions.
  favoriteIdentifiers: string[];
}

interface AgentFavoritesActions {
  add: (identifier: string) => void;
  remove: (identifier: string) => void;
  toggle: (identifier: string) => void;
  isFavorite: (identifier: string) => boolean;
}

type AgentFavoritesStore = AgentFavoritesState & AgentFavoritesActions;

/**
 * v0 → v1 mapping: existing favorites were keyed by `skill.mention`
 * (e.g. 'presse', 'instagram'). We now key by `agent.identifier`. This
 * table mirrors `packages/shared/src/agents/skills.ts` exactly — every
 * skill mention there maps to its target agent identifier.
 *
 * Hardcoded (not imported from SKILLS) to keep this persistence-layer
 * file free of agent-package coupling and to avoid circular-import risk.
 * If SKILLS gains a new mention, add the corresponding row here.
 */
const SKILL_MENTION_TO_AGENT_ID: Record<string, string> = {
  antrag: 'gruenerator-antrag',
  bürgerservice: 'gruenerator-buergerservice',
  buergerservice: 'gruenerator-buergerservice',
  presse: 'gruenerator-oeffentlichkeitsarbeit',
  instagram: 'gruenerator-oeffentlichkeitsarbeit',
  facebook: 'gruenerator-oeffentlichkeitsarbeit',
  twitter: 'gruenerator-oeffentlichkeitsarbeit',
  linkedin: 'gruenerator-oeffentlichkeitsarbeit',
  reel: 'gruenerator-oeffentlichkeitsarbeit',
  aktion: 'gruenerator-oeffentlichkeitsarbeit',
  rede: 'gruenerator-rede-schreiber',
  wahlprogramm: 'gruenerator-wahlprogramm',
  'leichte-sprache': 'gruenerator-leichte-sprache',
};

interface LegacyV0State {
  mentions?: unknown;
}

function migrateV0ToV1(persistedState: unknown): AgentFavoritesState {
  const legacy = persistedState as LegacyV0State | null | undefined;
  const oldMentions = Array.isArray(legacy?.mentions) ? legacy.mentions : [];
  // Set dedupes when multiple legacy mentions collapse to the same agent
  // identifier (e.g. presse + instagram + facebook → one PR agent entry).
  // Unknown mentions are dropped silently — mention slugs and identifier
  // strings are different namespaces, so preserving them as-is would leave
  // dead favorites that match no agent.
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
        if (version === 0 || version === undefined) {
          return {
            ...(migrateV0ToV1(persistedState) satisfies AgentFavoritesState),
          } as AgentFavoritesStore;
        }
        return persistedState as AgentFavoritesStore;
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
