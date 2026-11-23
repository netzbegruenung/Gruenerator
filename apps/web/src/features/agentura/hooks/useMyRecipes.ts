import { type TextForm } from '@gruenerator/contracts';
import { useDeleteRecipe } from '@gruenerator/shared/grueneratoren';
import { useConfirm } from '@gruenerator/ui';
import { useMemo } from 'react';

import { useTrashUndoToast } from '../../trash/trashUndoToast';
import { isLandesverbandIdentifier } from '../lib/lookups';
import { recipeFromForm, recipeFromSkill, type RecipeEntry } from '../lib/marketItems';
import { recipeOriginLine } from '../recipes/recipeMeta';

import { useAgenturaPools } from './useAgenturaPools';
import { useSystemCatalog } from './useSystemCatalog';
import { useUserLibrary } from './useUserLibrary';

/**
 * Die Rezepte, mit denen eine Person arbeitet: eigene (mit Löschen samt
 * Rückgängig), in ihre Projekte geteilte und aus dem Marktplatz hinzugefügte.
 * Ein Rezept braucht kein Projekt — es gehört der Person und wird nur bei
 * Bedarf in Projekte geteilt. `/projekte` und die alte Übersicht
 * `/grueneratoren` lesen beide hieraus.
 *
 * Löschen fragt über `useConfirm` nach; die Seite braucht deshalb einen
 * `ConfirmDialogProvider`, sonst fällt es auf `window.confirm` zurück.
 */
export function useMyRecipes() {
  const pools = useAgenturaPools();
  const { ownRecipes, sharedRecipes } = pools;
  const catalog = useSystemCatalog(pools.sharedAgents);
  const library = useUserLibrary();
  const deleteRecipe = useDeleteRecipe();
  const confirmDialog = useConfirm();
  const showTrashUndo = useTrashUndoToast();

  const handleDelete = async (form: TextForm) => {
    const confirmed = await confirmDialog({
      title: 'Rezept löschen?',
      description: `„${form.title}“ wird in den Papierkorb verschoben und kann 30 Tage lang wiederhergestellt werden.`,
    });
    if (!confirmed) return;
    // DELETE takes the mention; the trash addresses the row id.
    deleteRecipe.mutate(form.mention, {
      onSuccess: () => showTrashUndo({ kind: 'user_text_form', id: form.id, title: form.title }),
    });
  };

  const own = useMemo<RecipeEntry[]>(
    () =>
      ownRecipes.map((f) =>
        recipeFromForm(f, {
          editable: true,
          shareLabel: null,
          onDelete: () => {
            void handleDelete(f);
          },
        })
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `handleDelete` is recreated every render but only closes over `confirmDialog`/`deleteRecipe.mutate`/`showTrashUndo`, all stable, so omitting it changes nothing
    [ownRecipes]
  );
  const shared = useMemo<RecipeEntry[]>(
    () =>
      sharedRecipes.map((f) =>
        recipeFromForm(f, { editable: false, shareLabel: recipeOriginLine(f, 'shared') })
      ),
    [sharedRecipes]
  );

  // Was der Marktplatz an Rezepten anbietet, nach Verweis — dieselbe
  // Sichtbarkeit wie dort: Landesverbands-Rezepte nur mit Rolle (und erst nach
  // deren Hydratation), damit ein verwaister LV-Eintrag nicht am Rollen-Gatter
  // vorbei erscheint.
  const shopRecipes = useMemo(() => {
    const lv = catalog.rolesLoaded ? catalog.lvSkills : [];
    const general = catalog.allSkills.filter((s) => !isLandesverbandIdentifier(s.identifier));
    const map = new Map<string, RecipeEntry>();
    for (const skill of [...general, ...lv]) map.set(skill.mention, recipeFromSkill(skill));
    // Nutzer-Rezepte über die Zeilen-id: ihre Mention ist nur pro Besitzer eindeutig.
    for (const entry of pools.communityRecipeEntries) if (entry.id) map.set(entry.id, entry);
    return map;
  }, [catalog.allSkills, catalog.lvSkills, catalog.rolesLoaded, pools.communityRecipeEntries]);

  // Aus dem Marktplatz geholt, aber nicht ohnehin schon eigen oder geteilt. Ein
  // Verweis, der auf nichts Sichtbares mehr zeigt, fällt still heraus und
  // bleibt in der Liste liegen — wird er wieder sichtbar, ist er wieder da.
  const added = useMemo(() => {
    const shown = new Set([...own, ...shared].map((e) => e.mention.toLowerCase()));
    const recipes: RecipeEntry[] = [];
    for (const item of library.items) {
      if (item.kind !== 'recipe') continue;
      const entry = shopRecipes.get(item.ref);
      if (entry && !shown.has(entry.mention.toLowerCase())) recipes.push(entry);
    }
    return recipes;
  }, [library.items, shopRecipes, own, shared]);

  return {
    own,
    shared,
    added,
    /** Für den einmaligen Stern-Import der alten Übersicht. */
    shopRecipes,
    /** Erst dann heißt eine leere Liste „noch keine Rezepte". */
    settled: pools.ownLoaded && library.loaded,
    failed: pools.ownFailed || library.failed,
  };
}
