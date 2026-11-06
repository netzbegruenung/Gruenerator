/**
 * Wie ein Angebot des Modells in Ich-Form klingt: „Soll ich daraus …?", „Ich
 * kann dir … erstellen.", „Wenn du magst, mache ich daraus …".
 *
 * Eine Stelle für zwei Leser: `artifactOffer.ts` erkennt daran das Angebot, das
 * es für ein „ja" speichert, und der Schleifenwächter
 * (`agenticLoop/degeneration.ts`) erkennt daran ein Angebot, das sich endlos
 * wiederholt. Bewusst ohne Abhängigkeiten, weil der Wächter ein reines Modul
 * ist.
 *
 * Ein Leser-Aufruf am Ende eines Posts („Möchtest du dabei sein? Erstelle dein
 * eigenes Sharepic") ist keins: er spricht die Leser*innen an, nicht die
 * Person. Die Verb-zuerst-Formen („mache ich", „erstelle ich") kamen dazu, als
 * das Angebot freiwillig und frei formuliert wurde. Ohne sie blieb ein „Wenn du
 * magst, mache ich daraus ein Sharepic." ungespeichert, und das „ja" darauf
 * baute nichts.
 */
export const FIRST_PERSON_OFFER_RE =
  /(?<!\p{L})(?:soll(?:en)?\s+(?:ich|wir)|kann\s+ich|k[öo]nnen\s+wir|ich\s+kann|wir\s+k[öo]nnen|(?:mach|erstell|bau|gestalt)e\s+ich|ich\s+(?:mach|erstell|bau|gestalt)e\s+(?:dir|euch|ihnen))(?!\p{L})/iu;

/**
 * Ein Satz, wie man ihn liest. Drei Punkte beenden keinen:
 *  - einer direkt vor einem Buchstaben oder einer Ziffer („19.11.2026", das
 *    erste in „z.B.");
 *  - einer vor einem klein geschriebenen Wort („z.B. ein", „ggf. noch",
 *    „bzw. aus"), weil ein deutscher Satz groß beginnt;
 *  - einer nach einer Ordinalzahl („am 19. November").
 *
 * Das live gestellte Angebot „Soll ich daraus ein Sharepic … am 19.11.2026
 * erstellen?" zerfiel mit einem Trenner an jedem Punkt zu „2026 erstellen?".
 * Darin steht kein „Sharepic" mehr, und das Angebot blieb ungespeichert. Die
 * Regel zur Kleinschreibung kam mit dem Claude Review von #5410: hinter „z.B."
 * blieb sonst „Ich kann dir z.B." übrig. Eine Abkürzung vor einem
 * Großbuchstaben („Str. Eutin") trennt weiterhin. Eine Liste dafür wäre nie
 * vollständig.
 */
const SENTENCE_RE =
  /(?:[^.!?\n]|[.!?](?=[\p{L}\p{N}])|\.(?=[^\S\n]+\p{Ll})|(?<=\p{N})\.(?=[^\S\n]+\p{L}))+[.!?]*/gu;

/** Die Sätze eines Textes, mit ihrer Position (`index`). Ein Satz ohne
 *  Satzzeichen am Ende ist der noch offene Rest oder endet an einem
 *  Zeilenumbruch. */
export function sentences(text: string): RegExpExecArray[] {
  return [...text.matchAll(SENTENCE_RE)];
}
