import { hasSystemRecipe } from '@gruenerator/shared/agents';

import { type RecipeSource } from './useRecipeByMention';

/**
 * Die eine Zeile unter dem Namen eines mitgelieferten Rezepts oder Presets —
 * und damit das Versprechen, das die Oberfläche gibt.
 *
 * Für `antrag` war es bis #2937 falsch. `textFormTypeSchema` kennt vier Presets,
 * `SKILLS` führt drei davon als Rezept; ein Antrags-Stil ersetzt also nichts,
 * sondern steht für sich und erscheint im Chat als eigene Erwähnung. Übersetzt
 * wird das an genau einer Stelle, weil Übersicht (`TexteAnlernenTab`) und Editor
 * (`TextFormEditor`) dieselbe Zeile zeigen — und sie vorher beide dasselbe
 * Falsche behaupteten.
 */
export function recipeMetaLine(mention: string): string {
  return hasSystemRecipe(mention)
    ? `Ersetzt das mitgelieferte Rezept @${mention}`
    : `Eigenständiges Rezept · im Chat als @${mention}`;
}

/**
 * Woher eine fremde Zeile kommt, in einer Zeile — nichts für die eigene.
 *
 * Steht hier und nicht bei den Aufrufern, weil zwei Flächen dieselbe Auskunft
 * geben: die Karte in der Agentura und der Kopf der Detailseite. Zwei Kopien
 * derselben Formulierung laufen genau so auseinander wie die in
 * {@link recipeMetaLine} beschriebene.
 */
export function recipeOriginLine(
  form: { sharedFromGroup: string | null; ownerName: string | null },
  source: RecipeSource
): string | null {
  if (source === 'shared') {
    const group = form.sharedFromGroup ?? 'einem Projekt';
    return `Geteilt aus ${group}${form.ownerName ? ` von ${form.ownerName}` : ''}`;
  }
  if (source === 'public') {
    return `Von der Basis${form.ownerName ? ` · ${form.ownerName}` : ''}`;
  }
  return null;
}
