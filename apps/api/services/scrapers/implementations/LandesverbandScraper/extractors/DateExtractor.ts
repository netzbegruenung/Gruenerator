/**
 * Date Extractor
 * Pure functions for extracting and validating dates from PDF metadata
 * Cost optimization: Extract dates BEFORE expensive Mistral OCR to skip old PDFs
 */

import type { DateExtractionResult } from '../types.js';

/**
 * Date extraction utilities
 * Static methods for parsing dates from various sources
 */
export class DateExtractor {
  /**
   * Extract date from PDF URL, title, or context string
   * Returns date, dateString, and isTooOld flag (>10 years old)
   *
   * Cost optimization: This runs BEFORE expensive Mistral OCR
   * Saved ~96% of OCR costs on test data by filtering old PDFs
   */
  static extractDateFromPdfInfo(url: string, title: string, context: string): DateExtractionResult {
    const tenYearsAgo = new Date();
    tenYearsAgo.setFullYear(tenYearsAgo.getFullYear() - 10);
    const currentYear = new Date().getFullYear();

    // Date patterns to try (in priority order)
    const patterns = [
      /(\d{4})-(\d{1,2})-(\d{1,2})/, // ISO format: 2023-05-15
      /(\d{1,2})-(\d{1,2})-(\d{4})/, // US format: 05-15-2023
      /(\d{1,2})\.(\d{1,2})\.(\d{4})/, // German format: 15.05.2023
      /(\d{1,2})_(\d{1,2})_(\d{4})/, // Underscore: 15_05_2023
      /(\d{4})_(\d{1,2})_(\d{1,2})/, // Underscore ISO: 2023_05_15
      /\b(20[0-2]\d)\b/, // Year only: 2023
      /\b(199\d)\b/, // Year only: 1990s
    ];

    // Try to extract date from URL, title, or context (in priority order)
    const texts = [url, title, context].filter(Boolean);

    for (const text of texts) {
      for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) {
          let year: number | undefined, month: number | undefined, day: number | undefined;

          if (match.length === 4) {
            // Full date with day/month/year
            if (match[1].length === 4) {
              // Format: YYYY-MM-DD or YYYY_MM_DD
              year = parseInt(match[1]);
              month = parseInt(match[2]) || 1;
              day = parseInt(match[3]) || 1;
            } else if (match[3].length === 4) {
              // Format: DD-MM-YYYY or DD.MM.YYYY or DD_MM_YYYY
              year = parseInt(match[3]);
              month = parseInt(match[2]) || 1;
              day = parseInt(match[1]) || 1;
            }
          } else if (match.length === 2) {
            // Year only - use mid-year date
            year = parseInt(match[1]);
            month = 6;
            day = 15;
          }

          // Validate year range (1990 to current year)
          if (year && year >= 1990 && year <= currentYear) {
            const date = new Date(year, (month || 1) - 1, day || 1);
            return {
              date,
              dateString: date.toISOString().split('T')[0],
              isTooOld: date < tenYearsAgo,
            };
          }
        }
      }
    }

    // No date found
    return { date: null, dateString: null, isTooOld: null };
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
   * Format date to ISO string (YYYY-MM-DD)
   */
  static toISODateString(date: Date): string {
    return date.toISOString().split('T')[0];
  }
}
