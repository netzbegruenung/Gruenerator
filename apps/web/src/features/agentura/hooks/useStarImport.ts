import { useSkillFavoritesStore } from '@gruenerator/chat';
import { useEffect, useRef } from 'react';

import { type AgentEntry, type RecipeEntry } from '../lib/marketItems';
import { starredLibraryRefs } from '../lib/starImport';

import { type useUserLibrary } from './useUserLibrary';

import useAgentFavoritesStore from '@/stores/agentFavoritesStore';

export const STAR_IMPORT_DONE_KEY = 'grueneratoren-stars-imported';

function readDone(): boolean {
  try {
    return localStorage.getItem(STAR_IMPORT_DONE_KEY) === '1';
  } catch {
    // Ohne Speicher lässt sich „schon erledigt" nicht merken; das Hinzufügen
    // ist idempotent, ein Wiederholen kostet nur Anfragen.
    return false;
  }
}

function markDone() {
  try {
    localStorage.setItem(STAR_IMPORT_DONE_KEY, '1');
  } catch {
    // swallow-ok: siehe readDone — beim nächsten Besuch läuft die Übernahme erneut, ohne Schaden
  }
}

/**
 * Holt die Sterne aus der Zeit vor `/grueneratoren` einmal auf die Übersicht
 * (siehe `starredLibraryRefs`). Läuft erst, wenn Liste und Shop vollständig
 * geladen sind: ein Stern, der gegen einen halb geladenen Shop nicht auflöst,
 * wäre sonst für immer verloren, weil danach „erledigt" im Browser steht.
 * Scheitert eine Anfrage, bleibt die Marke weg und der nächste Besuch versucht es
 * noch einmal.
 */
export function useStarImport({
  ready,
  library,
  shopAgents,
  shopRecipes,
  ownAgentKeys,
}: {
  ready: boolean;
  library: ReturnType<typeof useUserLibrary>;
  shopAgents: ReadonlyMap<string, AgentEntry>;
  shopRecipes: ReadonlyMap<string, RecipeEntry>;
  ownAgentKeys: ReadonlySet<string>;
}) {
  const agentStars = useAgentFavoritesStore((s) => s.favoriteIdentifiers);
  const recipeStars = useSkillFavoritesStore((s) => s.favorites);
  const started = useRef(false);
  const { has, addMany } = library;

  useEffect(() => {
    if (!ready || started.current || readDone()) return;
    started.current = true;
    const missing = starredLibraryRefs({
      agentStars,
      recipeStars,
      shopAgents,
      shopRecipes,
      ownAgentKeys,
    }).filter((r) => !has(r.kind, r.ref));
    if (missing.length === 0) {
      markDone();
      return;
    }
    addMany(missing).then(
      (complete) => {
        if (complete) markDone();
      },
      (error: unknown) => {
        console.warn('[Grüneratoren] Sterne konnten nicht übernommen werden:', error);
      }
    );
  }, [ready, agentStars, recipeStars, shopAgents, shopRecipes, ownAgentKeys, has, addMany]);
}
