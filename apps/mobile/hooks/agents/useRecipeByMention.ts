import { agentsList, type AgentListItem } from '@gruenerator/chat';
import {
  resolveRecipeByMention,
  useOwnRecipes,
  usePublicRecipes,
  useRecipeLink,
  type RecipeMatch,
} from '@gruenerator/shared/grueneratoren';
import { shareLinkKey } from '@gruenerator/shared/utils';

export type RecipeLookup =
  | { status: 'loading' }
  | { status: 'missing'; isError: boolean }
  | ({ status: 'ready' } & RecipeMatch<AgentListItem>);

/**
 * Ein Rezept der Detailseite: Katalog, eigenes, geteiltes, öffentliches —
 * dieselbe Reihenfolge wie im Web (`resolveRecipeByMention`). Liest die
 * UNgefilterte eigene Liste: die Übersicht blendet geteilte Zeilen und
 * Überschreibungen aus, die Detailseite braucht genau die.
 */
export function useRecipeByMention(mention: string): RecipeLookup {
  const needle = mention.toLowerCase();
  const skill = agentsList.find((s) => s.mention.toLowerCase() === needle) ?? null;
  const own = useOwnRecipes(mention.length > 0);
  // Ein Katalog-Rezept steht nie in der öffentlichen Liste.
  const pub = usePublicRecipes(!skill && mention.length > 0);

  const match = resolveRecipeByMention(mention, skill, own.data, pub.data);
  const listsLoading = own.isLoading || pub.isLoading;
  // Ein Teilen-Link, den keine Liste kennt, kann nur der Server auflösen — nie per Mention.
  const askServer = !match && !listsLoading && !skill && shareLinkKey(mention) !== null;
  const link = useRecipeLink(askServer ? mention : null);

  if (match) return { status: 'ready', ...match };
  if (listsLoading || link.isLoading) return { status: 'loading' };
  if (link.data && link.data.source !== 'own') {
    return {
      status: 'ready',
      source: link.data.source,
      skill: null,
      form: link.data.form,
      ownOverride: null,
    };
  }
  return { status: 'missing', isError: own.isError || pub.isError || link.isError };
}
