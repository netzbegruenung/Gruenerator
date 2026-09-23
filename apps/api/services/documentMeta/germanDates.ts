/**
 * Deutsche Datumsmuster — geteilt von den Landesverband-Scrapern
 * (`DateExtractor`, `ContentExtractor`) und der Kopfzeilen-Erkennung für
 * hochgeladene Dokumente (`headerMeta.ts`).
 *
 * Aus dem Scraper-Baum hierher gehoben, ohne Verhalten zu ändern: die Scraper
 * importieren genau diese Tabellen, `germanDates.vitest.ts` hält das fest.
 */

export const GERMAN_MONTHS: Record<string, number> = {
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

export const GERMAN_MONTH_NAMES =
  'Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember';

export const GERMAN_MONTH_PATTERN = new RegExp(
  `(\\d{1,2})\\.\\s*(${GERMAN_MONTH_NAMES})\\s+(\\d{4})`,
  'i'
);

export const SLUG_MONTH =
  'januar|februar|maerz|marz|märz|april|mai|juni|juli|august|september|oktober|november|dezember';

export interface DateParts {
  year: number;
  month: number;
  day: number;
}

export interface DatePattern {
  re: RegExp;
  parse: (m: RegExpMatchArray) => DateParts;
}

export const ymd = (m: RegExpMatchArray): DateParts => ({
  year: parseInt(m[1]),
  month: parseInt(m[2]),
  day: parseInt(m[3]),
});
export const dmy = (m: RegExpMatchArray): DateParts => ({
  year: parseInt(m[3]),
  month: parseInt(m[2]),
  day: parseInt(m[1]),
});
export const monthName = (name: string): number => GERMAN_MONTHS[name.toLowerCase()] ?? 0;

// Full dates, in priority order.
export const DAY_PATTERNS: DatePattern[] = [
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
export const FILENAME_DAY_PATTERNS: DatePattern[] = [
  ...DAY_PATTERNS,
  { re: /(?<!\d)((?:19|20)\d{2})(\d{2})(\d{2})(?!\d)/, parse: ymd }, // 20230905_…
  {
    // Leading YYMMDD token, no separators inside it: BE-F dlm-downloads name
    // their files 250117_Positionspapier….pdf / 180828_Beschluss….pdf.
    // Genuinely ambiguous for a leading YYYYMM from 2001-2012: e.g. "200106_…"
    // reads as 2020-01-06 here, but "2001"+"06" (June 2001, YYYYMM) is an
    // equally valid parse of the same six digits — only when the middle two
    // digits (our month) fall in 01-12 does "20" + that pair form a real
    // alternate year. No confirmed BE-F case uses YYYYMM, so this stays
    // YYMMDD until one does.
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

/** Ein echter Kalendertag — 31.02. rollt nicht still in den März. */
export function isCalendarDate({ year, month, day }: DateParts): boolean {
  const date = new Date(year, month - 1, day);
  return date.getMonth() === month - 1 && date.getDate() === day;
}

/**
 * Der erste gültige Treffer über Texte × Muster, in dieser Reihenfolge. Gültig
 * heisst: Jahr zwischen 1990 und `maxYear` (Standard: das laufende Jahr) und
 * ein echter Kalendertag.
 */
export function firstValidDate(
  texts: readonly string[],
  patterns: readonly DatePattern[],
  maxYear: number = new Date().getFullYear()
): DateParts | null {
  for (const text of texts) {
    for (const { re, parse } of patterns) {
      const matches = re.global ? Array.from(text.matchAll(re)) : [text.match(re)];
      for (const match of matches) {
        if (!match) continue;
        const parts = parse(match);
        if (parts.year < 1990 || parts.year > maxYear) continue;
        if (!isCalendarDate(parts)) continue;
        return parts;
      }
    }
  }
  return null;
}

/** YYYY-MM-DD aus den Feldern — nie über `toISOString()` (Zeitzonen-Versatz). */
export function toIsoDate({ year, month, day }: DateParts): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Normalize German date formats (DD.MM.YY or DD.MM.YYYY) to ISO (YYYY-MM-DD).
 * Passes through already-ISO strings unchanged.
 */
export function normalizeGermanDate(dateStr: string): string {
  const trimmed = dateStr.trim();

  // German long-form text month (e.g., "21. Mai 2026"). Some TYPO3 sites
  // (gruene-fraktion-bayern.de) render the publish date this way with no
  // <time>/datetime markup.
  const textMonthMatch = trimmed.match(GERMAN_MONTH_PATTERN);
  if (textMonthMatch) {
    const months: Record<string, string> = {
      januar: '01',
      februar: '02',
      märz: '03',
      april: '04',
      mai: '05',
      juni: '06',
      juli: '07',
      august: '08',
      september: '09',
      oktober: '10',
      november: '11',
      dezember: '12',
    };
    const day = textMonthMatch[1].padStart(2, '0');
    const month = months[textMonthMatch[2].toLowerCase()];
    const year = textMonthMatch[3];
    if (month) return `${year}-${month}-${day}`;
  }

  // DD.MM.YYYY (e.g., "19.02.2026"). Try the 4-digit year first so that
  // "02.04.2026" doesn't get partially matched as DD.MM.YY ("02.04.20").
  // The (?!\d) lookahead prevents capturing a 4-digit year as a 2-digit one.
  const longMatch = trimmed.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})(?!\d)/);
  if (longMatch) {
    const day = longMatch[1].padStart(2, '0');
    const month = longMatch[2].padStart(2, '0');
    const year = longMatch[3];
    return `${year}-${month}-${day}`;
  }

  // DD.MM.YY (e.g., "19.02.26"). Pivot at 50: 00-50 is 20xx, 51-99 is 19xx —
  // none of our sources predate 1951, and this keeps a stray "29.04.99" from
  // landing in the future as 2099.
  const shortMatch = trimmed.match(/(\d{1,2})\.(\d{1,2})\.(\d{2})(?!\d)/);
  if (shortMatch) {
    const day = shortMatch[1].padStart(2, '0');
    const month = shortMatch[2].padStart(2, '0');
    const yy = parseInt(shortMatch[3], 10);
    const year = yy > 50 ? 1900 + yy : 2000 + yy;
    return `${year}-${month}-${day}`;
  }

  // Already ISO or other format — pass through
  return trimmed;
}
