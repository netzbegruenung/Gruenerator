import { agentsList, type AgentListItem } from '@gruenerator/chat';
import {
  resolveRecipeByMention,
  useOwnRecipes,
  usePublicRecipes,
  type RecipeMatch,
} from '@gruenerator/shared/grueneratoren';

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
  if (match) return { status: 'ready', ...match };
  if (own.isLoading || pub.isLoading) return { status: 'loading' };
  return { status: 'missing', isError: own.isError || pub.isError };
}
