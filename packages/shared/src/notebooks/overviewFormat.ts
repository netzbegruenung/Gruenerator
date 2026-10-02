/**
 * Wording and number formatting of the notebook overview (`/notebook/collections/:id/overview`),
 * shared by web's Übersicht page and mobile's notebook hub so both read the same German.
 * Pure — no React, no DOM.
 */

const nf = new Intl.NumberFormat('de-DE');

export const formatOverviewCount = (value: number): string => nf.format(value);

/** A share in [0, 1] as „14 %“. */
export const formatOverviewShare = (share: number): string => `${Math.round(share * 100)} %`;

/** A `YYYY-MM` bucket as „Sep. 26“ (short) or „September 2026“ (long). */
export function formatOverviewMonth(month: string, style: 'short' | 'long' = 'short'): string {
  const [y, m] = month.split('-').map(Number);
  return new Intl.DateTimeFormat('de-DE', {
    month: style,
    year: style === 'short' ? '2-digit' : 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(y, m - 1, 1)));
}

/** A publication date as „Sep. 2026“, or „–“ when missing or unparseable. */
export function formatOverviewDate(value: string | null): string {
  if (!value) return '–';
  const t = Date.parse(value);
  if (!Number.isFinite(t)) return '–';
  return new Intl.DateTimeFormat('de-DE', { month: 'short', year: 'numeric' }).format(t);
}

/** Detail line under „Neu in 30 Tagen“. */
export function overviewNewDocsDetail(last: number, previous: number): string {
  const diff = last - previous;
  if (diff === 0) return 'so viele wie in den 30 Tagen davor';
  return `${diff > 0 ? '+' : '−'}${nf.format(Math.abs(diff))} gegenüber den 30 Tagen davor`;
}

/** Lemmas arrive lower-cased; German nouns read wrong that way. */
export const overviewNounCase = (word: string): string =>
  word.charAt(0).toUpperCase() + word.slice(1);

/** Subtitle of the term card: how many documents the keywords cover. */
export function overviewTermCoverage(termDocuments: number, documents: number): string {
  const coverage =
    termDocuments < documents
      ? `${nf.format(termDocuments)} von ${nf.format(documents)} Dokumenten`
      : `${nf.format(termDocuments)} Dokumenten`;
  return `Häufigste Schlagwörter aus ${coverage}`;
}

/** Footer of the term card, explaining whichever comparison lists are shown; `null` for none. */
export function overviewTermNotes(terms: {
  signature: readonly unknown[] | null;
  rising: readonly unknown[];
}): string | null {
  const notes = [
    (terms.signature ?? []).length > 0 &&
      '„Typisch hier“ vergleicht mit allen anderen Landesverbänden, getrennt nach Partei- und Fraktionstexten.',
    terms.rising.length > 0 &&
      '„Im Aufwind“ vergleicht die letzten 90 Tage mit den zwölf Monaten davor.',
  ].filter(Boolean);
  return notes.length > 0 ? notes.join(' ') : null;
}
