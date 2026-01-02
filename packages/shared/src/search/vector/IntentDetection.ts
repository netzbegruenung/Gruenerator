/**
 * IntentDetection - Query intent detection for smarter search filtering
 * Detects query type, language, and auto-applies filters
 */

import type { QueryIntent, DocumentScope, QdrantFilter } from './types.js';
import { INTENT_CONTENT_PREFERENCES } from './constants.js';

/**
 * German intent patterns
 */
const GERMAN_PATTERNS = [
  { type: 'definition', re: /^(was ist|was bedeutet|definiere)\b/i },
  { type: 'howto', re: /^(wie|wie kann|anleitung|schritte|so geht)\b/i },
  { type: 'factual', re: /^(wer|was|wann|wo|wieviel|wie viele)\b/i },
  { type: 'comparison', re: /(vs\.?|vergleich|unterschiede|gegenüberstellung)/i },
  { type: 'legal', re: /(§|paragraph|gesetz|verordnung|richtlinie|stgb|bgb)\b/i },
  { type: 'list', re: /(liste|auflistung|punkte|stichpunkte)\b/i },
  { type: 'table', re: /(tabelle|tabellarisch)\b/i },
  { type: 'code', re: /(code|beispielcode|snippet)\b/i },
  { type: 'summary', re: /(zusammenfassung|kurzfassung|tl;dr)/i },
  { type: 'timeline', re: /(chronologie|zeitverlauf|timeline)\b/i },
] as const;

/**
 * English intent patterns (fallback)
 */
const ENGLISH_PATTERNS = [
  { type: 'definition', re: /^(what is|define)\b/i },
  { type: 'howto', re: /^(how to|how do|steps)\b/i },
  { type: 'comparison', re: /(vs\.?|difference|compare)\b/i },
  { type: 'legal', re: /(law|regulation|directive|article)\b/i },
  { type: 'list', re: /(list|bullets)\b/i },
  { type: 'table', re: /(table|tabular)\b/i },
  { type: 'code', re: /(code|snippet|example)\b/i },
  { type: 'summary', re: /(summary|tl;dr)/i },
] as const;

/**
 * Document scope patterns for Green Party collections
 */
const DOCUMENT_PATTERNS = [
  {
    re: /\b(im\s+)?Grundsatzprogramm(\s+2020)?\b/i,
    collections: ['grundsatz-system'],
    titleFilter: 'Grundsatzprogramm 2020',
  },
  {
    re: /\b(im\s+)?(EU[\s-]?Wahlprogramm|Europawahlprogramm)(\s+2024)?\b/i,
    collections: ['grundsatz-system'],
    titleFilter: 'EU-Wahlprogramm 2024',
  },
  {
    re: /\b(im\s+)?Regierungsprogramm(\s+2025)?\b/i,
    collections: ['grundsatz-system'],
    titleFilter: 'Regierungsprogramm 2025',
  },
  {
    re: /\b((in\s+den\s+)?(Grundsatz)?programmen|Grundsatzprogramme)\b/i,
    collections: ['grundsatz-system'],
    titleFilter: null,
  },
  {
    re: /\b(Bundestags?fraktion|gruene-?bundestag|grüne-?bundestag)\b/i,
    collections: ['bundestagsfraktion-system'],
    titleFilter: null,
  },
  {
    re: /\b(KommunalWiki|Kommunalwiki|kommunalwiki)\b/i,
    collections: ['kommunalwiki-system'],
    titleFilter: null,
  },
  {
    re: /\b(gruene\.de|grüne\.de)\b/i,
    collections: ['gruene-de-system'],
    titleFilter: null,
  },
  {
    re: /\b(gruene\.at|grüne\.at|Grüne\s+Österreich)\b/i,
    collections: ['gruene-at-system'],
    titleFilter: null,
  },
  {
    re: /\b(satzung|satzungen|kreisverband|ortsverband)\b/i,
    collections: ['satzungen-system'],
    titleFilter: null,
  },
];

/**
 * Article type patterns (for KommunalWiki)
 */
const ARTICLE_TYPE_PATTERNS = [
  { re: /\b(nur\s+)?(Literatur|Bücher)\b/i, value: 'literatur' },
  { re: /\b(nur\s+)?(Praxishilfe|Praxishilfen)\b/i, value: 'praxishilfe' },
  { re: /\b(nur\s+)?(FAQ|Fragen)\b/i, value: 'faq' },
  { re: /\b(nur\s+)?Personalien\b/i, value: 'personalien' },
  { re: /\b(nur\s+)?Sachgebiet(e)?\b/i, value: 'sachgebiet' },
  { re: /\b(nur\s+)?(Artikel|Beiträge)\b/i, value: 'artikel' },
];

/**
 * Detect language from query
 */
function detectLanguage(query: string): 'de' | 'en' | 'unknown' {
  const hasGerman = /[äöüß]/i.test(query) ||
    /(der|die|das|und|ist|nicht|mit|für|auf|ein|eine)\b/i.test(query);
  const hasEnglish = /(the|and|is|with|for|on|in|of)\b/i.test(query);

  if (hasGerman && !hasEnglish) return 'de';
  if (hasEnglish && !hasGerman) return 'en';
  return 'unknown';
}

/**
 * Extract keywords from query
 */
function extractKeywords(query: string): string[] {
  return query
    .toLowerCase()
    .replace(/[^a-zäöüß0-9\s-]/gi, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2)
    .slice(0, 10);
}

/**
 * Analyze a query and return intent info
 */
export function detectIntent(query: string): QueryIntent {
  const q = (query || '').trim();
  if (!q) {
    return { type: 'unknown', language: 'unknown', confidence: 0 };
  }

  const language = detectLanguage(q);

  // Try German patterns first
  let match = GERMAN_PATTERNS.find((p) => p.re.test(q));

  // Fallback to English
  if (!match) {
    match = ENGLISH_PATTERNS.find((p) => p.re.test(q));
  }

  const type = match ? match.type : 'general';
  const confidence = match ? 0.8 : 0.5;
  const keywords = extractKeywords(q);

  return {
    type,
    language,
    confidence,
    keywords,
    flags: { hasNumbers: /\d/.test(q) },
  };
}

/**
 * Map intent type to content-type preferences
 */
export function getContentPreferences(intentType: string): {
  preferredTypes: string[];
  boost: Record<string, number>;
} {
  return INTENT_CONTENT_PREFERENCES[intentType] || INTENT_CONTENT_PREFERENCES.general;
}

/**
 * Create Qdrant filters based on intent
 */
export function generateSearchFilters(intent: QueryIntent): QdrantFilter {
  const prefs = getContentPreferences(intent?.type || 'general');
  const filter: QdrantFilter = { must: [], should: [] };

  // Prefer content types via should clauses
  if (prefs.preferredTypes?.length) {
    filter.should = prefs.preferredTypes.map((t) => ({
      key: 'content_type',
      match: { value: t },
    }));
  }

  // Language hint
  if (intent?.language === 'de') {
    filter.should!.push({ key: 'lang', match: { value: 'de' } });
  } else if (intent?.language === 'en') {
    filter.should!.push({ key: 'lang', match: { value: 'en' } });
  }

  return filter;
}

/**
 * Detect subcategory filters from natural language query
 */
export function detectSubcategoryFilters(query: string): Record<string, string> {
  const q = (query || '').trim();
  if (!q) return {};

  const filters: Record<string, string> = {};

  // Article type patterns (KommunalWiki)
  for (const p of ARTICLE_TYPE_PATTERNS) {
    if (p.re.test(q)) {
      filters.article_type = p.value;
      break;
    }
  }

  // Category patterns
  const categoryPatterns = [
    /\b(?:im\s+Bereich|zum\s+Thema|Kategorie|in\s+der\s+Kategorie)\s+([A-ZÄÖÜa-zäöüß][A-ZÄÖÜa-zäöüß-]+)\b/i,
    /\b(?:über|zu|betreffend)\s+([A-ZÄÖÜa-zäöüß][A-ZÄÖÜa-zäöüß-]+politik)\b/i,
  ];

  for (const re of categoryPatterns) {
    const match = q.match(re);
    if (match && match[1]) {
      filters.category = match[1];
      break;
    }
  }

  // Section patterns
  const sectionMatch = q.match(
    /\b(?:im\s+Bereich|unter)\s+(Positionen|Themen|Aktuelles|Fraktion|Presse)\b/i
  );
  if (sectionMatch && sectionMatch[1]) {
    filters.section = sectionMatch[1].toLowerCase();
  }

  return filters;
}

/**
 * Detect document scope from query - determines which collection(s) to search
 */
export function detectDocumentScope(
  query: string,
  defaultCollections: string[] = []
): DocumentScope {
  const q = (query || '').trim();
  if (!q) {
    return {
      collections: defaultCollections,
      documentTitleFilter: null,
      detectedPhrase: null,
      subcategoryFilters: {},
    };
  }

  const subcategoryFilters = detectSubcategoryFilters(q);

  for (const pattern of DOCUMENT_PATTERNS) {
    const match = q.match(pattern.re);
    if (match) {
      return {
        collections: pattern.collections,
        documentTitleFilter: pattern.titleFilter,
        detectedPhrase: match[0],
        subcategoryFilters,
      };
    }
  }

  return {
    collections: defaultCollections,
    documentTitleFilter: null,
    detectedPhrase: null,
    subcategoryFilters,
  };
}

/**
 * Create a complete QueryIntentService instance
 */
export class QueryIntentService {
  detectIntent = detectIntent;
  getContentPreferences = getContentPreferences;
  generateSearchFilters = generateSearchFilters;
  detectSubcategoryFilters = detectSubcategoryFilters;
  detectDocumentScope = detectDocumentScope;
}

export const queryIntentService = new QueryIntentService();
