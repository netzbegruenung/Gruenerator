/**
 * "Soll dieser Turn ein Artefakt erzeugen — und welches?"
 *
 * The last decision the 27k-character Tier-4 prompt was still being paid for.
 * Measured over the 166-turn corpus after the default inversion, the turns that
 * still reached it were almost entirely two shapes:
 *
 *   - creation orders the rule table missed because a conversation penalty had
 *     already pushed them under the confidence threshold ("Mach daraus ein
 *     Sharepic", "Leg das als neues Dokument an", "Speicher das bitte als
 *     Dokument"), and
 *   - summarise/shorten orders carrying their own material, where the honest
 *     answer is "no artifact at all".
 *
 * Both are the same question with a closed answer space, which is what makes
 * ~900 characters enough where the tool taxonomy was not. Same shape as
 * `sourceScopeResolver` and `docsIntentTiebreak`: hard timeout,
 * the `standard` intermediate stage, the existing `chat_intent_classification`
 * task, and `null`
 * for anything unusable.
 *
 * `keine` and `null` are DIFFERENT answers, exactly as in `sourceScopeResolver`:
 *   - `keine` — the model decided, and the decision is "no artifact". The turn
 *     is a `produktion` answer and needs no further tier.
 *   - `null` — timeout, failure, unparseable. Nothing was decided, so the turn
 *     carries on to Tier 4 as before.
 * Collapsing the two would turn every provider hiccup into a routing change.
 *
 * The answer space holds ARTIFACT-disposition kinds only. Anchor intents
 * (`modify_doc`, `edit_current_doc`, `edit_current_board`, `image_edit`) are
 * deliberately absent: they need a resolved TARGET, which Tier 1/2 supplies from
 * the editor surface and the thread. A resolver naming them without one would
 * produce an edit with nothing to edit — the live failure `resolveEditTarget`
 * exists for.
 */

import { aiText } from '../../../../services/ai/generate.js';
import { createLogger } from '../../../../utils/logger.js';
import { withTimeout } from '../../../../utils/withTimeout.js';

import type { ChatIntentId } from '@gruenerator/shared/chat-intents';

const log = createLogger('ChatGraph:GenerationScope');

/** Same order of magnitude as the other two resolvers. */
/**
 * 1500 ms statt 900. Gemessen antwortet der Auflöser in ~310 ms; blieb der
 * Primär-Provider aber einmal leer, kostete allein die Fallback-Kette 906 ms und
 * riss damit ein 900-ms-Budget — der Auflöser lieferte still `null`, und der
 * Turn zahlte den 27k-Prompt. Ein Zeitbudget, das keinen einzigen Fallback-
 * Sprung verträgt, macht den Auflöser von der Tagesform eines Anbieters
 * abhängig; die zusätzliche knappe Sekunde ist gegen die Alternative billig.
 */
const RESOLVE_TIMEOUT_MS = 1500;

/**
 * 16 statt 8 Token, weil 8 gemessen nicht reichten: das Modell schreibt einen
 * kurzen Vorspann, wird bei `finish_reason=length` gekappt, und die Antwort gilt
 * als LEER — worauf die volle Fallback-Kette anläuft. Der Parser nimmt das
 * Antwortwort ohnehin an beliebiger Stelle, ein Vorspann schadet also nicht.
 */
/**
 * German answer words → intent. German because the prompt is German and models
 * hit a native word far more reliably than a snake_case identifier; the map is
 * the price, and it is closed and `satisfies`-checked, so a renamed intent fails
 * the build rather than silently never matching.
 */
const KIND_TO_INTENT = {
  dokument: 'save_as_doc',
  sharepic: 'sharepic',
  bild: 'image',
  tabelle: 'create_sheet',
  praesentation: 'create_presentation',
  // Beide Schreibweisen: das Modell antwortet natürlich mit Umlaut, obwohl der
  // Prompt die ASCII-Form vorgibt. Nur die vorgegebene zu kennen hiess, dieses
  // Verdikt immer zu verwerfen und den 27k-Prompt trotzdem zu zahlen.
  präsentation: 'create_presentation',
  pdf: 'create_pdf',
  diagramm: 'chart',
  // `social: 'social_post'` stand hier, bis das Verdikt 08/2026 stillgelegt
  // wurde. Ein Social-Post ist kein ARTEFAKT — er entsteht nicht neben der
  // Antwort, er IST die Antwort. Das Wort ist deshalb auch aus dem Prompt
  // unten gestrichen: bliebe es dort, antwortete das Modell weiter „social"
  // und der Parser verwürfe es als unbekannt — ein bezahlter Aufruf ohne
  // Ergebnis.
} as const satisfies Record<string, ChatIntentId>;

export type GenerationKind = keyof typeof KIND_TO_INTENT;

/** A decided "no artifact", as distinct from `null` = nothing was decided. */
export type GenerationVerdict = { intent: ChatIntentId } | 'keine';

/**
 * Does this turn look like it could be about producing something?
 *
 * A GATE, not a classifier — the same division of labour `managedSourceTrigger`
 * spells out. Recall is what matters here: a false positive costs one ~900-
 * character call and then lands exactly where it would have landed anyway (the
 * resolver answers `keine`, the turn continues to Tier 4). A false negative
 * costs the 27k prompt. So the verbs are deliberately generous and the nouns
 * deliberately plain.
 *
 * Two things are deliberately ABSENT, and both were measured rather than
 * guessed:
 *  - the polysemous verbs `mach`/`bau`/`leg`/`sicher`. They caught EDIT turns
 *    ("Mach das Foto heller", "Mach den Text größer") that this resolver has no
 *    answer for by construction — its answer space holds no anchor intent — so
 *    it would have resolved them to "no artifact" and eaten the edit. The
 *    artifact NOUNS carry the whole creation work-list anyway ("Mach daraus ein
 *    Sharepic", "Leg das als neues Dokument an").
 *  - conversely, the condense verbs (`fass … zusammen`, `kürze`, `prüfe`) ARE
 *    here even though nothing is being generated. They are the single largest
 *    group still reaching the big prompt, and "zusammenfassen" is genuinely
 *    ambiguous — "fass zusammen und leg es als Dokument ab" is one order. The
 *    resolver settling them on `keine` is the point, not a side effect.
 *
 * `\p{L}` lookarounds with the `u` flag rather than `\b`: without `u`, "ä" is
 * not `\w`, so every alternative touching an umlaut ("präsentation") would be
 * dead at the boundary. Same trap documented at `managedSourceTrigger`.
 */
export const GENERATION_SIGNAL =
  /(?<!\p{L})(erstell\p{L}*|erzeug\p{L}*|generier\p{L}*|entwirf|entwerfe|speicher\p{L}*|hinterleg\p{L}*|export\p{L}*|dokument\p{L}*|sharepic\p{L}*|grafik\p{L}*|kachel\p{L}*|tabelle\p{L}*|spreadsheet|pr[äa]sentation\p{L}*|folien?|slides?|pdf|diagramm\p{L}*|chart|posting|tweet|caption|reel\p{L}*|fass|fasse|zusammenfass\p{L}*|k[üu]rz\p{L}*|straff\p{L}*|pr[üu]f\p{L}*)(?!\p{L})/iu;

const RESOLVE_PROMPT = `Entscheide, ob diese Nachricht ein ARTEFAKT erzeugen soll — eine Datei, ein Bild oder einen Beitrag, der neben der Antwort entsteht. Antworte mit EINEM Wort:

dokument — ein Text soll als Dokument gespeichert/angelegt werden
sharepic — ein Bild mit Text darauf, für Social Media
bild — ein reines Bild ohne Textebene, gemalt oder fotorealistisch
tabelle — eine Tabelle/Kalkulation als Datei
praesentation — Folien
pdf — ein PDF
diagramm — ein Diagramm/Chart aus Zahlen
keine — alles andere

"keine" ist die richtige Antwort für: einen Social-Media-Post oder eine Pressemitteilung schreiben, zusammenfassen, kürzen, prüfen, erklären, umformulieren, übersetzen, beraten — auch wenn dabei ein langer Text entsteht. Ein Text IN der Antwort ist kein Artefakt.

"keine" ist auch die richtige Antwort, wenn die Nachricht das Erzeugen VERBIETET ("kein Dokument erstellen", "nichts speichern"). Ein Verbot ist keine Bestellung.

Im Zweifel: keine.`;

interface ResolveArgs {
  userContent: string;
  conversationContext: string | null;
}

/**
 * The artifact this turn should produce, `'keine'` if the model decided it
 * should produce none, or `null` if nothing could be decided. Callers MUST treat
 * `null` as "continue to the LLM tier".
 */
export async function resolveGenerationScope({
  userContent,
  conversationContext,
}: ResolveArgs): Promise<GenerationVerdict | null> {
  const startTime = Date.now();
  const userMessage = conversationContext
    ? `${conversationContext}\n\nAktuelle Nachricht: "${userContent}"`
    : `Anfrage: "${userContent}"`;

  try {
    const response = await withTimeout(
      aiText({
        lane: 'chat_intent_classification',
        pinned: 'standard',
        system: RESOLVE_PROMPT,
        prompt: userMessage,
        maxOutputTokens: 16,
        temperature: 0,
      }),
      RESOLVE_TIMEOUT_MS,
      'Generation scope'
    );

    const verdict = parseKind(response);
    log.info(
      `[GenerationScope] "${userContent.slice(0, 40)}" → ${
        verdict === null ? 'unlesbar' : verdict === 'keine' ? 'keine' : verdict.intent
      } (${Date.now() - startTime}ms)`
    );
    return verdict;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    log.warn(
      `[GenerationScope] Failed after ${Date.now() - startTime}ms: ${reason}. Falling through.`
    );
    return null;
  }
}

/**
 * The EARLIEST answer word in the reply wins, matched whole-word.
 *
 * Providers wrap a one-word answer in quotes and punctuation, so the word has to
 * be found anywhere; whole-word because a substring match is how a justification
 * gets read as an answer. Position — not a fixed check order — is what settles
 * the conflict, and here it has to: the model justifies itself in the very
 * vocabulary it is choosing from ("keine — das wäre kein eigenes Dokument"), so
 * checking kinds before `keine` (the shape `parseScope` can afford, because
 * "Bahnpolitik" is not the whole word "bahn") would answer `dokument` to a reply
 * that said no. Leading word wins, full stop.
 */
function parseKind(raw: string | undefined | null): GenerationVerdict | null {
  if (!raw) return null;
  const text = raw.toLowerCase();
  const at = (word: string): number => text.search(new RegExp(`(?<!\\p{L})${word}(?!\\p{L})`, 'u'));

  let best: { index: number; verdict: GenerationVerdict } | null = null;
  const consider = (index: number, verdict: GenerationVerdict): void => {
    if (index >= 0 && (best === null || index < best.index)) best = { index, verdict };
  };
  for (const [kind, intent] of Object.entries(KIND_TO_INTENT)) {
    consider(at(kind), { intent });
  }
  // `keine?` — die unflektierte Form ist der Regelfall in einer Ablehnung, und
  // ohne sie las der Parser „kein Dokument" als BESTELLUNG eines Dokuments:
  // `keine` matcht nicht, `dokument` schon, und der Auflöser erzeugte genau das
  // Artefakt, das er gerade abgelehnt hatte. Zwei Token liegen bequem innerhalb
  // von `max_tokens: 16`, das ist also keine Randform.
  consider(at('keine?'), 'keine');
  return best === null ? null : (best as { verdict: GenerationVerdict }).verdict;
}
