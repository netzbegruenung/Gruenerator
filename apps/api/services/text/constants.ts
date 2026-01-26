/**
 * Text Processing Constants
 */

/**
 * Unicode subscript digits mapping: ₀₁₂₃₄₅₆₇₈₉ -> 0123456789
 */
export const SUBSCRIPT_MAP: Record<string, string> = {
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
} as const;

/**
 * Unicode superscript digits mapping: ⁰¹²³⁴⁵⁶⁷⁸⁹ -> 0123456789
 */
export const SUPERSCRIPT_MAP: Record<string, string> = {
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
} as const;

/**
 * German characters for text normalization patterns
 */
export const GERMAN_CHARS = 'A-Za-z\u00C4\u00D6\u00DC\u00E4\u00F6\u00FC\u00DF';

/**
 * Unicode dash characters (hyphen, en-dash, em-dash)
 */
export const DASH_CHARS = '\\-\u2013\u2014';

/**
 * Soft hyphen character (invisible hyphen used for word breaking)
 */
export const SOFT_HYPHEN = '\u00AD';
