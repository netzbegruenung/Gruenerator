/**
 * QueryIntentService - Detects query intent (German/English) and suggests filters
 */

import { vectorConfig } from '../../config/vectorConfig.js';
import { getDefaultMultiCollectionIds } from '../../config/systemCollectionsConfig.js';
import type {
  IntentDetectionResult,
  IntentType,
  Language,
  ContentPreferences,
  QdrantFilter,
  SubcategoryFilters,
  DocumentScope,
  IntentPattern,
  DocumentScopePattern,
} from './types.js';

class QueryIntentService {
  /**
   * Analyze a query and return intent info
   * @param query - User query to analyze
   * @returns Intent detection result
   */
  detectIntent(query: string): IntentDetectionResult {
    const q = (query || '').trim();
    if (!q) return { type: 'unknown', language: 'unknown', confidence: 0 };

    const lang = this.#detectLanguage(q);
    const lower = q.toLowerCase();

    // German patterns
    const patterns: readonly IntentPattern[] = [
      { type: 'definition', re: /^(was ist|was bedeutet|definiere)\b/i },
      { type: 'howto', re: /^(wie|wie kann|anleitung|schritte|so geht)\b/i },
      { type: 'factual', re: /^(wer|was|wann|wo|wieviel|wieviel|wie viele)\b/i },
      { type: 'comparison', re: /(vs\.?|vergleich|unterschiede|gegenüberstellung)/i },
      { type: 'legal', re: /(§|paragraph|gesetz|verordnung|richtlinie|stgb|bgb)\b/i },
      { type: 'list', re: /(liste|auflistung|punkte|stichpunkte)\b/i },
      { type: 'table', re: /(tabelle|tabellarisch)\b/i },
      { type: 'code', re: /(code|beispielcode|snippet)\b/i },
      { type: 'summary', re: /(zusammenfassung|kurzfassung|tl;dr)/i },
      { type: 'timeline', re: /(chronologie|zeitverlauf|timeline)\b/i },
    ];

    let match = patterns.find(p => p.re.test(q));
    if (!match) {
      // English fallback (basic)
      const en: readonly IntentPattern[] = [
        { type: 'definition', re: /^(what is|define)\b/i },
        { type: 'howto', re: /^(how to|how do|steps)\b/i },
        { type: 'comparison', re: /(vs\.?|difference|compare)\b/i },
        { type: 'legal', re: /(law|regulation|directive|article)\b/i },
        { type: 'list', re: /(list|bullets)\b/i },
        { type: 'table', re: /(table|tabular)\b/i },
        { type: 'code', re: /(code|snippet|example)\b/i },
        { type: 'summary', re: /(summary|tl;dr)/i },
      ];
      match = en.find(p => p.re.test(q));
    }

    const type = match ? match.type : 'general';
    const confidence = match ? 0.8 : 0.5;
    const keywords = this.#extractKeywords(lower);

    return { type, language: lang, confidence, keywords, flags: { hasNumbers: /\d/.test(q) } };
  }

  /**
   * Map intent type to content-type preferences
   * @param intentType - Detected intent type
   * @returns Content preferences with types and boost factors
   */
  getContentPreferences(intentType: string): ContentPreferences {
    const mapping: Record<string, ContentPreferences> = {
      definition: { preferredTypes: ['heading', 'paragraph'], boost: { heading: 1.2 } },
      howto: { preferredTypes: ['list', 'paragraph'], boost: { list: 1.3 } },
      factual: { preferredTypes: ['paragraph', 'table'], boost: { table: 1.1 } },
      comparison: { preferredTypes: ['table', 'list'], boost: { table: 1.3, list: 1.1 } },
      legal: { preferredTypes: ['paragraph', 'heading'], boost: { paragraph: 1.2 } },
      list: { preferredTypes: ['list', 'heading'], boost: { list: 1.4 } },
      table: { preferredTypes: ['table', 'paragraph'], boost: { table: 1.5 } },
      code: { preferredTypes: ['code', 'list'], boost: { code: 1.6 } },
      summary: { preferredTypes: ['paragraph', 'heading'], boost: { paragraph: 1.2 } },
      timeline: { preferredTypes: ['list', 'paragraph'], boost: { list: 1.2 } },
      general: { preferredTypes: ['paragraph', 'heading'], boost: {} },
    };
    return mapping[intentType] || mapping.general;
  }

  /**
   * Create Qdrant filters based on intent
   * @param intent - Detected intent result
   * @returns Qdrant filter structure
   */
  generateSearchFilters(intent: IntentDetectionResult): QdrantFilter {
    const prefs = this.getContentPreferences(intent?.type || 'general');
    const filter: QdrantFilter = { must: [], should: [] };

    // Prefer content types via should clauses; keep must minimal to avoid zero results
    if (prefs.preferredTypes?.length) {
      filter.should = prefs.preferredTypes.map(t => ({ key: 'content_type', match: { value: t } }));
    }

    // Language hint (heuristic); only apply as should
    if (intent?.language === 'de') {
      filter.should.push({ key: 'lang', match: { value: 'de' } });
    } else if (intent?.language === 'en') {
      filter.should.push({ key: 'lang', match: { value: 'en' } });
    }

    return filter;
  }

  /**
   * Detect subcategory filters from natural language query
   * @param query - User query
   * @returns Extracted subcategory filters
   */
  detectSubcategoryFilters(query: string): SubcategoryFilters {
    const q = (query || '').trim();
    if (!q) return {};

    const filters: SubcategoryFilters = {};

    // Article type patterns (KommunalWiki)
    const articleTypePatterns = [
      { re: /\b(nur\s+)?(Literatur|Bücher)\b/i, value: 'literatur' },
      { re: /\b(nur\s+)?(Praxishilfe|Praxishilfen)\b/i, value: 'praxishilfe' },
      { re: /\b(nur\s+)?(FAQ|Fragen)\b/i, value: 'faq' },
      { re: /\b(nur\s+)?Personalien\b/i, value: 'personalien' },
      { re: /\b(nur\s+)?Sachgebiet(e)?\b/i, value: 'sachgebiet' },
      { re: /\b(nur\s+)?(Artikel|Beiträge)\b/i, value: 'artikel' }
    ];

    for (const p of articleTypePatterns) {
      if (p.re.test(q)) {
        filters.article_type = p.value;
        break;
      }
    }

    // Category patterns - extract from "im Bereich X", "zum Thema X", "Kategorie X"
    const categoryPatterns = [
      /\b(?:im\s+Bereich|zum\s+Thema|Kategorie|in\s+der\s+Kategorie)\s+([A-ZÄÖÜa-zäöüß][A-ZÄÖÜa-zäöüß-]+)\b/i,
      /\b(?:über|zu|betreffend)\s+([A-ZÄÖÜa-zäöüß][A-ZÄÖÜa-zäöüß-]+politik)\b/i
    ];

    for (const re of categoryPatterns) {
      const match = q.match(re);
      if (match && match[1]) {
        filters.category = match[1];
        break;
      }
    }

    // Section patterns (for bundestag, gruene-de, gruene-at)
    const sectionPatterns = [
      { re: /\b(?:im\s+Bereich|unter)\s+(Positionen|Themen|Aktuelles|Fraktion|Presse)\b/i, field: 'section' }
    ];

    for (const p of sectionPatterns) {
      const match = q.match(p.re);
      if (match && match[1]) {
        filters.section = match[1].toLowerCase();
        break;
      }
    }

    return filters;
  }

  /**
   * Detect document scope from query - determines which collection(s) and document(s) to search
   * @param query - User query
   * @returns Document scope with collections and filters
   */
  detectDocumentScope(query: string): DocumentScope {
    const q = (query || '').trim();
    if (!q) {
      return {
        collections: getDefaultMultiCollectionIds(),
        documentTitleFilter: null,
        detectedPhrase: null,
        subcategoryFilters: {}
      };
    }

    // Detect subcategory filters first
    const subcategoryFilters = this.detectSubcategoryFilters(q);

    const docPatterns: readonly DocumentScopePattern[] = [
      {
        re: /\b(im\s+)?Grundsatzprogramm(\s+2020)?\b/i,
        collections: ['grundsatz-system'],
        titleFilter: 'Grundsatzprogramm 2020'
      },
      {
        re: /\b(im\s+)?(EU[\s-]?Wahlprogramm|Europawahlprogramm)(\s+2024)?\b/i,
        collections: ['grundsatz-system'],
        titleFilter: 'EU-Wahlprogramm 2024'
      },
      {
        re: /\b(im\s+)?Regierungsprogramm(\s+2025)?\b/i,
        collections: ['grundsatz-system'],
        titleFilter: 'Regierungsprogramm 2025'
      },
      {
        re: /\b((in\s+den\s+)?(Grundsatz)?programmen|Grundsatzprogramme)\b/i,
        collections: ['grundsatz-system'],
        titleFilter: null
      },
      {
        re: /\b(Bundestags?fraktion|gruene-?bundestag|grüne-?bundestag)\b/i,
        collections: ['bundestagsfraktion-system'],
        titleFilter: null
      },
      {
        re: /\b(KommunalWiki|Kommunalwiki|kommunalwiki)\b/i,
        collections: ['kommunalwiki-system'],
        titleFilter: null
      },
      {
        re: /\b(gruene\.de|grüne\.de)\b/i,
        collections: ['gruene-de-system'],
        titleFilter: null
      },
      {
        re: /\b(gruene\.at|grüne\.at|Grüne\s+Österreich)\b/i,
        collections: ['gruene-at-system'],
        titleFilter: null
      },
      {
        re: /\b(satzung|satzungen|kreisverband|ortsverband)\b/i,
        collections: ['satzungen-system'],
        titleFilter: null
      }
    ];

    for (const pattern of docPatterns) {
      const match = q.match(pattern.re);
      if (match) {
        return {
          collections: pattern.collections,
          documentTitleFilter: pattern.titleFilter,
          detectedPhrase: match[0],
          subcategoryFilters
        };
      }
    }

    return {
      collections: getDefaultMultiCollectionIds(),
      documentTitleFilter: null,
      detectedPhrase: null,
      subcategoryFilters
    };
  }

  // ----- helpers -----

  /**
   * Detect language from query text
   */
  #detectLanguage(q: string): Language {
    const hasGerman = /[äöüß]/i.test(q) || /(der|die|das|und|ist|nicht|mit|für|auf|ein|eine)\b/i.test(q);
    const hasEnglish = /(the|and|is|with|for|on|in|of)\b/i.test(q);
    if (hasGerman && !hasEnglish) return 'de';
    if (hasEnglish && !hasGerman) return 'en';
    return 'unknown';
  }

  /**
   * Extract keywords from lowercased query
   */
  #extractKeywords(lower: string): string[] {
    return lower
      .replace(/[^a-zäöüß0-9\s-]/gi, ' ')
      .split(/\s+/)
      .filter(t => t.length > 2)
      .slice(0, 10);
  }
}

const queryIntentService = new QueryIntentService();

export { QueryIntentService, queryIntentService };
