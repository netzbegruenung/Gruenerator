/**
 * Ergebnis einer Beratung in einem festen Wortschatz, damit der Filter in
 * beiden Landtagen dieselben Werte hat. Ein Protokollabschnitt kann mehrere
 * Ergebnisse tragen (Antrag abgelehnt, Entschließungsantrag angenommen).
 */

export const ERGEBNISSE = ['angenommen', 'abgelehnt', 'überwiesen'] as const;
export type Ergebnis = (typeof ERGEBNISSE)[number];

const ORDER = new Map<Ergebnis, number>(ERGEBNISSE.map((e, i) => [e, i]));

/** Ohne Dubletten, in der Reihenfolge von {@link ERGEBNISSE}. */
export function sortedErgebnisse(values: Iterable<Ergebnis>): Ergebnis[] {
  return [...new Set(values)].sort((a, b) => ORDER.get(a)! - ORDER.get(b)!);
}
