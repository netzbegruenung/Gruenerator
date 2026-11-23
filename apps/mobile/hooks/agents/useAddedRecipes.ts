import { usePublicRecipes } from '@gruenerator/shared/grueneratoren';
import { useMemo } from 'react';

import { pickAddedRecipes } from './addedRecipes';
import { useAgenturaCatalog } from './useAgenturaCatalog';
import { useOwnRecipes } from './useOwnRecipes';
import { useUserLibrary } from './useUserLibrary';

/**
 * Rezepte, die die Person aus dem Marktplatz zu ihren Grüneratoren geholt hat
 * („Zu meinen Grüneratoren", `user_library_items`) — dieselben Verweise wie im
 * Web (`useMyRecipes`): Mention bei Katalog-Rezepten, Zeilen-id bei
 * öffentlichen Nutzer-Rezepten (ihre Mention ist nur pro Besitzer eindeutig).
 * Eigene stehen schon unter „Deine" und fallen heraus.
 */
export function useAddedRecipes() {
  const library = useUserLibrary();
  const catalog = useAgenturaCatalog();
  const own = useOwnRecipes();
  // Die öffentliche Liste nur holen, wenn ein Verweis kein Katalog-Rezept ist.
  const wantsPublic = library.items.some(
    (i) => i.kind === 'recipe' && !catalog.skills.some((s) => s.mention === i.ref)
  );
  const { data: publicRecipes = [] } = usePublicRecipes(wantsPublic);

  const result = useMemo(
    () =>
      pickAddedRecipes({
        items: library.items,
        catalogSkills: catalog.skills,
        rolesLoaded: catalog.rolesLoaded,
        ownIds: new Set((own.data ?? []).map((f) => f.id)),
        publicRecipes,
      }),
    [library.items, catalog.skills, catalog.rolesLoaded, own.data, publicRecipes]
  );

  return { ...result, loaded: library.loaded, failed: library.failed };
}
