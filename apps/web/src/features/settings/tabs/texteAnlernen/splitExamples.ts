/**
 * Zerlegt einen einzigen eingefügten Block in mehrere Beispieltexte.
 *
 * Nutzer:innen sollen zehn Beispiele in EIN Feld kippen können, statt zehn
 * Felder zu befüllen. Welche Trennung sie dabei benutzen, wissen wir nicht —
 * also probieren wir die Kandidaten in absteigender Eindeutigkeit durch und
 * nehmen die erste, die überhaupt trennt. Eine Trennlinie „---" ist ein
 * bewusstes Signal, ein Doppel-Leerzeilen-Abstand nur ein wahrscheinliches;
 * deshalb gewinnt die Trennlinie, auch wenn beides im Text vorkommt.
 *
 * Einfache Leerzeilen trennen NICHT — die stehen zwischen Absätzen desselben
 * Textes.
 */

/** Der Trenner, den wir selbst schreiben (Datei-Upload, Rück-Serialisierung). */
export const EXAMPLE_SEPARATOR = '\n\n---\n\n';

export type SplitStrategy = 'rule' | 'heading' | 'numbered' | 'blank' | 'single';

export interface SplitResult {
  examples: string[];
  strategy: SplitStrategy;
}

/** Zeile aus mindestens drei Trennzeichen: `---`, `***`, `===`, `___`, `- - -`. */
const RULE_LINE = /^[ \t]*(?:[-*=_~][ \t]*){3,}$/;

/** Überschriftenzeile: „Beispiel 3", „--- Beispiel 3 ---", „## Post 2:", „Text". */
const HEADING_LINE =
  /^[ \t]*[-*=_~#]*[ \t]*(?:beispiel|example|post|text|nr\.?)[ \t]*#?[ \t]*\d{0,3}[ \t]*[.:)\]-]*[ \t]*[-*=_~#]*[ \t]*$/i;

/** Reine Aufzählungszeile: „1.", „2)". */
const NUMBERED_LINE = /^[ \t]*\d{1,3}[.)][ \t]*$/;

/** Mindestens zwei aufeinanderfolgende Leerzeilen. */
const BLANK_RUN = /\n[ \t]*\n(?:[ \t]*\n)+/;

function splitAtLines(text: string, isSeparator: (line: string) => boolean): string[] {
  const chunks: string[] = [];
  let current: string[] = [];
  for (const line of text.split('\n')) {
    if (isSeparator(line)) {
      chunks.push(current.join('\n'));
      current = [];
    } else {
      current.push(line);
    }
  }
  chunks.push(current.join('\n'));
  return chunks;
}

function clean(chunks: string[]): string[] {
  return chunks.map((c) => c.trim()).filter((c) => c.length > 0);
}

/**
 * Zerlegt den Rohtext. Liefert immer mindestens ein Beispiel, solange der Text
 * nicht leer ist — eine Zerlegung, die nur einen Treffer ergibt, gilt als „nicht
 * getrennt" und wird verworfen, damit die nächste Strategie zum Zug kommt.
 */
export function splitExamples(raw: string): SplitResult {
  const text = raw.trim();
  if (text.length === 0) return { examples: [], strategy: 'single' };

  const candidates: Array<[SplitStrategy, () => string[]]> = [
    ['rule', () => splitAtLines(text, (l) => RULE_LINE.test(l))],
    ['heading', () => splitAtLines(text, (l) => HEADING_LINE.test(l))],
    ['numbered', () => splitAtLines(text, (l) => NUMBERED_LINE.test(l))],
    ['blank', () => text.split(BLANK_RUN)],
  ];

  for (const [strategy, run] of candidates) {
    const examples = clean(run());
    if (examples.length > 1) return { examples, strategy };
  }

  return { examples: [text], strategy: 'single' };
}

/** Gegenrichtung: gespeicherte Beispiele zurück in das eine Eingabefeld. */
export function joinExamples(examples: ReadonlyArray<{ content: string }>): string {
  return examples
    .map((e) => e.content.trim())
    .filter((c) => c.length > 0)
    .join(EXAMPLE_SEPARATOR);
}

const STRATEGY_LABELS: Record<SplitStrategy, string> = {
  rule: 'an den Trennlinien',
  heading: 'an den Überschriften',
  numbered: 'an der Nummerierung',
  blank: 'an den Leerzeilen',
  single: 'ohne Trennung',
};

export function splitStrategyLabel(strategy: SplitStrategy): string {
  return STRATEGY_LABELS[strategy];
}
