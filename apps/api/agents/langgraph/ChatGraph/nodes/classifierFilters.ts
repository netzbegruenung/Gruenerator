/**
 * Classifier Filters & LLM Response Types
 *
 * Handles extraction of metadata filters (Landesverband, content_type, dates)
 * from both LLM responses and raw query text.
 */

import { createLogger } from '../../../../utils/logger.js';

import type { SubcategoryFilters } from '../../../../config/systemCollectionsConfig.js';

const log = createLogger('ChatGraph:Classifier');

/**
 * Extended classifier response with CoT fields.
 */
export interface ClassifierLLMResponse {
  typoAnalysis?: { original: string; corrected: string } | null;
  contentType?: string | null;
  needsResearch?: boolean;
  intent: string;
  secondaryIntent?: string | null;
  searchQuery: string | null;
  optimizedSearchQuery?: string | null;
  subQueries?: string[] | null;
  searchSources?: string[] | null;
  filters?: {
    content_type?: string | null;
    landesverband?: string | null;
    primary_category?: string | null;
    date_from?: string | null;
    date_to?: string | null;
    person?: string | null;
  } | null;
  needsClarification?: boolean;
  clarificationQuestion?: string;
  clarificationOptions?: string[];
  documentSubtype?: string | null;
  targetGroupName?: string | null;
  reasoning: string;
}

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
 * Extract SubcategoryFilters from the LLM's raw filter output.
 * Strips null values and maps landesverband aliases.
 */
export function extractFilters(raw: ClassifierLLMResponse['filters']): SubcategoryFilters | null {
  if (!raw) return null;

  const filters: SubcategoryFilters = {};

  if (raw.content_type) {
    filters.content_type = raw.content_type;
  }

  if (raw.landesverband) {
    // Map to actual Qdrant codes (e.g., "TH" → ["TH", "TH-F"])
    const code = raw.landesverband;
    const alias = LANDESVERBAND_ALIASES[code.toLowerCase()];
    if (alias) {
      filters.region = alias; // SubcategoryFilters uses 'region' for landesverband
    } else {
      // Use the code as-is if it's already a valid code (e.g., "HH")
      filters.region = code;
    }
  }

  if (raw.primary_category) {
    filters.primary_category = raw.primary_category;
  }

  if (raw.date_from && /^\d{4}-\d{2}-\d{2}$/.test(raw.date_from)) {
    filters.date_from = raw.date_from;
  }

  if (raw.date_to && /^\d{4}-\d{2}-\d{2}$/.test(raw.date_to)) {
    filters.date_to = raw.date_to;
  }

  // Person is kept in the search query, not as a Qdrant filter (no person field in Qdrant)
  // We log it for observability but don't add to filters
  if (raw.person) {
    log.debug(`[Classifier] Person detected: "${raw.person}" (kept in search query, not filtered)`);
  }

  return Object.keys(filters).length > 0 ? filters : null;
}

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
