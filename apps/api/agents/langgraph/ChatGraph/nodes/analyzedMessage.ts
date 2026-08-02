/**
 * Die Vorstufe der Heuristik: EINE Analyse pro Turn, plus der Läufer, der die
 * Regeln darüber auswertet.
 *
 * Warum das eine eigene Datei ist. Die Heuristik bestand aus ~25 geordneten
 * `if`-Zweigen, und jeder rechnete sich seine Sicht auf die Nachricht selbst
 * zusammen: kleinschreiben, Zitate strippen, Länge prüfen, und dann — hoffentlich
 * — den Negations-/Meta-Wächter aufrufen. „Hoffentlich" ist hier der Befund:
 * `fastPathGuards` sagt über genau diese Bauform, neun Aufrufstellen hätten sich
 * ihre Wächter je selbst gemerkt „und die, die es vergassen, waren die Türen".
 *
 * Diese Datei schliesst die Bauform. Die Sicht wird einmal gebaut
 * ({@link analyzeMessage}), und der Wächter ist keine Zeile im Regelrumpf mehr,
 * sondern ein FELD der Regel, das {@link runRules} anwendet. Eine Regel kann ihn
 * nicht mehr vergessen — sie kann ihn nur noch ausdrücklich weglassen, und das
 * steht dann als `guard: 'none'` da, wo ein Reviewer es sieht.
 *
 * Bewusst ein Blatt (nur `fastPathGuards`, selbst ein Blatt): die Regeln leben
 * bei ihren Mustern in `classifierHeuristics.ts`, der Läufer hier weiss von
 * ihnen nichts. Deshalb gibt es keinen Zyklus und die Vorstufe ist für sich
 * testbar.
 */

import { isMetaQuestionAbout, negatedOrMeta, stripQuotedSpans } from './fastPathGuards.js';

/**
 * Ab dieser Länge trägt eine Nachricht vermutlich eingefügtes Fremdmaterial
 * (Beschluss, Doku-Seite). Nomen darin ("Sharepics", "Instagram") beschreiben
 * Inhalt, sie sind nicht der Auftrag — nomen-getriebene Regeln treten dann
 * zurück und überlassen die Trennung von Anweisung und Material der LLM-Stufe.
 */
export const NOUN_TRIGGER_MAX_LENGTH = 500;

/** Die eine Sicht auf die Nachricht, die alle Regeln teilen. */
export interface AnalyzedMessage {
  /** Der Originaltext, unverändert und mit Original-Grossschreibung. */
  raw: string;
  /** Kleingeschrieben. Die Sicht für Regeln, die Zitate mitlesen dürfen. */
  lower: string;
  /**
   * Kleingeschrieben UND zitatbereinigt. Die Sicht für alles Nomen-Getriebene:
   * Text in Anführungszeichen ist wiedergegebene Rede („mein Kollege meinte:
   * ‚Erstell ein Sharepic'"), nicht der Auftrag des Nutzers.
   */
  stripped: string;
  /** Länger als {@link NOUN_TRIGGER_MAX_LENGTH}. */
  isLongPaste: boolean;
  /** Eine Tabelle hängt am Turn (Voraussetzung der beiden compute-Regeln). */
  hasTabularAttachment: boolean;
}

export function analyzeMessage(
  userContent: string,
  opts?: { hasTabularAttachment?: boolean }
): AnalyzedMessage {
  const lower = userContent.toLowerCase();
  return {
    raw: userContent,
    lower,
    stripped: stripQuotedSpans(lower),
    isLongPaste: userContent.length > NOUN_TRIGGER_MAX_LENGTH,
    hasTabularAttachment: opts?.hasTabularAttachment === true,
  };
}

/**
 * Wie eine Regel zu langen Pastes steht.
 *
 * `skip` ist der Normalfall (Nomen im Fremdmaterial sind kein Auftrag), `require`
 * hat genau eine Regel — „Schreibauftrag MIT mitgeliefertem Material" ist ohne
 * den Paste gar nicht derselbe Fall —, `allow` gehört den Regeln, deren Auslöser
 * kein Nomen ist (Rechnen zählt Zeichen eines Pastes, das ist sein Hauptzweck).
 */
export type LongPasteStance = 'skip' | 'require' | 'allow';

/**
 * Welcher Wächter vor der Regel läuft. Der Läufer wendet ihn auf `stripped` an.
 *
 * `negatedOrMeta` ist der Regelfall für ERZEUGENDE Regeln: „kein Sharepic" darf
 * keines bauen, und „Was macht ein gutes Sharepic aus?" ist eine Frage darüber,
 * kein Auftrag. `meta` ist für NACHSCHLAGENDE Regeln, bei denen der zweite Teil
 * sich umkehrt — „gibt es Fotos vom Protest?" IST die Anfrage, obwohl sie mit
 * einem Fragewort beginnt. `none` heisst: diese Regel prüft selbst (die
 * Sharepic-Regel etwa hat ihre Wächter in `hasExplicitSharepicWord`), und das
 * steht hier ausdrücklich, statt als Lücke.
 */
export type RuleGuard = 'negatedOrMeta' | 'meta' | 'none';

export interface ClassifierRule<TResult> {
  /**
   * Stabile Kennung für Logs und Journal. F1 (intern eingefroren): ein Rename
   * macht historische Entscheidungsprotokolle unlesbar — lieber ein Kommentar.
   */
  id: string;
  longPaste: LongPasteStance;
  /** Die Regel feuert nur mit Tabellen-Anhang. */
  requiresTabularAttachment?: boolean;
  guard: RuleGuard;
  /**
   * Die Nomen-Familie, gegen die der Wächter läuft. Pflicht, sobald `guard`
   * nicht `none` ist — pro Nomen-Familie, nicht global: „statt eines Posts ein
   * Sharepic" verneint den Post, nicht das Sharepic.
   */
  guardNoun?: RegExp;
  /** Trifft die Regel zu? Ohne Wächter-Logik — die macht der Läufer. */
  match(m: AnalyzedMessage): boolean;
  /** Das Ergebnis, wenn sie greift. */
  result(m: AnalyzedMessage): TResult;
}

/**
 * Die erste Regel, die greift, gewinnt — die Reihenfolge der Tabelle IST die
 * Präzedenz, und anders als bei einer `if`-Kaskade steht sie als Liste da, statt
 * über 400 Zeilen Rumpf verteilt zu sein.
 *
 * Gibt zusätzlich die Kennung der Regel zurück, damit der Aufrufer protokollieren
 * kann, WER entschieden hat. Vorher stand das nur in einem Freitext-`reasoning`.
 */
export function runRules<TResult>(
  rules: ReadonlyArray<ClassifierRule<TResult>>,
  m: AnalyzedMessage
): { rule: ClassifierRule<TResult>; result: TResult } | null {
  for (const rule of rules) {
    if (rule.longPaste === 'skip' && m.isLongPaste) continue;
    if (rule.longPaste === 'require' && !m.isLongPaste) continue;
    if (rule.requiresTabularAttachment && !m.hasTabularAttachment) continue;
    if (!rule.match(m)) continue;
    if (rule.guard !== 'none' && rule.guardNoun) {
      const blocked =
        rule.guard === 'negatedOrMeta'
          ? negatedOrMeta(m.stripped, rule.guardNoun)
          : isMetaQuestionAbout(m.stripped, rule.guardNoun);
      if (blocked) continue;
    }
    return { rule, result: rule.result(m) };
  }
  return null;
}
