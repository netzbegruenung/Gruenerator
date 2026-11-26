/**
 * Zählen statt schätzen: wie oft kommt nach einem festen Text welcher Wert vor?
 *
 * „Wer schreibt wie viel auf kommunal.de?" ist eine Zählung über die ganze
 * Seite. Das Modell hat sie bis 11/2026 im Kopf über einen Ausschnitt gemacht
 * und sich dabei verzählt bzw. die Hälfte nicht gesehen (#6103). Hier zählt der
 * Server, deterministisch und über den vollständigen Text.
 *
 * Bewusst KEIN Regex: das Muster käme vom Modell, und ein JavaScript-Regex
 * lässt sich nicht abbrechen — ein katastrophales Backtracking auf einer
 * fremden Seite hielte den Prozess fest. Ein wörtlicher Anker plus „Rest der
 * Zeile" deckt Autorenzeilen („von X"), Felder („Kategorie: X") und
 * Aufzählungen ab und kann nicht ausufern.
 */

/** Ein Wert ist der Zeilenrest hinter dem Anker, höchstens so lang. Länger ist
 *  es kein Wert mehr, sondern ein Satz. */
const MAX_VALUE_CHARS = 80;

export interface TallyOptions {
  /** Groß/klein beim Anker beachten (Standard: nein). */
  caseSensitive?: boolean | undefined;
  /** Nur Anker am Zeilenanfang — „von " als Autorenzeile, nicht „von 80 Prozent" im Fließtext. */
  lineStart?: boolean | undefined;
}

export interface Tally {
  /** Alle gezählten Vorkommen. */
  total: number;
  /** Wert → Anzahl, absteigend; gleich häufige in der Reihenfolge des ersten Auftretens. */
  counts: Array<{ value: string; count: number }>;
}

export function tallyAfter(text: string, anchor: string, opts: TallyOptions = {}): Tally {
  const haystack = opts.caseSensitive ? text : text.toLowerCase();
  const needle = opts.caseSensitive ? anchor : anchor.toLowerCase();
  const counts = new Map<string, number>();
  let total = 0;
  if (!needle) return { total, counts: [] };

  for (let at = haystack.indexOf(needle); at !== -1; at = haystack.indexOf(needle, at + 1)) {
    if (opts.lineStart) {
      const lineBegin = text.lastIndexOf('\n', at - 1) + 1;
      if (text.slice(lineBegin, at).trim() !== '') continue;
    }
    const start = at + anchor.length;
    const lineEnd = text.indexOf('\n', start);
    const value = text
      .slice(start, lineEnd === -1 ? undefined : lineEnd)
      .trim()
      .replace(/\s+/g, ' ');
    if (!value || value.length > MAX_VALUE_CHARS) continue;
    total += 1;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return {
    total,
    counts: [...counts.entries()]
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count),
  };
}
