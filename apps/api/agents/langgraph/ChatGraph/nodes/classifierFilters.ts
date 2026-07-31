/**
 * Classifier Filters
 *
 * Extracts metadata filters (Landesverband, content_type) from the query text.
 *
 * Bis zur Löschung der LLM-Stufe stand hier eine zweite Hälfte: `ClassifierLLMResponse`
 * (das Antwortschema des 27k-Prompts) und `extractFilters`, das dessen `filters`-Objekt
 * einlas. Beides hatte danach keinen Produktions-Aufrufer mehr — am Leben hielten es
 * nur zwei `.test.ts`-Skripte, die keine Testsuite ausführt.
 */

import type { SubcategoryFilters } from '../../../../config/systemCollectionsConfig.js';

/**
 * Landesverband name-to-code mapping.
 * Maps German state names and common abbreviations to the codes used in Qdrant metadata.
 * Thüringen maps to both TH and TH-F (includes Fraktion documents).
 */
export const LANDESVERBAND_ALIASES: Record<string, string | string[]> = {
  hamburg: 'HH',
  hh: 'HH',
  'schleswig-holstein': 'SH',
  sh: 'SH',
  thüringen: ['TH', 'TH-F'],
  thueringen: ['TH', 'TH-F'],
  th: ['TH', 'TH-F'],
  bayern: 'BY',
  by: 'BY',
};

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

  for (const [name, code] of Object.entries(LANDESVERBAND_ALIASES)) {
    if (name.length <= 2) continue; // Skip abbreviations, only match full names
    if (q.includes(name)) {
      filters.region = code;
      break;
    }
  }

  return Object.keys(filters).length > 0 ? filters : null;
}
