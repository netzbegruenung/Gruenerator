import { useEffect, useRef } from 'react';

import { resolveMentionable, textformToMentionable, type Mentionable } from '../lib/mentionables';
import { requestMention } from '../lib/mentionRequest';

import { useTextformsQuery } from './useMentionablesQuery';

export interface RecipeLink {
  mention: string;
  /** Zeilen-ID eines eigenen, geteilten oder öffentlichen Rezepts; `null` = Systemrezept. */
  recipeId: string | null;
}

/**
 * Das Rezept als Mention, die der Composer als Chip zeigt. Ein Systemrezept
 * kennt die Registry sofort; ein Nutzerrezept erst, wenn die Rezeptliste
 * geantwortet hat (`null` = noch warten). Steht es danach nicht in der Liste
 * (ein öffentliches, nicht gespeichertes Rezept), trägt der Chip die Erwähnung
 * als Titel — die Zeilen-ID fährt trotzdem mit, denn `handleSelect` setzt sie
 * für einen `textform` als `activeRecipeId`.
 */
export function resolveRecipeLink(
  link: RecipeLink,
  textforms: readonly Mentionable[] | null
): Mentionable | null {
  if (!link.recipeId) {
    const found = resolveMentionable(link.mention);
    return found?.category === 'skill' ? found : null;
  }
  if (!textforms) return null;
  return (
    textforms.find((t) => t.identifier === link.recipeId) ??
    textformToMentionable({
      id: link.recipeId,
      mention: link.mention,
      title: `@${link.mention}`,
      description: null,
      iconKey: null,
      sharedFromGroup: null,
      ownerName: null,
      isPublic: false,
    })
  );
}

/**
 * Setzt ein Rezept aus einem Link (`/chat?rezept=…`) als @-Chip in den
 * Composer — derselbe Weg wie ein Klick auf einen Rezept-Starter. `onHandled`
 * läuft genau einmal je Link, sobald er erledigt ist (Chip angefragt oder das
 * Systemrezept unbekannt), damit der Aufrufer ihn aus der URL nehmen kann.
 */
export function useRecipeMentionRequest(link: RecipeLink | null, onHandled: () => void): void {
  const { data, isFetched } = useTextformsQuery();
  const handledRef = useRef<string | null>(null);
  const key = link ? `${link.mention}:${link.recipeId ?? ''}` : null;

  useEffect(() => {
    if (!link || !key || handledRef.current === key) return;
    const textforms = isFetched ? (data ?? []).map(textformToMentionable) : null;
    if (link.recipeId && !textforms) return;
    handledRef.current = key;
    const mentionable = resolveRecipeLink(link, textforms);
    if (mentionable) requestMention(mentionable);
    onHandled();
    // `link` ist bei jedem Render ein neues Objekt; `key` trägt seinen Inhalt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, data, isFetched, onHandled]);
}
