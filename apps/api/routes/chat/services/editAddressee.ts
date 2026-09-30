/**
 * Die Bausteine, die jede Bearbeitungs-Weiche (Sharepic, Social-Post, Reel)
 * braucht, bevor sie einen Turn an sich zieht: einen ADRESSATEN und ein Verb,
 * das wirklich am Nomen steht.
 *
 * Beta-Audit 30.09.2026: jede der drei Weichen fragte nur „gibt es im Thread
 * irgendwo so ein Artefakt?" und dann nach einem Verb und einem Nomen irgendwo
 * in der Nachricht. So wurde „Schreib mir drei Ideen für Reels" Tage nach
 * einem Reel zur Untertitel-Bearbeitung und „Zeig mir den Text des
 * Beschlusses" zur Sharepic-Bearbeitung.
 *
 * Blatt ohne schwere Importe, damit Klassifikator und Router es teilen.
 */

/** Die Artefakte, die eine Bearbeitungs-Weiche im Chat ändern kann. */
export type EditableArtifact = 'sharepic' | 'social_post' | 'reel' | 'image';

/**
 * Welche Werkzeug-Schritte ein Artefakt BAUEN oder BEARBEITEN. Die Bearbeitungen
 * stehen mit drin: eine Sharepic- oder Post-Korrektur speichert nur ihren Schritt
 * und keine neuen Varianten — ohne sie bräche die zweite Korrektur in Folge
 * („Zeile 2 kürzer", dann „und grüner") am Adressaten ab. `reel_picker` zählt,
 * weil die Auswahl ausdrücklich um eine zweite Nachricht zum Reel bittet.
 */
const EDITABLE_BY_TOOL: Readonly<Record<string, EditableArtifact>> = {
  sharepic: 'sharepic',
  sharepic_edit: 'sharepic',
  social_post: 'social_post',
  social_post_edit: 'social_post',
  reel_edit: 'reel',
  reel_processing: 'reel',
  reel_picker: 'reel',
};

/**
 * Was der Assistenz-Turn DIREKT vor diesem gebaut oder bearbeitet hat.
 *
 * Eine Liste statt eines Schalters pro Art: `last_tool_context` und
 * `chat_thread_reels` sind beide Dauerzustand — sie überschreibt erst das
 * nächste Artefakt —, und die Frage „kam das gerade eben?" stellt jede Weiche
 * gleich. Die Schritte genügen: Reel und Post tauchen in `lastTurnArtifacts()`
 * gar nicht auf (die Artefakt-Liste kennt nur Bild, Sharepic, Dokumente),
 * und das Sharepic steht dort nur, wenn sein `sharepic`-Schritt Varianten trägt.
 */
export function priorTurnEditables(
  artifacts: ReadonlyArray<{ kind: string }>,
  steps: ReadonlyArray<{ toolName: string; result?: Record<string, unknown>; ok?: false }>
): EditableArtifact[] {
  const found = new Set<EditableArtifact>();
  for (const a of artifacts) {
    if (a.kind === 'sharepic' || a.kind === 'image') found.add(a.kind);
  }
  for (const step of steps) {
    const kind = EDITABLE_BY_TOOL[step.toolName];
    if (kind && producedSomething(step)) found.add(kind);
  }
  return [...found];
}

/**
 * Hat der Schritt wirklich etwas gebaut? Ein abgelehntes Sharepic speichert
 * seinen Schritt trotzdem — mit `{ variants: [] }`, weil der Turn eine
 * Absage-Antwort trägt —, und ohne diese Prüfung machte er den NÄCHSTEN Turn
 * zum Adressaten des alten Sharepics („Kürz den Text" über eine
 * Pressemitteilung). Dieselben Kriterien wie die Leser der Artefakte:
 * `artifactFromMessageMetadata` (Varianten) und `findSocialPost` (`postId` +
 * Text). Die Bearbeitungs-Dienste speichern ihren Schritt nur bei Erfolg.
 */
function producedSomething(step: {
  toolName: string;
  result?: Record<string, unknown>;
  ok?: false;
}): boolean {
  if (step.ok === false) return false;
  const r = step.result;
  if (step.toolName === 'sharepic') return Array.isArray(r?.variants) && r.variants.length > 0;
  if (step.toolName === 'social_post') return r?.postId != null && typeof r.text === 'string';
  return true;
}

/** Die Stelle, an der ein Muster greift — Anfang und Ende im Text. */
interface Span {
  start: number;
  end: number;
  word: string;
}

function spans(text: string, pattern: RegExp): Span[] {
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
  return [...text.matchAll(new RegExp(pattern.source, flags))].map((m) => ({
    start: m.index ?? 0,
    end: (m.index ?? 0) + m[0].length,
    word: m[0],
  }));
}

/**
 * Steht ein Verb am Nomen — im selben Satz und höchstens `maxGap` Zeichen
 * davon, in beiden Wortstellungen („mach den Text kürzer", „Zeile 2 kürzer")?
 *
 * „Irgendwo in der Nachricht" war die Regel bis zum Beta-Audit 30.09.2026, und
 * sie paarte Wörter aus verschiedenen Sätzen. `accept` darf ein Paar noch
 * ablehnen (etwa ein schwaches Verb an einem Allerweltsnomen).
 */
export function verbNearNoun(
  text: string,
  verb: RegExp,
  noun: RegExp,
  opts: { maxGap?: number; accept?: (verb: string, noun: string, clause: string) => boolean } = {}
): boolean {
  const maxGap = opts.maxGap ?? 30;
  const verbs = spans(text, verb);
  if (verbs.length === 0) return false;
  const nouns = spans(text, noun);
  for (const v of verbs) {
    for (const n of nouns) {
      const gap =
        v.end <= n.start
          ? text.slice(v.end, n.start)
          : n.end <= v.start
            ? text.slice(n.end, v.start)
            : '';
      if (gap.length > maxGap || /[.!?\n]/.test(gap)) continue;
      if (
        opts.accept &&
        !opts.accept(v.word, n.word, clauseAround(text, Math.min(v.start, n.start)))
      ) {
        continue;
      }
      return true;
    }
  }
  return false;
}

/** Der Satz, in dem die Stelle `at` steht. */
function clauseAround(text: string, at: number): string {
  const before = text.slice(0, at);
  const start =
    Math.max(
      before.lastIndexOf('.'),
      before.lastIndexOf('!'),
      before.lastIndexOf('?'),
      before.lastIndexOf('\n')
    ) + 1;
  const rest = text.slice(at);
  const endRel = rest.search(/[.!?\n]/);
  return text.slice(start, endRel < 0 ? text.length : at + endRel);
}

// Frage ÜBER das Bearbeiten statt Auftrag dazu: „Wie mache ich gute Reels?",
// „Was sind gute Untertitel für Instagram?". Die höfliche Bitte in Frageform
// („Kannst du die Überschrift kürzen?") beginnt nicht mit einem Fragewort und
// bleibt ein Auftrag; „Wie wäre es mit einem anderen Bild?" ist ein Vorschlag
// und bleibt es ebenfalls.
const HOW_TO_QUESTION_RE =
  /^\s*(?:und\s+)?(?:was|wie|wer|warum|wieso|weshalb|welche[rsnm]?|wann|wo|woran|wodurch|gibt\s+es)(?!\p{L})(?!\s+w(?:ä|ae)re?\s+es|\s+w(?:ä|ae)r'?s)/iu;

/** Eine Frage über das Artefakt oder das Bearbeiten, kein Auftrag. */
export function isQuestionAboutEditing(text: string): boolean {
  return text.includes('?') && HOW_TO_QUESTION_RE.test(text);
}
