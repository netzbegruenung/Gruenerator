/**
 * Entwürfe, deren Länge `rechnen` in diesem Zug gezählt hat.
 *
 * Bei einer Längenvorgabe will das Modell seinen Text nachzählen. Bis 11/2026
 * schrieb es ihn dafür ins Argument von `rechnen` — und Mistral streamt
 * Werkzeugargumente nicht: ein Gastbeitrag kostete ~44 s Stille, und endete der
 * Zug danach, stand der Artikel nur im Argument, nie in der Antwort. Jetzt
 * schreibt das Modell den Entwurf als Antwort und zählt ihn per Verweis: der
 * Entwurf ist der Text seit dem Start des letzten Werkzeugaufrufs.
 *
 * Schreibt es danach eine zweite Fassung und zählt auch die, ist die erste
 * überholt: `withoutSuperseded` schneidet sie am Ende aus der Antwort, damit
 * die Person nicht zwei Artikel untereinander bekommt.
 */
export interface DraftLedger {
  /** Text seit dem letzten Werkzeugstart; merkt sich seinen Bereich. */
  take(): string;
  /** Antwort ohne alle gezählten Entwürfe außer dem letzten, oder `null`, wenn
   *  nichts zu schneiden ist oder die Antwort inzwischen eine andere ist. */
  withoutSuperseded(answer: string): string | null;
}

interface Range {
  start: number;
  end: number;
}

export function createDraftLedger(
  answer: () => string,
  /** Textpositionen, an denen die bisher aufgezeichneten Werkzeugaufrufe starteten. */
  toolStarts: () => ReadonlyArray<number | undefined>
): DraftLedger {
  const ranges: Range[] = [];
  let countedPrefix = '';

  return {
    take() {
      const text = answer();
      const lastEnd = ranges.at(-1)?.end ?? 0;
      const lastToolStart = Math.max(0, ...toolStarts().map((o) => o ?? 0));
      const start = Math.min(text.length, Math.max(lastEnd, lastToolStart));
      ranges.push({ start, end: text.length });
      countedPrefix = text;
      return text.slice(start);
    },
    withoutSuperseded(text) {
      if (ranges.length < 2 || !text.startsWith(countedPrefix)) return null;
      let out = text;
      for (const r of ranges.slice(0, -1).reverse()) {
        out = out.slice(0, r.start) + out.slice(r.end);
      }
      return out.trimStart();
    },
  };
}
