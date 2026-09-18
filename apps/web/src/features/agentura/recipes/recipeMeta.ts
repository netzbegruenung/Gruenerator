import { hasSystemRecipe } from '@gruenerator/shared/agents';

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
