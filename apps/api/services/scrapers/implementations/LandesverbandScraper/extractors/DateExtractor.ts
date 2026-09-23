/**
 * Date Extractor
 * Pure functions for extracting and validating dates from PDF metadata
 * Cost optimization: Extract dates BEFORE expensive Mistral OCR to skip old PDFs
 */

import {
  DAY_PATTERNS,
  FILENAME_DAY_PATTERNS,
  SLUG_MONTH,
  dmy,
  firstValidDate,
  monthName,
  ymd,
  type DateParts,
  type DatePattern,
} from '../../../../documentMeta/germanDates.js';

import type { DateExtractionResult, DatePrecision } from '../types.js';

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

  /**
   * Wolke share files (#3564): only a literal day date in the file name is a
   * real signal. `extractDateFromPdfInfo` falls back to a bare year or a slug
   * month when no day pattern matches — a mention like "Wahlpruefsteine 2021
   * BUND.pdf" or a target year like "Landtagswahl-2026-Programm.pdf" would
   * otherwise read as a (wrong) publish date. `maxAgeYears` doesn't matter
   * here — callers ignore `isTooOld` for Wolke files — so a fixed value is
   * enough.
   */
  static extractWolkeFileNameDate(
    fileName: string
  ): Pick<DateExtractionResult, 'dateString' | 'precision'> {
    const result = this.extractDateFromPdfInfo(fileName, fileName, '', 10);
    return result.precision === 'day'
      ? { dateString: result.dateString, precision: result.precision }
      : { dateString: null, precision: null };
  }

  static #firstMatch(
    texts: string[],
    patterns: DatePattern[],
    precision: DatePrecision
  ): (DateParts & { precision: DatePrecision }) | null {
    // Year range 1990 to the current year; impossible days (31.02.) rejected
    // instead of letting Date roll them over into March.
    const parts = firstValidDate(texts, patterns);
    return parts ? { ...parts, precision } : null;
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
