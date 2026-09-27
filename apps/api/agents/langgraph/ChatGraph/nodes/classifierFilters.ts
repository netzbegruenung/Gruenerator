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
