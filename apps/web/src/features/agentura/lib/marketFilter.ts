/**
 * Reihung für das flache Marktraster.
 *
 * Bis zum Redesign war „Empfohlen" ein eigener Abschnitt über den offiziellen
 * Grüneratoren. Im flachen Raster gibt es keine Abschnitte mehr — die sechs
 * kuratierten Karten würden sich sonst zwischen den übrigen verteilen. Ihre
 * Aufgabe übernimmt deshalb die Sortierung: bei `empfohlen` stehen die
 * angehefteten zuerst, innerhalb beider Gruppen entscheidet weiter die Nutzung.
 */
export function pinnedFirst<T>(items: T[], isPinned: (item: T) => boolean): T[] {
  const pinned: T[] = [];
  const rest: T[] = [];
  for (const item of items) (isPinned(item) ? pinned : rest).push(item);
  return [...pinned, ...rest];
}
