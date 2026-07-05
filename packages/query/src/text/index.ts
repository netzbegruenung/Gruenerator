/**
 * Text Normalization Utilities
 *
 * Shared functions for normalizing text in search operations.
 * Handles German umlauts, hyphenation, unicode subscripts, and decimal formats.
 */

// Unicode subscript digits: 0123456789 -> 0123456789
const SUBSCRIPT_MAP: Record<string, string> = {
  '\u2080': '0',
  '\u2081': '1',
  '\u2082': '2',
  '\u2083': '3',
  '\u2084': '4',
  '\u2085': '5',
  '\u2086': '6',
  '\u2087': '7',
  '\u2088': '8',
  '\u2089': '9',
};

// Unicode superscript digits: 0123456789 -> 0123456789
const SUPERSCRIPT_MAP: Record<string, string> = {
  '\u2070': '0',
  '\u00B9': '1',
  '\u00B2': '2',
  '\u00B3': '3',
  '\u2074': '4',
  '\u2075': '5',
  '\u2076': '6',
  '\u2077': '7',
  '\u2078': '8',
  '\u2079': '9',
};

/**
 * Fold German umlauts to ASCII equivalents
 * a->ae, o->oe, u->ue, ss->ss
 * @param s - Input string
 * @returns String with umlauts folded
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
 * CO2 -> CO2, m2 -> m2, H2O -> H2O
 * @param text - Input string
 * @returns String with unicode numbers normalized
 */
export function normalizeUnicodeNumbers(text: string): string {
  if (!text) return '';
  let out = text;

  for (const [unicode, ascii] of Object.entries(SUBSCRIPT_MAP)) {
    out = out.replace(new RegExp(unicode, 'g'), ascii);
  }

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
 * @param q - Query string
 * @returns Normalized query
 */
export function normalizeQuery(q: string): string {
  if (!q) return '';
  let out = q.replace(/\u00AD/g, ''); // soft hyphen
  // dehyphenate across spaces: "Warm- ewende" -> "Warmewende"
  out = out.replace(
    /([A-Za-z\u00C4\u00D6\u00DC\u00E4\u00F6\u00FC\u00DF])\s*[-\u2013\u2014]\s*([A-Za-z\u00C4\u00D6\u00DC\u00E4\u00F6\u00FC\u00DF])/g,
    '$1$2'
  );
  // collapse whitespace
  out = out.replace(/\s+/g, ' ').trim();
  // normalize unicode numbers
  out = normalizeUnicodeNumbers(out);
  // fold umlauts and lowercase
  out = foldUmlauts(out).toLowerCase();
  return out;
}

/**
 * Normalize text for comparison (similar to normalizeQuery but preserves some structure)
 * @param t - Text to normalize
 * @returns Normalized text
 */
export function normalizeText(t: string): string {
  if (!t) return '';
  let out = t.replace(/\u00AD/g, '');
  out = out.replace(
    /([A-Za-z\u00C4\u00D6\u00DC\u00E4\u00F6\u00FC\u00DF])\s*[-\u2013\u2014]\s*([A-Za-z\u00C4\u00D6\u00DC\u00E4\u00F6\u00FC\u00DF])/g,
    '$1$2'
  );
  out = normalizeUnicodeNumbers(out);
  out = foldUmlauts(out).toLowerCase();
  return out;
}

/**
 * Tokenize a query conservatively for fallback search
 * @param q - Query string
 * @returns Array of tokens
 */
export function tokenizeQuery(q: string): string[] {
  return (q || '')
    .replace(/[\u00AD]/g, '')
    .replace(/[^A-Za-z\u00C4\u00D6\u00DC\u00E4\u00F6\u00FC\u00DF0-9\-\s]/g, ' ')
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Generate multiple query variants for robust text matching
 * Handles: hyphenated terms, German compounds, unicode subscripts, decimal formats
 * @param query - Original search query
 * @returns Array of unique query variants
 */
export function generateQueryVariants(query: string): string[] {
  if (!query) return [];
  const variants = new Set<string>();
  const q = query.toLowerCase().trim();

  // Original query
  variants.add(q);

  // Variant: Space-separated (for "open-source" -> "open source")
  const spaceSeparated = q
    .replace(/[-\u2013\u2014]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (spaceSeparated) variants.add(spaceSeparated);

  // Variant: Hyphenated (for "open source" -> "open-source")
  const hyphenated = q.replace(/\s+/g, '-');
  if (hyphenated) variants.add(hyphenated);

  // Variant: Compound/no separators (for "open source" / "open-source" -> "opensource")
  const compound = q.replace(/[-\u2013\u2014\s]/g, '');
  if (compound && compound.length >= 3) variants.add(compound);

  // Variant: Unicode normalization (CO2 -> CO2)
  const unicodeNorm = normalizeUnicodeNumbers(q);
  if (unicodeNorm !== q) variants.add(unicodeNorm);

  // Variant: German decimal -> English decimal (1,5 -> 1.5)
  const englishDecimal = q.replace(/(\d),(\d)/g, '$1.$2');
  if (englishDecimal !== q) variants.add(englishDecimal);

  // Variant: English decimal -> German decimal (1.5 -> 1,5)
  const germanDecimal = q.replace(/(\d)\.(\d)/g, '$1,$2');
  if (germanDecimal !== q) variants.add(germanDecimal);

  // Umlaut-folded versions of all variants
  const folded = [...variants].map((v) => foldUmlauts(v)).filter(Boolean);
  folded.forEach((f) => variants.add(f));

  return [...variants].filter((v) => v && v.trim().length >= 2);
}

/**
 * Check if text contains any normalized variant of the query
 * For multi-word queries, checks if ALL words are present (not necessarily as exact phrase)
 * @param text - Text to search in
 * @param query - Query to search for
 * @returns True if query/all words are found
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
  }

  return false;
}
