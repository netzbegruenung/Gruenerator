/**
 * Text Normalization Utilities
 *
 * Shared functions for normalizing text in search operations.
 * Handles German umlauts, hyphenation, unicode subscripts, and decimal formats.
 */

// Unicode subscript digits: ₀₁₂₃₄₅₆₇₈₉ → 0123456789
const SUBSCRIPT_MAP = {
  '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4',
  '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9'
};

// Unicode superscript digits: ⁰¹²³⁴⁵⁶⁷⁸⁹ → 0123456789
const SUPERSCRIPT_MAP = {
  '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4',
  '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9'
};

/**
 * Fold German umlauts to ASCII equivalents
 * ä→ae, ö→oe, ü→ue, ß→ss
 * @param {string} s - Input string
 * @returns {string} String with umlauts folded
 */
export function foldUmlauts(s) {
  if (!s) return s || '';
  return s
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue')
    .replace(/Ä/g, 'Ae').replace(/Ö/g, 'Oe').replace(/Ü/g, 'Ue')
    .replace(/ß/g, 'ss');
}

/**
 * Normalize unicode subscript and superscript numbers to ASCII
 * CO₂ → CO2, m² → m2, H₂O → H2O
 * @param {string} text - Input string
 * @returns {string} String with unicode numbers normalized
 */
export function normalizeUnicodeNumbers(text) {
  if (!text) return text || '';
  let out = text;

  // Replace subscript digits
  for (const [unicode, ascii] of Object.entries(SUBSCRIPT_MAP)) {
    out = out.replace(new RegExp(unicode, 'g'), ascii);
  }

  // Replace superscript digits
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
 * @param {string} q - Query string
 * @returns {string} Normalized query
 */
export function normalizeQuery(q) {
  if (!q) return '';
  let out = q.replace(/\u00AD/g, ''); // soft hyphen
  // dehyphenate across spaces: "Wärm- ewende" → "Wärmewende"
  out = out.replace(/([A-Za-zÄÖÜäöüß])\s*[-–—]\s*([A-Za-zÄÖÜäöüß])/g, '$1$2');
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
 * @param {string} t - Text to normalize
 * @returns {string} Normalized text
 */
export function normalizeText(t) {
  if (!t) return '';
  let out = t.replace(/\u00AD/g, '');
  out = out.replace(/([A-Za-zÄÖÜäöüß])\s*[-–—]\s*([A-Za-zÄÖÜäöüß])/g, '$1$2');
  out = normalizeUnicodeNumbers(out);
  out = foldUmlauts(out).toLowerCase();
  return out;
}

/**
 * Tokenize a query conservatively for fallback search
 * @param {string} q - Query string
 * @returns {Array<string>} Array of tokens
 */
export function tokenizeQuery(q) {
  return (q || '')
    .replace(/[\u00AD]/g, '')
    .replace(/[^A-Za-zÄÖÜäöüß0-9\-\s]/g, ' ')
    .split(/\s+/)
    .map(s => s.trim())
    .filter(Boolean);
}

/**
 * Generate multiple query variants for robust text matching
 * Handles: hyphenated terms, German compounds, unicode subscripts, decimal formats
 * @param {string} query - Original search query
 * @returns {Array<string>} Array of unique query variants
 */
export function generateQueryVariants(query) {
  if (!query) return [];
  const variants = new Set();
  const q = query.toLowerCase().trim();

  // Original query
  variants.add(q);

  // Variant: Space-separated (for "open-source" → "open source")
  const spaceSeparated = q.replace(/[-–—]/g, ' ').replace(/\s+/g, ' ').trim();
  if (spaceSeparated) variants.add(spaceSeparated);

  // Variant: Hyphenated (for "open source" → "open-source")
  const hyphenated = q.replace(/\s+/g, '-');
  if (hyphenated) variants.add(hyphenated);

  // Variant: Compound/no separators (for "open source" / "open-source" → "opensource")
  const compound = q.replace(/[-–—\s]/g, '');
  if (compound && compound.length >= 3) variants.add(compound);

  // Variant: Unicode normalization (CO₂ → CO2)
  const unicodeNorm = normalizeUnicodeNumbers(q);
  if (unicodeNorm !== q) variants.add(unicodeNorm);

  // Variant: German decimal → English decimal (1,5 → 1.5)
  const englishDecimal = q.replace(/(\d),(\d)/g, '$1.$2');
  if (englishDecimal !== q) variants.add(englishDecimal);

  // Variant: English decimal → German decimal (1.5 → 1,5)
  const germanDecimal = q.replace(/(\d)\.(\d)/g, '$1,$2');
  if (germanDecimal !== q) variants.add(germanDecimal);

  // Umlaut-folded versions of all variants
  const folded = [...variants].map(v => foldUmlauts(v)).filter(Boolean);
  folded.forEach(f => variants.add(f));

  return [...variants].filter(v => v && v.trim().length >= 2);
}

/**
 * Check if text contains any normalized variant of the query
 * @param {string} text - Text to search in
 * @param {string} query - Query to search for
 * @returns {boolean} True if any variant is found
 */
export function containsNormalized(text, query) {
  if (!query) return false;
  const normText = normalizeText(text);

  // Generate variants and check if any match
  const variants = generateQueryVariants(query);
  return variants.some(v => normText.includes(v));
}
