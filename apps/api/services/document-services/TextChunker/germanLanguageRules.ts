/**
 * German language rules for text chunking
 * Defines abbreviations and sentence boundary detection rules
 */

/**
 * German abbreviations that should NOT end sentences
 * Used for accurate sentence boundary detection
 */
export const GERMAN_ABBREVIATIONS = new Set([
  'bzw', 'z.b', 'z.B', 'etc', 'usw', 'ggf', 'ca', 'Prof', 'Dr', 'Hr', 'Fr',
  'Abs', 'Art', 'Nr', 'Tel', 'Fax', 'E-Mail', 'e.V', 'GmbH', 'AG', 'Ltd',
  'Inc', 'Co', 'Corp', 'kg', 'mg', 'km', 'cm', 'mm', 'm²', 'qm', 'min',
  'max', 'zzgl', 'inkl', 'exkl', 'evtl', 'i.d.R', 'u.a', 'o.ä', 'o.g',
  'sog', 'bzw', 'ggf', 'z.T', 'z.Z', 'z.Zt'
]);

/**
 * Check if a word is a German abbreviation
 */
export function isGermanAbbreviation(word: string): boolean {
  return GERMAN_ABBREVIATIONS.has(word) ||
         GERMAN_ABBREVIATIONS.has(word.replace(/\./g, ''));
}

/**
 * Check if text after punctuation indicates a sentence boundary
 * Returns true if the next character suggests a new sentence
 */
export function isNewSentenceStart(afterPunctuation: string): boolean {
  if (!afterPunctuation) return false;

  // New sentence typically starts with capital letter, number, or quote
  return /^[A-ZÄÖÜ0-9„(]/.test(afterPunctuation);
}

/**
 * Check if text after punctuation suggests continuation
 * Returns true if the next character is lowercase (likely continuation)
 */
export function isContinuation(afterPunctuation: string): boolean {
  return !!afterPunctuation && /^[a-zäöüß]/.test(afterPunctuation);
}

/**
 * German-aware separators for text splitting
 * Ordered by priority (most important first)
 */
export const GERMAN_SEPARATORS = [
  '\n\n',      // Paragraph breaks
  '. ',        // Sentence end with space
  '? ',        // Question with space
  '! ',        // Exclamation with space
  '; ',        // Semicolon
  ': ',        // Colon
  ', ',        // Comma
  '\n',        // Line break
  ' '          // Space (last resort)
];
