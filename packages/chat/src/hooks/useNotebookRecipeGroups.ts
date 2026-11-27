import { LANDESVERBAENDE, skillRole } from '@gruenerator/shared/agents';
import { useMemo } from 'react';

import { type NotebookRecipeGroup } from '../components/notebook/NotebookRecipePicker';
import {
  getAgentMentionables,
  landesverbandRecipeMentionables,
  textformToMentionable,
  type Mentionable,
} from '../lib/mentionables';
import { libraryRecipeMentionables } from '../lib/plusMenu';

import { useTextformsQuery } from './useMentionablesQuery';
import { useRecipeLibrary } from './useRecipeLibrary';

/**
 * Was der Rezept-Wähler eines Notebooks anbietet, in dieser Reihenfolge:
 * die Rezepte seines Landesverbands (nur auf einem LV-Notebook), die eigenen
 * und geteilten Rezepte der Person, dann gemerkte und Standard-Rezepte wie im
 * leeren Chat. Jedes Rezept steht nur einmal, und Methoden-Rezepte fehlen —
 * sie steuern eine Recherche, keine Form.
 *
 * `notebookId` ist die Registry-Id (`bayern-notebook`), nicht die Sammlung.
 */
export function useNotebookRecipeGroups(notebookId: string | null): {
  groups: NotebookRecipeGroup[];
  /** Die Rezepte des Landesverbands — Einstiegs-Chips auf der Startseite. */
  starters: readonly Mentionable[];
  /** Ein Rezept aus den Gruppen wiederfinden — für `?rezept=` und die Übergabe. */
  find: (mention: string, recipeId?: string | null) => Mentionable | null;
} {
  const { data: forms } = useTextformsQuery();
  const { items } = useRecipeLibrary();

  return useMemo(() => {
    const seen = new Set<string>();
    const fresh = (list: readonly Mentionable[]) =>
      list.filter(
        (m) =>
          skillRole(m.mention) === 'textsorte' &&
          !seen.has(m.mention.toLowerCase()) &&
          seen.add(m.mention.toLowerCase())
      );

    const lv = notebookId ? LANDESVERBAENDE.find((l) => l.notebookId === notebookId) : undefined;
    const lvRecipes = fresh(landesverbandRecipeMentionables(notebookId));
    const own = fresh((forms ?? []).map(textformToMentionable));
    const more = fresh([
      ...libraryRecipeMentionables(items.filter((i) => i.kind === 'recipe').map((i) => i.ref)),
      ...getAgentMentionables().filter((m) => m.isSystemDefault),
    ]);
    const groups: NotebookRecipeGroup[] = [
      ...(lv ? [{ title: `Für ${lv.title}`, recipes: lvRecipes }] : []),
      { title: 'Eigene Rezepte', recipes: own },
      { title: lv ? 'Weitere Rezepte' : 'Rezepte', recipes: more },
    ];
    const all = groups.flatMap((g) => g.recipes);
    // A link may name any offered recipe, not only the listed ones.
    const find = (mention: string, recipeId?: string | null): Mentionable | null =>
      (recipeId ? all.find((m) => m.type === 'textform' && m.identifier === recipeId) : null) ??
      [...all, ...getAgentMentionables()].find(
        (m) => m.mention.toLowerCase() === mention.toLowerCase()
      ) ??
      null;
    return { groups, starters: lvRecipes, find };
  }, [notebookId, forms, items]);
}
