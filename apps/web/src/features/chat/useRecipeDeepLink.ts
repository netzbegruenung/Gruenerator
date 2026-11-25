import { useAgentStore, useRecipeMentionRequest } from '@gruenerator/chat';
import { useCallback, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Liest das Rezept aus der URL. `?skill=<mention>` ist der alte Link (F0:
 * ausgelieferte Links bleiben gültig) und aktiviert ebenfalls das Rezept. Alle
 * Erzeuger schreiben `?rezept=`; `?rezept=` gewinnt, wenn beide stehen.
 */
export function readRecipeDeepLink(searchParams: URLSearchParams): {
  mention: string | null;
  recipeId: string | null;
} {
  const mention = searchParams.get('rezept') ?? searchParams.get('skill');
  return { mention, recipeId: mention ? searchParams.get('rezeptId') : null };
}

const RECIPE_PARAMS = ['rezept', 'rezeptId', 'skill'] as const;

/**
 * `/chat?rezept=<mention>&rezeptId=<id>` öffnet den normalen neuen Chat mit dem
 * Rezept als @-Chip im Composer — dasselbe, was ein Klick auf einen
 * Rezept-Starter unter dem Composer tut. Danach fällt der Parameter aus der
 * URL: der Chip gehört ab dann der Person, sie kann ihn entfernen.
 *
 * Erst im leeren Chat (`overview`) anfragen. Stünde die Ansicht noch auf einem
 * Thread, ginge der Chip an dessen Composer, der beim Umschalten verschwindet.
 */
export function useRecipeDeepLink(enabled: boolean): void {
  const [searchParams, setSearchParams] = useSearchParams();
  const { mention, recipeId } = readRecipeDeepLink(searchParams);
  const active = enabled && mention !== null;
  const inOverview = useAgentStore((s) => s.chatViewMode === 'overview');

  useEffect(() => {
    if (active && !inOverview) useAgentStore.getState().setChatViewMode('overview');
  }, [active, inOverview]);

  const dropParams = useCallback(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        RECIPE_PARAMS.forEach((p) => next.delete(p));
        return next;
      },
      { replace: true }
    );
  }, [setSearchParams]);

  useRecipeMentionRequest(active && inOverview ? { mention, recipeId } : null, dropParams);
}
