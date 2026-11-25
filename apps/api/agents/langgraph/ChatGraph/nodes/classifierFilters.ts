/**
 * Classifier Filters
 *
 * Extracts metadata filters (content_type) from the query text.
 *
 * Ein Landesverband im Text wird bewusst NICHT zum Filter (#3712). Er landete
 * als `region` in der Suche — ein Feld, das kein Punkt in keiner Sammlung
 * trägt, jede Suche kam leer zurück. `landesverband` wäre nicht besser: die
 * LV-Sammlungen (`@thüringen` usw.) filtern über ihren `defaultFilter` schon
 * selbst, und alle anderen Sammlungen haben das Feld nicht.
 *
 * Bis zur Löschung der LLM-Stufe stand hier eine zweite Hälfte: `ClassifierLLMResponse`
 * (das Antwortschema des 27k-Prompts) und `extractFilters`, das dessen `filters`-Objekt
 * einlas. Beides hatte danach keinen Produktions-Aufrufer mehr — am Leben hielten es
 * nur zwei `.test.ts`-Skripte, die keine Testsuite ausführt.
 */

import type { SubcategoryFilters } from '../../../../config/systemCollectionsConfig.js';

/**
 * Heuristic filter detection for high-confidence paths that skip LLM.
 * Extracts obvious filters from the query text using regex patterns.
 */
export function heuristicExtractFilters(query: string): SubcategoryFilters | null {
  const q = query.toLowerCase();
  const filters: SubcategoryFilters = {};

  if (/\b(pressemitteilung|pressemeldung|pressemitteilungen|presse)\b/i.test(q)) {
    filters.content_type = 'presse';
  } else if (/\b(beschluss|beschlüsse)\b/i.test(q)) {
    filters.content_type = 'beschluss';
  } else if (/\b(antrag|anträge)\b/i.test(q)) {
    filters.content_type = 'antrag';
  } else if (/\b(wahlprogramm|wahlprogramme)\b/i.test(q)) {
    filters.content_type = 'wahlprogramm';
  } else if (/\b(positionspapier|positionspapiere)\b/i.test(q)) {
    filters.content_type = 'position';
  }

  return Object.keys(filters).length > 0 ? filters : null;
}

/**
 * Filters of a forced-search turn. The resolver's content type wins over the
 * heuristic's: it saw the conversation, so a follow-up without a type word of
 * its own („suche nur im notebook" after „was haben wir beschlossen") keeps the
 * Beschluss filter. The heuristic reads only this message and stays the
 * fallback for a resolver that failed or named no type.
 */
export function forcedSearchFilters(
  userContent: string,
  refinedContentType: string | null
): SubcategoryFilters | null {
  const heuristic = heuristicExtractFilters(userContent);
  return refinedContentType ? { ...heuristic, content_type: refinedContentType } : heuristic;
}

/**
 * The content type a turn asked for, as the list `lvContentType` takes —
 * `undefined` when it asked for none.
 */
export function contentTypesOf(
  filters: SubcategoryFilters | null | undefined
): readonly string[] | undefined {
  const raw = filters?.content_type;
  if (raw === undefined) return undefined;
  const list = typeof raw === 'string' ? [raw] : raw;
  return list.length > 0 ? list : undefined;
}
