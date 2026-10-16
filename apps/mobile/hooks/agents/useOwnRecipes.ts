import { ownRecipesQuery } from '@gruenerator/shared/grueneratoren';
import { useQuery } from '@tanstack/react-query';

/**
 * Die eigenen Rezepte für „Meine Grüneratoren". Dieselbe Abfrage wie im Web;
 * gefiltert wird per `select`, nicht im `queryFn` — sonst läge unter
 * `['text-forms']` eine gekürzte Liste, und der Editor (Mention-Konflikte,
 * Teilen-Liste) sähe die geteilten Zeilen nicht mehr.
 *
 * Projekt-geteilte Zeilen fallen weg (unter „Meine" läsen sie sich als eigene),
 * Überschreibungen von System-Rezepten (`preset`/`recipe`) ebenso — das
 * „Offizielle"-Regal führt das Original schon.
 */
export function useOwnRecipes(enabled = true) {
  return useQuery({
    ...ownRecipesQuery,
    enabled,
    select: (forms) => forms.filter((f) => f.kind === 'custom' && f.sharedFromGroup === null),
  });
}
