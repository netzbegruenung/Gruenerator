/**
 * Text Normalization Utilities
 * Shared functions for normalizing text in search operations
 * Handles German umlauts, hyphenation, unicode subscripts, and decimal formats
 */

import {
  SUBSCRIPT_MAP,
  SUPERSCRIPT_MAP,
  SOFT_HYPHEN,
  GERMAN_CHARS,
  DASH_CHARS,
} from './constants.js';

/**
 * Fold German umlauts to ASCII equivalents
 * ä->ae, ö->oe, ü->ue, ß->ss
 */
export function foldUmlauts(s: string): string {
  if (!s) return '';

  return s
    .replace(/\u00E4/g, 'ae')
    .replace(/\u00F6/g, 'oe')
    .replace(/\u00FC/g, 'ue')
    .replace(/\u00C4/g, 'Ae')
    .replace(/\u00D6/g, 'Oe')
    .replace(/\u00DC/g, 'Ue')
    .replace(/\u00DF/g, 'ss');
}

/**
 * Normalize unicode subscript and superscript numbers to ASCII
 * Examples: CO₂ -> CO2, m² -> m2, H₂O -> H2O
 */
export function normalizeUnicodeNumbers(text: string): string {
  if (!text) return '';

  let out = text;

  // Convert subscripts
  for (const [unicode, ascii] of Object.entries(SUBSCRIPT_MAP)) {
    out = out.replace(new RegExp(unicode, 'g'), ascii);
  }

  // Convert superscripts
  for (const [unicode, ascii] of Object.entries(SUPERSCRIPT_MAP)) {
    out = out.replace(new RegExp(unicode, 'g'), ascii);
  }

  return out;
}

/**
 * Normalize a query string for robust text matching
 * - Removes soft hyphens
 * - Dehyphenates compound words
 * - Folds umlauts
 * - Lowercases
 * - Normalizes unicode numbers
 */
export function normalizeQuery(q: string): string {
  if (!q) return '';

  // Remove soft hyphens
  let out = q.replace(new RegExp(SOFT_HYPHEN, 'g'), '');

  // Dehyphenate across spaces: "Warm- ewende" -> "Warmewende"
  const dehyphenatePattern = new RegExp(
    `([${GERMAN_CHARS}])\\s*[${DASH_CHARS}]\\s*([${GERMAN_CHARS}])`,
    'g'
  );
  out = out.replace(dehyphenatePattern, '$1$2');

  // Collapse whitespace
  out = out.replace(/\s+/g, ' ').trim();

  // Normalize unicode numbers
  out = normalizeUnicodeNumbers(out);

  // Fold umlauts and lowercase
  out = foldUmlauts(out).toLowerCase();

  return out;
}

/**
 * Normalize text for comparison (similar to normalizeQuery but preserves some structure)
 */
export function normalizeText(t: string): string {
  if (!t) return '';

  let out = t.replace(new RegExp(SOFT_HYPHEN, 'g'), '');

  const dehyphenatePattern = new RegExp(
    `([${GERMAN_CHARS}])\\s*[${DASH_CHARS}]\\s*([${GERMAN_CHARS}])`,
    'g'
  );
  out = out.replace(dehyphenatePattern, '$1$2');

  out = normalizeUnicodeNumbers(out);
  out = foldUmlauts(out).toLowerCase();

  return out;
}

/**
 * Tokenize a query conservatively for fallback search
 */
export function tokenizeQuery(q: string): string[] {
  return (q || '')
    .replace(new RegExp(SOFT_HYPHEN, 'g'), '')
    .replace(new RegExp(`[^${GERMAN_CHARS}0-9\\-\\s]`, 'g'), ' ')
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Generate multiple query variants for robust text matching
 * Handles: hyphenated terms, German compounds, unicode subscripts, decimal formats
 */
export function generateQueryVariants(query: string): string[] {
  if (!query) return [];

  const variants = new Set<string>();
  const q = query.toLowerCase().trim();

  // Original query
  variants.add(q);

  // Variant: Space-separated (for "open-source" -> "open source")
  const spaceSeparated = q
    .replace(new RegExp(`[${DASH_CHARS}]`, 'g'), ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (spaceSeparated) variants.add(spaceSeparated);

  // Variant: Hyphenated (for "open source" -> "open-source")
  const hyphenated = q.replace(/\s+/g, '-');
  if (hyphenated) variants.add(hyphenated);

  // Variant: Compound/no separators (for "open source" / "open-source" -> "opensource")
  const compound = q.replace(new RegExp(`[${DASH_CHARS}\\s]`, 'g'), '');
  if (compound && compound.length >= 3) variants.add(compound);

  // Variant: Unicode normalization (CO₂ -> CO2)
  const unicodeNorm = normalizeUnicodeNumbers(q);
  if (unicodeNorm !== q) variants.add(unicodeNorm);

  // Variant: German decimal -> English decimal (1,5 -> 1.5)
  const englishDecimal = q.replace(/(\d),(\d)/g, '$1.$2');
  if (englishDecimal !== q) variants.add(englishDecimal);

  // Variant: English decimal -> German decimal (1.5 -> 1,5)
  const germanDecimal = q.replace(/(\d)\.(\d)/g, '$1,$2');
  if (germanDecimal !== q) variants.add(germanDecimal);

  // Umlaut-folded versions of all variants
  const folded = Array.from(variants)
    .map((v) => foldUmlauts(v))
    .filter(Boolean);
  folded.forEach((f) => variants.add(f));

  return Array.from(variants).filter((v) => v && v.trim().length >= 2);
}

/**
 * Levenshtein distance between two strings.
 * Used for fuzzy term matching to handle typos in search queries.
 */
export function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let curr = new Array<number>(n + 1);

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

/**
 * Check if any word in the text fuzzy-matches the query word.
 * Allows 1 edit for words ≤8 chars, 2 edits for longer words.
 * Only considers text words of similar length (±maxDist) to avoid false positives.
 */
function fuzzyWordMatch(normText: string, queryWord: string): boolean {
  const maxDist = queryWord.length > 8 ? 2 : 1;
  const minLen = queryWord.length - maxDist;
  const maxLen = queryWord.length + maxDist;

  const textWords = normText.split(/\s+/);
  for (const tw of textWords) {
    if (tw.length < minLen || tw.length > maxLen) continue;
    if (levenshteinDistance(tw, queryWord) <= maxDist) return true;
  }
  return false;
}

/**
 * Check if text contains any normalized variant of the query
 * For multi-word queries, checks if ALL words are present (not necessarily as exact phrase)
 * Falls back to fuzzy matching (Levenshtein) for single-word queries to handle typos
 */
export function containsNormalized(text: string, query: string): boolean {
  if (!query) return false;

  const normText = normalizeText(text);

  // Generate variants and check if any match as exact phrase
  const variants = generateQueryVariants(query);
  if (variants.some((v) => normText.includes(v))) {
    return true;
  }

  // For multi-word queries: check if ALL individual words are present
  const words = query
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter((w) => w.length >= 3);

  if (words.length > 1) {
    const allWordsPresent = words.every((word) => {
      const wordVariants = generateQueryVariants(word);
      return wordVariants.some((v) => normText.includes(v));
    });
    if (allWordsPresent) return true;

    // Fuzzy fallback: allow each word to fuzzy-match
    const allWordsFuzzy = words.every((word) => fuzzyWordMatch(normText, word));
    if (allWordsFuzzy) return true;
  }

  // Fuzzy fallback for single-word queries (e.g. "klimaschtz" → "klimaschutz")
  if (words.length === 1 && words[0].length >= 5) {
    if (fuzzyWordMatch(normText, words[0])) return true;
  }

  return false;
}
