/**
 * QueryIntentService - Detects query intent (German/English) and suggests filters
 */

const { vectorConfig } = require('../config/vectorConfig.js');

class QueryIntentService {
  /**
   * Analyze a query and return intent info
   * @param {string} query
   * @returns {{type:string, language:string, confidence:number, keywords?:string[], flags?:object}}
   */
  detectIntent(query) {
    const q = (query || '').trim();
    if (!q) return { type: 'unknown', language: 'unknown', confidence: 0 };

    const lang = this.#detectLanguage(q);
    const lower = q.toLowerCase();

    // German patterns
    const patterns = [
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
      const en = [
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
   * @param {string} intentType
   * @returns {{preferredTypes:string[], boost:{[key:string]:number}}}
   */
  getContentPreferences(intentType) {
    const mapping = {
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
   * @param {{type:string, language:string}} intent
   * @returns {{must?:Array, should?:Array, must_not?:Array}}
   */
  generateSearchFilters(intent) {
    const prefs = this.getContentPreferences(intent?.type || 'general');
    const filter = { must: [], should: [] };

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
   * Detect document scope from query - determines which collection(s) and document(s) to search
   * @param {string} query
   * @returns {{collections: string[], documentTitleFilter: string|null, detectedPhrase: string|null}}
   */
  detectDocumentScope(query) {
    const q = (query || '').trim();
    if (!q) {
      return { collections: ['grundsatz-system', 'bundestagsfraktion-system'], documentTitleFilter: null, detectedPhrase: null };
    }

    const docPatterns = [
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
      }
    ];

    for (const pattern of docPatterns) {
      const match = q.match(pattern.re);
      if (match) {
        return {
          collections: pattern.collections,
          documentTitleFilter: pattern.titleFilter,
          detectedPhrase: match[0]
        };
      }
    }

    return { collections: ['grundsatz-system', 'bundestagsfraktion-system'], documentTitleFilter: null, detectedPhrase: null };
  }

  // ----- helpers -----
  #detectLanguage(q) {
    const hasGerman = /[äöüß]/i.test(q) || /(der|die|das|und|ist|nicht|mit|für|auf|ein|eine)\b/i.test(q);
    const hasEnglish = /(the|and|is|with|for|on|in|of)\b/i.test(q);
    if (hasGerman && !hasEnglish) return 'de';
    if (hasEnglish && !hasGerman) return 'en';
    return 'unknown';
  }

  #extractKeywords(lower) {
    return lower
      .replace(/[^a-zäöüß0-9\s-]/gi, ' ')
      .split(/\s+/)
      .filter(t => t.length > 2)
      .slice(0, 10);
  }
}

const queryIntentService = new QueryIntentService();

module.exports = {
  QueryIntentService,
  queryIntentService,
};

