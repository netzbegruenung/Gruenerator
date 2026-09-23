/**
 * Date Extractor
 * Pure functions for extracting and validating dates from PDF metadata
 * Cost optimization: Extract dates BEFORE expensive Mistral OCR to skip old PDFs
 */

import type { DateExtractionResult, DatePrecision } from '../types.js';

const GERMAN_MONTHS: Record<string, number> = {
  januar: 1,
  februar: 2,
  märz: 3,
  maerz: 3,
  marz: 3,
  april: 4,
  mai: 5,
  juni: 6,
  juli: 7,
  august: 8,
  september: 9,
  oktober: 10,
  november: 11,
  dezember: 12,
};

const GERMAN_MONTH_PATTERN =
  /(\d{1,2})\.\s*(Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)\s+(\d{4})/i;

const SLUG_MONTH =
  'januar|februar|maerz|marz|märz|april|mai|juni|juli|august|september|oktober|november|dezember';

interface DateParts {
  year: number;
  month: number;
  day: number;
}

interface DatePattern {
  re: RegExp;
  parse: (m: RegExpMatchArray) => DateParts;
}

const ymd = (m: RegExpMatchArray): DateParts => ({
  year: parseInt(m[1]),
  month: parseInt(m[2]),
  day: parseInt(m[3]),
});
const dmy = (m: RegExpMatchArray): DateParts => ({
  year: parseInt(m[3]),
  month: parseInt(m[2]),
  day: parseInt(m[1]),
});
const monthName = (name: string): number => GERMAN_MONTHS[name.toLowerCase()] ?? 0;

// Full dates, in priority order.
const DAY_PATTERNS: DatePattern[] = [
  { re: /(\d{4})-(\d{1,2})-(\d{1,2})/, parse: ymd }, // 2023-05-15
  {
    // 15-05-2023; 12-13-2025 can only be month-day and must not roll over into 2026
    re: /(\d{1,2})-(\d{1,2})-(\d{4})/,
    parse: (m) => {
      const parts = dmy(m);
      return parts.month > 12 && parts.day <= 12
        ? { ...parts, month: parts.day, day: parts.month }
        : parts;
    },
  },
  { re: /(\d{1,2})\.(\d{1,2})\.(\d{4})/, parse: dmy }, // 15.05.2023
  { re: /(\d{1,2})_(\d{1,2})_(\d{4})/, parse: dmy }, // 15_05_2023
  { re: /(\d{4})_(\d{1,2})_(\d{1,2})/, parse: ymd }, // 2023_05_15
  { re: GERMAN_MONTH_PATTERN, parse: (m) => ({ ...dmy(m), month: monthName(m[2]) }) }, // 24. Mai 2025
];

// Only in a file name or URL slug: compact forms that would misfire in prose.
const FILENAME_DAY_PATTERNS: DatePattern[] = [
  ...DAY_PATTERNS,
  { re: /(?<!\d)((?:19|20)\d{2})(\d{2})(\d{2})(?!\d)/, parse: ymd }, // 20230905_…
  {
    // Leading YYMMDD token, no separators inside it: BE-F dlm-downloads name
    // their files 250117_Positionspapier….pdf / 180828_Beschluss….pdf.
    re: /^(\d{2})(\d{2})(\d{2})(?=[_-])/,
    parse: (m) => ({ year: 2000 + parseInt(m[1]), month: parseInt(m[2]), day: parseInt(m[3]) }),
  },
  {
    // Year first, as SL names its files: 22-02-17-wahlprogramm = 2022-02-17
    re: /^(\d{2})-(\d{2})-(\d{2})(?!\d)/,
    parse: (m) => ({ ...ymd(m), year: 2000 + parseInt(m[1]) }),
  },
  {
    re: new RegExp(`(?:^|[-_])(\\d{1,2})-(${SLUG_MONTH})-(\\d{4})(?!\\d)`, 'i'), // 12-oktober-2024
    parse: (m) => ({ ...dmy(m), month: monthName(m[2]) }),
  },
];

// Context only. Two-digit day and month, so "Az. 1.2.10" is no date; global
// so an impossible first match does not hide a valid later one.
const SHORT_YEAR_PATTERN: DatePattern = {
  re: /(?<![\d.])(\d{2})\.(\d{2})\.(\d{2})(?![\d.])/g, // 26.03.22
  parse: (m) => ({ ...dmy(m), year: 2000 + parseInt(m[3]) }),
};

// URL only. The upload month is an upper bound (files are often uploaded
// long after the Parteitag), so it ranks below the archive folder — and a
// slug month after it is a target date (kommunalwahl-mai-2024), not the
// publication.
const FOLDER_MONTH_PATTERN: DatePattern = {
  re: /\/((?:19|20)\d{2})-(\d{1,2})\//, // /2022-03/
  parse: (m) => ({ ...ymd(m), day: 1 }),
};
const SLUG_MONTH_PATTERN: DatePattern = {
  re: new RegExp(`(?:^|[-_/])(${SLUG_MONTH})-(\\d{4})(?!\\d)`, 'i'), // september-2022
  parse: (m) => ({ year: parseInt(m[2]), month: monthName(m[1]), day: 1 }),
};
const UPLOAD_MONTH_PATTERN: DatePattern = {
  re: /\/uploads\/(?:sites\/\d+\/)?(\d{4})\/(\d{1,2})\//,
  parse: (m) => ({ ...ymd(m), day: 1 }),
};

// Year-only fallbacks. A year in a slug or file name is often a TARGET year
// (Landtagswahl 2026, `_2024_im_Blick`), so the URL's folder year goes first.
const URL_YEAR_PATTERN: DatePattern = {
  re: /\/((?:19|20)\d{2})\//,
  parse: (m) => ({ year: parseInt(m[1]), month: 6, day: 15 }),
};
const YEAR_PATTERNS: DatePattern[] = [
  /_(20[0-2]\d)_/, // Year between underscores: LDK_2023_Potsdam (\b never matches next to _, a word char)
  /\b(20[0-2]\d)\b/, // Year only: 2023
  /\b(199\d)\b/, // Year only: 1990s
].map((re) => ({ re, parse: (m) => ({ year: parseInt(m[1]), month: 6, day: 15 }) }));

const PDF_FILENAME = /[^\s|/]+\.pdf/gi;

/**
 * Date extraction utilities
 * Static methods for parsing dates from various sources
 */
export class DateExtractor {
  /**
   * Extract date from PDF URL, title, or context string
   * Returns date, dateString, isTooOld flag (> maxAgeYears old) and precision.
   *
   * Signal order: file-name day date > day date in URL/title/context >
   * archive folder or slug month > upload month > year only. A year alone
   * still yields YYYY-06-15 (null would turn the PDF into a `no_date` skip on
   * paths without processUndatedPdfs) but is marked `precision: 'year'`.
   *
   * Cost optimization: This runs BEFORE expensive Mistral OCR
   * Saved ~96% of OCR costs on test data by filtering old PDFs
   */
  static extractDateFromPdfInfo(
    url: string,
    title: string,
    context: string,
    maxAgeYears: number
  ): DateExtractionResult {
    const texts = [url, title, context].filter(Boolean);
    const fileNames = [
      url.split(/[?#]/)[0].replace(/\/$/, '').split('/').pop() ?? '',
      ...Array.from(`${title} ${context}`.matchAll(PDF_FILENAME), (m) => m[0]),
    ].filter(Boolean);
    const upload = this.#firstMatch([url], [UPLOAD_MONTH_PATTERN], 'month');
    const slugMonth = this.#firstMatch([url], [SLUG_MONTH_PATTERN], 'month');
    const slugMonthBeforeUpload =
      slugMonth &&
      (!upload || slugMonth.year * 12 + slugMonth.month <= upload.year * 12 + upload.month)
        ? slugMonth
        : null;

    const found =
      this.#firstMatch(fileNames, FILENAME_DAY_PATTERNS, 'day') ??
      this.#firstMatch(texts, DAY_PATTERNS, 'day') ??
      // DD.MM.YY (BB headings: "Landesdelegiertenkonferenz am 26.03.22:")
      this.#firstMatch([context], [SHORT_YEAR_PATTERN], 'day') ??
      this.#firstMatch([url], [FOLDER_MONTH_PATTERN], 'month') ??
      slugMonthBeforeUpload ??
      upload ??
      this.#firstMatch([url], [URL_YEAR_PATTERN], 'year') ??
      this.#firstMatch(texts, YEAR_PATTERNS, 'year');

    if (!found) return { date: null, dateString: null, isTooOld: null, precision: null };

    const { year, month, day, precision } = found;
    const date = new Date(year, month - 1, day);
    // Build the string from the parsed fields, not via toISOString():
    // the Date is local midnight, so the UTC round-trip shifts it to
    // the previous day on any timezone east of UTC.
    const mm = String(month).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    return {
      date,
      dateString: `${year}-${mm}-${dd}`,
      isTooOld: this.isDateTooOld(date, maxAgeYears),
      precision,
    };
  }

  static #firstMatch(
    texts: string[],
    patterns: DatePattern[],
    precision: DatePrecision
  ): (DateParts & { precision: DatePrecision }) | null {
    const currentYear = new Date().getFullYear();
    for (const text of texts) {
      for (const { re, parse } of patterns) {
        const matches = re.global ? Array.from(text.matchAll(re)) : [text.match(re)];
        for (const match of matches) {
          if (!match) continue;
          const parts = parse(match);
          // Validate year range (1990 to current year) and reject impossible
          // days instead of letting Date roll 31.02. over into March.
          if (parts.year < 1990 || parts.year > currentYear) continue;
          const date = new Date(parts.year, parts.month - 1, parts.day);
          if (date.getMonth() !== parts.month - 1 || date.getDate() !== parts.day) continue;
          return { ...parts, precision };
        }
      }
    }
    return null;
  }

  /**
   * Check if a date is older than a threshold
   * Default threshold: 10 years
   */
  static isDateTooOld(date: Date, yearsThreshold: number = 10): boolean {
    const threshold = new Date();
    threshold.setFullYear(threshold.getFullYear() - yearsThreshold);
    return date < threshold;
  }

  /**
   * Parse date from various string formats
   * Returns null if parsing fails
   */
  static parseDate(dateString: string): Date | null {
    try {
      const date = new Date(dateString);
      if (!isNaN(date.getTime())) {
        return date;
      }
    } catch {
      return null;
    }
    return null;
  }

  /**
   * Parse a German short date (dd.mm.yyyy) — the format LV listing teasers print
   * in their date label (e.g. the hessengruen theme's `.zeit`). `parseDate`
   * (new Date(...)) can't read dd.mm.yyyy, so date-aware pagination needs this.
   * Tolerates surrounding whitespace/text; returns null on miss so callers fall back.
   */
  static parseGermanDate(text: string): Date | null {
    const match = text.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
    if (!match) return null;
    const day = parseInt(match[1], 10);
    const month = parseInt(match[2], 10);
    const year = parseInt(match[3], 10);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const date = new Date(year, month - 1, day);
    return isNaN(date.getTime()) ? null : date;
  }

  /**
   * Format date to ISO string (YYYY-MM-DD)
   */
  static toISODateString(date: Date): string {
    return date.toISOString().split('T')[0];
  }
}
