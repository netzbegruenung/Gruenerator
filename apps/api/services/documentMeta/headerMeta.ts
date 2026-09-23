/**
 * Datum, Datumsart und Gremium aus dem Kopf eines hochgeladenen Dokuments.
 *
 * Rein lokal und deterministisch: kein Modell, kein Netz. Ein Datum zählt nur
 * mit einem Signalwort davor oder dahinter („Stand:", „Beschluss des … vom",
 * „Gremium, Ort, Datum", „Datum:", „tritt … in Kraft") — ein Datum im
 * Fließtext ist ein Ereignis im Text, nicht das Datum des Dokuments.
 *
 * Die Arten bleiben getrennt. Ein Statut, das am 28.06.2026 beschlossen wurde
 * und am 15.10.2026 in Kraft tritt, hat zwei Daten; wer sie zu einem
 * zusammenlegt, beantwortet eine der beiden Fragen falsch. Das Datum im
 * Dateinamen ist die schwächste Quelle (Upload-Konvention, oft das Datum des
 * Hochladens) und gewinnt nie gegen eines aus dem Text.
 */
import {
  FILENAME_DAY_PATTERNS,
  firstValidDate,
  isCalendarDate,
  toIsoDate,
  type DateParts,
} from './germanDates.js';

export const DOC_DATE_KINDS = [
  'beschluss',
  'stand',
  'published',
  'inkrafttreten',
  'filename',
] as const;
export type DocDateKind = (typeof DOC_DATE_KINDS)[number];
export type DocDatePrecision = 'day' | 'month';
export type DocMetaSource = 'heuristic' | 'llm' | 'heuristic+llm';

export interface DocDate {
  date: string;
  kind: DocDateKind;
  precision: DocDatePrecision;
  /** Die Textstelle, aus der das Datum stammt — wörtlich, Leerraum normalisiert. */
  evidence: string;
  gremium: string | null;
  gremiumRaw: string | null;
}

export interface HeaderMeta {
  date: string | null;
  dateKind: DocDateKind | null;
  precision: DocDatePrecision | null;
  gremium: string | null;
  gremiumRaw: string | null;
  /** Versions- oder Fassungsangabe des Dokuments („Fassung 3.2"). */
  docVersion: string | null;
  evidence: string | null;
  dates: DocDate[];
  /** Zwei verschiedene Beschlussdaten im Kopf. */
  conflict: boolean;
  source: DocMetaSource;
}

export type DocLocale = 'de-DE' | 'de-AT';

/** So weit liest die Heuristik. Kopf und Beschlusszeile stehen vorn. */
export const HEADER_CHARS = 5000;

/** Rangfolge für DAS Datum eines Dokuments. Inkrafttreten ist nie das Dokumentdatum. */
const PRIMARY_ORDER: readonly DocDateKind[] = ['beschluss', 'published', 'stand', 'filename'];

// ---------------------------------------------------------------------------
// Gremien
// ---------------------------------------------------------------------------

interface GremiumEntry {
  name: string;
  /** Regex-Quelltext ohne Wortgrenzen; Beugung („des Bundesvorstands") inklusive. */
  pattern: string;
}

const GEN = '(?:e?s)?';

/** Längere Namen zuerst: „Bundestagsfraktion" vor „Fraktion". */
const GREMIEN_DE: readonly GremiumEntry[] = [
  { name: 'Bundesdelegiertenkonferenz', pattern: 'Bundesdelegiertenkonferenz|BDK' },
  { name: 'Landesdelegiertenkonferenz', pattern: 'Landesdelegiertenkonferenz|LDK' },
  { name: 'Landesmitgliederversammlung', pattern: 'Landesmitgliederversammlung|LMV' },
  { name: 'Kreismitgliederversammlung', pattern: 'Kreismitgliederversammlung' },
  { name: 'Bundesvorstand', pattern: `Bundesvorstand${GEN}` },
  { name: 'Landesvorstand', pattern: `Landesvorstand${GEN}` },
  { name: 'Kreisvorstand', pattern: `Kreisvorstand${GEN}` },
  { name: 'Länderrat', pattern: `Länderrat${GEN}` },
  { name: 'Parteirat', pattern: `Parteirat${GEN}` },
  { name: 'Bundesfrauenrat', pattern: `Bundesfrauenrat${GEN}` },
  { name: 'Diversitätsrat', pattern: `Diversitätsrat${GEN}` },
  { name: 'Bundesfinanzrat', pattern: `Bundesfinanzrat${GEN}` },
  { name: 'Landesausschuss', pattern: 'Landesausschuss(?:es)?' },
  { name: 'Bundestagsfraktion', pattern: 'Bundestagsfraktion' },
  { name: 'Fraktion', pattern: 'Fraktion' },
];

const GREMIEN_AT: readonly GremiumEntry[] = [
  { name: 'Erweiterter Bundesvorstand', pattern: `Erweitert(?:e[rnms]?)\\s+Bundesvorstand${GEN}` },
  { name: 'Bundeskongress', pattern: 'Bundeskongress(?:es)?' },
  { name: 'Bundesvorstand', pattern: `Bundesvorstand${GEN}` },
  { name: 'Landesversammlung', pattern: 'Landesversammlung' },
  { name: 'Landesvorstand', pattern: `Landesvorstand${GEN}` },
];

const WORD_BEFORE = '(?<![\\wäöüÄÖÜß])';
const WORD_AFTER = '(?![\\wäöüÄÖÜß])';

function gremienFor(locale: DocLocale): readonly GremiumEntry[] {
  return locale === 'de-AT' ? GREMIEN_AT : GREMIEN_DE;
}

function gremiumSource(locale: DocLocale): string {
  return gremienFor(locale)
    .map((g) => g.pattern)
    .join('|');
}

/** Der kanonische Name zu einer Fundstelle, oder null. */
export function canonicalGremium(raw: string, locale: DocLocale): string | null {
  for (const g of gremienFor(locale)) {
    if (new RegExp(`^(?:${g.pattern})$`, 'i').test(raw.trim())) return g.name;
  }
  return null;
}

function findGremien(
  text: string,
  locale: DocLocale
): Array<{ name: string; raw: string; index: number }> {
  const re = new RegExp(`${WORD_BEFORE}(?:${gremiumSource(locale)})${WORD_AFTER}`, 'g');
  const found: Array<{ name: string; raw: string; index: number }> = [];
  for (const m of text.matchAll(re)) {
    const name = canonicalGremium(m[0], locale);
    if (name) found.push({ name, raw: m[0], index: m.index });
  }
  return found;
}

// ---------------------------------------------------------------------------
// Datumsausdrücke
// ---------------------------------------------------------------------------

const MONTH_NUMBERS: Record<string, number> = {
  januar: 1,
  jänner: 1,
  jaenner: 1,
  februar: 2,
  feber: 2,
  märz: 3,
  maerz: 3,
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
const MONTHS = Object.keys(MONTH_NUMBERS).join('|');

const DATE_SOURCE =
  `(?:\\d{4}-\\d{2}-\\d{2}` +
  `|\\d{1,2}\\s*\\.\\s*\\d{1,2}\\s*\\.\\s*(?:\\d{4}|\\d{2})(?!\\d)` +
  `|\\d{1,2}\\s*\\.\\s*(?:${MONTHS})\\s+\\d{4}` +
  `|(?:${MONTHS})\\s+\\d{4})`;

/** Jeder Datumsausdruck im Text, der als Ganzes steht (nicht Teil einer längeren Zahl). */
const DATE_RE = new RegExp(`(?<![\\d.])${DATE_SOURCE}`, 'gi');

/**
 * Ein einzelner Datumsausdruck → ISO-Tag und Genauigkeit. Monat ohne Tag wird
 * der Erste mit `precision: 'month'`.
 */
export function parseDateExpression(
  expr: string
): { date: string; precision: DocDatePrecision } | null {
  const s = expr.trim();
  let parts: DateParts | null = null;
  let precision: DocDatePrecision = 'day';

  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) parts = { year: +m[1], month: +m[2], day: +m[3] };
  if (!parts) {
    m = s.match(/^(\d{1,2})\s*\.\s*(\d{1,2})\s*\.\s*(\d{4}|\d{2})$/);
    if (m) {
      const y = +m[3];
      parts = {
        year: m[3].length === 2 ? (y > 50 ? 1900 + y : 2000 + y) : y,
        month: +m[2],
        day: +m[1],
      };
    }
  }
  if (!parts) {
    m = s.match(new RegExp(`^(\\d{1,2})\\s*\\.\\s*(${MONTHS})\\s+(\\d{4})$`, 'i'));
    if (m) parts = { year: +m[3], month: MONTH_NUMBERS[m[2].toLowerCase()] ?? 0, day: +m[1] };
  }
  if (!parts) {
    m = s.match(new RegExp(`^(${MONTHS})\\s+(\\d{4})$`, 'i'));
    if (m) {
      parts = { year: +m[2], month: MONTH_NUMBERS[m[1].toLowerCase()] ?? 0, day: 1 };
      precision = 'month';
    }
  }
  if (!parts || parts.year < 1990 || !isCalendarDate(parts)) return null;
  return { date: toIsoDate(parts), precision };
}

/** Alle Datumsausdrücke eines Texts, als ISO-Tage mit Genauigkeit. */
export function datesIn(text: string): Array<{ date: string; precision: DocDatePrecision }> {
  const out: Array<{ date: string; precision: DocDatePrecision }> = [];
  for (const m of text.matchAll(DATE_RE)) {
    const parsed = parseDateExpression(m[0]);
    if (parsed) out.push(parsed);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

/**
 * Silbentrennung am Zeilenende zusammenfügen („beschlos-\nsen"), dann jeden
 * Leerraum (auch U+00A0) zu einem Leerzeichen. Belegstellen werden gegen genau
 * diese Form geprüft.
 */
export function normalizeText(text: string): string {
  return text
    .replace(/([a-zäöüß])-[ \t\u00a0]*\r?\n[ \t\u00a0]*([a-zäöüß])/g, '$1$2')
    .replace(/[\s\u00a0]+/g, ' ')
    .trim();
}

// ---------------------------------------------------------------------------
// Signalwörter
// ---------------------------------------------------------------------------

const BEFORE_WINDOW = 160;
const AFTER_WINDOW = 60;

const STAND_BEFORE = /(?<![\wäöüß])Stand\s*(?:vom|:|\.)?\s*$/i;
const DATUM_BEFORE = /(?<![\wäöüß])(?:Datum\s*:?|veröffentlicht\s+(?:am)?)\s*$/i;
const INKRAFT_BEFORE =
  /(?<![\wäöüß])(?:Inkrafttreten|in\s+Kraft\s+(?:ab|am|seit|zum))(?![\wäöüß])/i;
const TRITT_BEFORE = /(?<![\wäöüß])tritt(?![\wäöüß])/i;
const IN_KRAFT_AFTER = /^\s*(?:\S+\s+){0,3}?in\s+Kraft(?![\wäöüß])/i;
const BESCHLUSS_WORD = /(?<![\wäöüß])(?:Beschlu(?:ss|ß)\w*|beschlossen|verabschiedet)(?![\wäöüß])/i;
const BESCHLUSS_LEAD = /(?:vom|am|den|:|,|Beschlu(?:ss|ß)\w*)\s*$/i;
const BESCHLOSSEN_AFTER = /^\s*(?:\S+\s+){0,3}?(?:beschlossen|verabschiedet)(?![\wäöüß])/i;

function gremiumOrtLead(locale: DocLocale): RegExp {
  return new RegExp(
    `${WORD_BEFORE}(?:${gremiumSource(locale)})\\s*,\\s*(?:in\\s+)?[A-ZÄÖÜ][\\wäöüß-]*(?:\\s+[A-ZÄÖÜ(][\\wäöüß().-]*){0,3}\\s*,\\s*(?:(?:am|den)\\s+)?$`
  );
}

function beschlussHeadline(locale: DocLocale): RegExp {
  return new RegExp(
    `(?<![\\wäöüß])Beschlu(?:ss|ß)\\w*\\s+(?:des|der)\\s+(?:\\S+\\s+){0,2}?(${gremiumSource(locale)})${WORD_AFTER}`,
    'i'
  );
}

interface DateHit {
  index: number;
  end: number;
  raw: string;
  date: string;
  precision: DocDatePrecision;
}

function classify(before: string, after: string, locale: DocLocale): DocDateKind | null {
  if (INKRAFT_BEFORE.test(before)) return 'inkrafttreten';
  if (TRITT_BEFORE.test(before) && IN_KRAFT_AFTER.test(after)) return 'inkrafttreten';
  if (STAND_BEFORE.test(before)) return 'stand';
  if (DATUM_BEFORE.test(before)) return 'published';
  if (gremiumOrtLead(locale).test(before)) return 'beschluss';
  if (BESCHLUSS_WORD.test(before) && BESCHLUSS_LEAD.test(before)) return 'beschluss';
  if (BESCHLOSSEN_AFTER.test(after)) return 'beschluss';
  return null;
}

function isFuture(date: string, precision: DocDatePrecision, now: Date): boolean {
  const today = toIsoDate({
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate(),
  });
  return precision === 'month' ? date.slice(0, 7) > today.slice(0, 7) : date > today;
}

function filenameDate(filename: string | null | undefined, now: Date): DocDate | null {
  if (!filename) return null;
  const base = filename.split(/[\\/]/).pop() ?? filename;
  const parts = firstValidDate([base], FILENAME_DAY_PATTERNS, now.getFullYear());
  if (!parts) return null;
  const date = toIsoDate(parts);
  if (isFuture(date, 'day', now)) return null;
  return {
    date,
    kind: 'filename',
    precision: 'day',
    evidence: base,
    gremium: null,
    gremiumRaw: null,
  };
}

const VERSION_RE = /(?<![\wäöüß])(?:Version|Fassung)\s*:?\s*(v?\d+(?:\.\d+){0,3})(?![\d])/i;

/** DAS Datum eines Dokuments aus einer Liste: Art nach Rang, dann erste Fundstelle. */
export function pickPrimary(dates: readonly DocDate[]): DocDate | null {
  for (const kind of PRIMARY_ORDER) {
    const hit = dates.find((d) => d.kind === kind);
    if (hit) return hit;
  }
  return null;
}

export function hasBeschlussConflict(dates: readonly DocDate[]): boolean {
  return new Set(dates.filter((d) => d.kind === 'beschluss').map((d) => d.date)).size > 1;
}

export function summarize(
  dates: DocDate[],
  extra: {
    gremium: string | null;
    gremiumRaw: string | null;
    docVersion: string | null;
    source: DocMetaSource;
    conflict?: boolean;
  }
): HeaderMeta {
  const primary = pickPrimary(dates);
  const gremiumDate = dates.find((d) => d.kind === 'beschluss' && d.gremium);
  const gremium = primary?.gremium ?? gremiumDate?.gremium ?? extra.gremium;
  const gremiumRaw = primary?.gremium
    ? primary.gremiumRaw
    : gremiumDate?.gremium
      ? gremiumDate.gremiumRaw
      : extra.gremiumRaw;
  return {
    date: primary?.date ?? null,
    dateKind: primary?.kind ?? null,
    precision: primary?.precision ?? null,
    gremium: gremium ?? null,
    gremiumRaw: gremiumRaw ?? null,
    docVersion: extra.docVersion,
    evidence: primary?.evidence ?? null,
    dates,
    conflict: extra.conflict ?? hasBeschlussConflict(dates),
    source: extra.source,
  };
}

export function extractHeaderMeta(
  rawText: string,
  opts: { filename?: string | null; locale?: string | null; now?: Date } = {}
): HeaderMeta {
  const locale: DocLocale = opts.locale === 'de-AT' ? 'de-AT' : 'de-DE';
  const now = opts.now ?? new Date();
  const text = normalizeText(rawText.slice(0, HEADER_CHARS));

  const hits: DateHit[] = [];
  for (const m of text.matchAll(DATE_RE)) {
    const parsed = parseDateExpression(m[0]);
    if (parsed) hits.push({ index: m.index, end: m.index + m[0].length, raw: m[0], ...parsed });
  }

  const dates: DocDate[] = [];
  hits.forEach((hit, i) => {
    // Das Fenster endet am vorigen Datum: ein Signalwort gehört dem nächsten Datum.
    const prevEnd = i > 0 ? hits[i - 1].end : 0;
    const nextStart = i + 1 < hits.length ? hits[i + 1].index : text.length;
    const beforeStart = Math.max(prevEnd, hit.index - BEFORE_WINDOW);
    const before = text.slice(beforeStart, hit.index);
    const after = text.slice(hit.end, Math.min(nextStart, hit.end + AFTER_WINDOW));

    const kind = classify(before, after, locale);
    if (!kind) return;
    if (kind !== 'inkrafttreten' && isFuture(hit.date, hit.precision, now)) return;

    let gremium: string | null = null;
    let gremiumRaw: string | null = null;
    let evidenceStart = beforeStart;
    let evidenceEnd = hit.end;
    if (kind === 'beschluss') {
      const inBefore = findGremien(before, locale).pop();
      const afterMatch = BESCHLOSSEN_AFTER.test(after) ? after : after.split(/[.;]/)[0];
      const inAfter = findGremien(afterMatch, locale)[0];
      const g = inBefore ?? inAfter;
      if (g) {
        gremium = g.name;
        gremiumRaw = g.raw;
        if (!inBefore && inAfter) evidenceEnd = hit.end + inAfter.index + inAfter.raw.length;
      }
      if (inBefore) evidenceStart = beforeStart + inBefore.index;
    }
    // Belegstelle: vom Signalwort bis zum Datum — nicht das ganze Fenster.
    const lead = text.slice(evidenceStart, hit.index);
    const cue = lead.search(
      kind === 'beschluss' && !gremium
        ? BESCHLUSS_WORD
        : kind === 'stand'
          ? /Stand/i
          : kind === 'published'
            ? /Datum|veröffentlicht/i
            : kind === 'inkrafttreten'
              ? /Inkrafttreten|in\s+Kraft|tritt/i
              : /\S/
    );
    const start = cue >= 0 ? evidenceStart + cue : evidenceStart;
    if (kind === 'inkrafttreten' && IN_KRAFT_AFTER.test(after)) {
      const m = after.match(IN_KRAFT_AFTER);
      if (m) evidenceEnd = hit.end + m[0].length;
    }
    if (kind === 'beschluss' && BESCHLOSSEN_AFTER.test(after) && evidenceEnd === hit.end) {
      const m = after.match(BESCHLOSSEN_AFTER);
      if (m) evidenceEnd = hit.end + m[0].length;
    }

    dates.push({
      date: hit.date,
      kind,
      precision: hit.precision,
      evidence: text.slice(start, evidenceEnd).trim(),
      gremium,
      gremiumRaw,
    });
  });

  const fromName = filenameDate(opts.filename, now);
  if (fromName) dates.push(fromName);

  let gremium: string | null = null;
  let gremiumRaw: string | null = null;
  const headline = text.slice(0, 600).match(beschlussHeadline(locale));
  if (headline) {
    gremium = canonicalGremium(headline[1], locale);
    gremiumRaw = gremium ? headline[1] : null;
  }

  const version = text.match(VERSION_RE);
  return summarize(dates, {
    gremium,
    gremiumRaw,
    docVersion: version ? version[1] : null,
    source: 'heuristic',
  });
}
