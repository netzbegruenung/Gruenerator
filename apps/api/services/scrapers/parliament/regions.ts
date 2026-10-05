/**
 * Ortsbezug eines Parlamentsdokuments über eine feste Ortsliste — kein NER:
 * die Landtage führen keinen Ortsbezug als Feld (NRW nennt in den Schlagworten
 * nur Einrichtungen wie „Universität Bielefeld"), und eine Liste mit festen
 * Namen ist nachprüfbar und kostet nichts.
 *
 * Ein Name zählt nur als ganzes Wort, gern mit „-er" („Neuköllner",
 * „Tempelhofer Feld"). Mehrdeutige Namen („Mitte", „Essen") stehen in der Liste
 * nur mit Kontext.
 */

/** Region → Muster ihrer Namen (ohne Wortgrenzen, die setzt `regionsOf`). */
export type Gazetteer = Record<string, readonly string[]>;

/** Mehr Regionen in einem Dokument heißt „betrifft das ganze Land" — dann keine. */
const MAX_REGIONS = 4;

const compiled = new WeakMap<Gazetteer, [string, RegExp][]>();

function patternsOf(gazetteer: Gazetteer): [string, RegExp][] {
  let patterns = compiled.get(gazetteer);
  if (!patterns) {
    patterns = Object.entries(gazetteer).map(([region, names]) => [
      region,
      new RegExp(`(?<![\\p{L}-])(?:${names.join('|')})(?:er)?(?![\\p{L}])`, 'u'),
    ]);
    compiled.set(gazetteer, patterns);
  }
  return patterns;
}

/** Die Regionen, die `text` nennt, in der Reihenfolge der Liste. */
export function regionsOf(text: string, gazetteer: Gazetteer): string[] {
  const found = patternsOf(gazetteer)
    .filter(([, pattern]) => pattern.test(text))
    .map(([region]) => region);
  return found.length > MAX_REGIONS ? [] : found;
}
