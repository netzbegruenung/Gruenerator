import { useUserLibrary } from '@gruenerator/shared/grueneratoren';
import { toast } from '@gruenerator/ui';

/**
 * „Zu meinen Grüneratoren" im Chat: dieselbe Bibliothek wie in der Übersicht
 * (gleicher Query-Key, ein Cache), mit dem Toast des Webs als Fehleranzeige.
 * Die Rezept-Favoriten des Chats (Plus-Menü, Bibliothek, Starter) lesen und
 * schreiben hierüber — nicht mehr über `skillFavoritesStore`.
 */
export function useRecipeLibrary() {
  return useUserLibrary({ onError: toast.error });
}
