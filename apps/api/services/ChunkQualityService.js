/**
 * ChunkQualityService - German-optimized quality scoring for text chunks
 *
 * Computes a composite quality score based on:
 * - Readability (German sentence/word length heuristics)
 * - Completeness (cut-off detection at boundaries)
 * - Structure (markdown features like headers, lists, code, tables)
 * - Information density (unique content ratio, numbers, entities)
 */

const { vectorConfig } = require('../config/vectorConfig.js');
const {
  detectContentType,
  detectMarkdownStructure,
} = require('../utils/contentTypeDetector.js');

class ChunkQualityService {
  /**
   * Calculate composite quality score for a text chunk
   * @param {string} text
   * @param {object} metadata optional metadata (e.g., contentType)
   * @returns {number} score in [0,1]
   */
  calculateQualityScore(text, metadata = {}) {
    if (!text || typeof text !== 'string') return 0;

    const cfg = vectorConfig.get('quality');
    const r = this.calculateReadability(text);
    const c = this.calculateCompleteness(text);
    const s = this.calculateStructureScore(text, metadata);
    const d = this.calculateInformationDensity(text);

    const raw =
      cfg.weights.readability * r +
      cfg.weights.completeness * c +
      cfg.weights.structure * s +
      cfg.weights.density * d;
    // Mild compression to reduce saturation at 1.0
    const adjusted = 0.1 + 0.85 * raw; // keep in [0.1, 0.95]
    return Math.max(0, Math.min(1, Number.isFinite(adjusted) ? adjusted : 0));
  }

  /**
   * German readability scoring based on sentence/word length
   * Prefers ~12-22 words per sentence and ~5-7 chars per word
   * @param {string} text
   * @returns {number} [0,1]
   */
  calculateReadability(text) {
    const sentences = this.#splitSentences(text);
    const words = this.#tokenize(text);

    const wordsPerSentence = sentences.length > 0 ? words.length / sentences.length : words.length;
    const avgWordLen = words.length > 0 ? words.join('').length / words.length : 0;

    // Sentence length target (German): 12-22 words ideal
    const idealWPS = 18;
    const maxDeviationWPS = 22; // acceptable deviation span
    const wpsScore = this.#boundedScore(Math.abs(wordsPerSentence - idealWPS), 0, maxDeviationWPS);

    // Word length target (German): 5-7 chars ideal
    const idealWL = 6;
    const maxDeviationWL = 6; // acceptable deviation span
    const wlScore = this.#boundedScore(Math.abs(avgWordLen - idealWL), 0, maxDeviationWL);

    // Higher is better, invert deviation-based scores
    const combined = 0.7 * (1 - wpsScore) + 0.3 * (1 - wlScore);

    // Penalize extremely long sentences (>40 words) or tiny sentences (<4 words)
    let penalty = 0;
    if (wordsPerSentence > 40) penalty += 0.2;
    if (wordsPerSentence < 4 && sentences.length > 0) penalty += 0.15;

    return Math.max(0, Math.min(1, combined - penalty));
  }

  /**
   * Completeness scoring: detect cut-off at start/end, missing punctuation
   * @param {string} text
   * @returns {number} [0,1]
   */
  calculateCompleteness(text) {
    const trimmed = (text || '').trim();
    if (!trimmed) return 0;

    const lines = trimmed.split(/\r?\n/).filter(Boolean);
    const first = lines[0] || trimmed;
    const last = lines[lines.length - 1] || trimmed;

    // Start completeness: starts with header/bullet/uppercase typical for German
    const startsWithHeader = /^\s{0,3}#{1,6}\s+/.test(first);
    const startsWithList = /^\s*[-*•]\s+/.test(first);
    const startsWithUpper = /^[A-ZÄÖÜ]"?/.test(first);
    const startScore = startsWithHeader || startsWithList || startsWithUpper ? 1 : 0.7;

    // End completeness: ends with terminal punctuation or code/list/table closure
    const endsWell = /([.!?;)\]»"”]|\.{3}|—)$/.test(last);
    const endsWithHyphenBreak = /-$/.test(last);
    const endsMidSentence = !endsWell && /[a-zäöüA-ZÄÖÜ]$/.test(last);

    let endScore = endsWell ? 1 : 0.6;
    if (endsWithHyphenBreak) endScore -= 0.3; // likely broken word at end
    if (endsMidSentence) endScore -= 0.2;
    endScore = Math.max(0, Math.min(1, endScore));

    // Additional penalty if very short trailing fragment
    if (last.split(/\s+/).length <= 3 && !endsWell) endScore = Math.max(0, endScore - 0.2);

    // If chunk is extremely short but not a header/list, reduce completeness
    const contentType = detectContentType(trimmed);
    const isStructural = contentType === 'heading' || contentType === 'list';
    const tokenCount = this.#tokenize(trimmed).length;
    const shortNonStructural = tokenCount < 6 && !isStructural;
    const base = 0.4 * startScore + 0.6 * endScore;
    return Math.max(0, Math.min(1, shortNonStructural ? base * 0.8 : base));
  }

  /**
   * Structure score based on detected markdown features/content type
   * @param {string} text
   * @param {object} metadata (may include contentType)
   * @returns {number} [0,1]
   */
  calculateStructureScore(text, metadata = {}) {
    const type = (metadata.contentType || detectContentType(text || '')).toLowerCase();
    const md = detectMarkdownStructure(text || '');

    // Baselines by type; paragraphs neutral, structured content slightly boosted
    const baseByType = {
      heading: 0.7,
      list: 0.65,
      code: 0.55,
      table: 0.6,
      paragraph: 0.55,
    };
    let score = baseByType[type] ?? 0.6;

    // Reward consistency/coherence indicators
    if (md.headers && md.headers.length > 0) score += 0.03;
    if (md.lists && md.lists > 0) score += Math.min(0.07, 0.02 * md.lists);
    if (md.tables && md.tables > 0) score += 0.03;
    if (md.codeBlocks && md.codeBlocks > 0) score += 0.02;
    if (md.blockquotes) score += 0.015;

    // Normalize and clamp
    return Math.max(0, Math.min(1, score));
  }

  /**
   * Information density via unique content ratio and numeric/entity presence
   * @param {string} text
   * @returns {number} [0,1]
   */
  calculateInformationDensity(text) {
    const tokens = this.#tokenize(text);
    if (tokens.length === 0) return 0;

    const stopwords = this.#germanStopwords();
    const contentTokens = tokens.filter(t => !stopwords.has(t));
    const unique = new Set(contentTokens);

    // Unique ratio mapped to [0,1]; clamp between 0.2..0.85 for stability
    const ratioRaw = unique.size / Math.max(1, contentTokens.length);
    const ratio = this.#normalize(ratioRaw, 0.2, 0.85);

    // Light bonuses for numbers and uppercase entities (acronyms)
    const hasNumbers = /\d/.test(text);
    const acronyms = (text.match(/\b[A-ZÄÖÜ]{2,}\b/g) || []).length;

    let score = ratio + (hasNumbers ? 0.02 : 0) + Math.min(0.05, acronyms * 0.012);
    return Math.max(0, Math.min(1, score));
  }

  // ---------- Private helpers ----------

  #splitSentences(text) {
    // Rough sentence splitter respecting German punctuation
    return (text || '')
      .replace(/\n+/g, ' ')
      .split(/(?<=[.!?])\s+(?=[A-ZÄÖÜ0-9„(])/)
      .map(s => s.trim())
      .filter(Boolean);
  }

  #tokenize(text) {
    return (text || '')
      .toLowerCase()
      .normalize('NFKC')
      .replace(/[“”„\"'’`]/g, ' ')
      .replace(/[^a-zäöüß0-9\-]+/gi, ' ')
      .split(/\s+/)
      .filter(Boolean);
  }

  #boundedScore(value, min, max) {
    if (!Number.isFinite(value)) return 1;
    if (value <= min) return 0;
    if (value >= max) return 1;
    return (value - min) / (max - min);
  }

  #normalize(value, min, max) {
    if (!Number.isFinite(value)) return 0;
    const clamped = Math.max(min, Math.min(max, value));
    return (clamped - min) / Math.max(1e-9, max - min);
  }

  #germanStopwords() {
    // Compact set to avoid heavy dependencies; extend as needed
    const list = [
      'der','die','das','ein','eine','einer','eines','einem','einen',
      'und','oder','aber','denn','sondern','doch','dass','daß','weil','wenn','als',
      'zu','zum','zur','vom','von','im','in','am','an','auf','aus','bei','mit','nach','über','unter','vor','hinter','für',
      'ist','sind','war','waren','wird','werden','hat','haben','habe','hatte','hatten',
      'ich','du','er','sie','es','wir','ihr','sie',
      'dies','diese','dieser','dieses','jenes','jede','jeder','jedes',
      'nicht','kein','keine','ohne','mehr','weniger','sehr','auch','nur','noch','schon',
      'zum','zur','ins','vom','beim','vom','zum',
      'e.g.','z.b.','bzw','etc','usw'
    ];
    return new Set(list);
  }
}

const chunkQualityService = new ChunkQualityService();

module.exports = {
  ChunkQualityService,
  chunkQualityService,
};
