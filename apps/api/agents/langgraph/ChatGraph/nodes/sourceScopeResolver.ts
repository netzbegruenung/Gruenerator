/**
 * "Braucht diese Frage eine Live-Quelle — und welche?"
 *
 * The four system-MCP intents (`bahn`, `hotel`, `wetter`, `news`) are the one
 * place where a language model is genuinely required and the reason is written
 * down next to the regex that guards them (`SYSTEM_MCP_PHRASING`,
 * classifierParsing.ts): "Bahnreform", "Tourismuspolitik" and "Klimapolitik"
 * share their vocabulary with timetables, hotels and weather, and a policy
 * question must never pull a departure board. Mounting them broadly, the way
 * domain tools mount, is therefore out.
 *
 * What was NOT required is answering that question inside 27.198 characters of
 * tool taxonomy. Four paragraphs and four decision steps of CLASSIFIER_PROMPT
 * existed for it; this resolver is the same decision in ~700 characters with a
 * five-value answer space.
 *
 * WHERE IT RUNS decides whether the prompt may forget them: at the door of
 * Tier 4, on every turn that would otherwise send the big prompt. Tier 4 is the
 * ONLY place the prompt ever decided these intents, so a resolver in front of it
 * has exactly the same reach — no phrasing can slip past it that the prompt
 * would have caught. Hanging it off `SYSTEM_MCP_PHRASING` instead would have
 * left a gap for everything the regex misses, and the prompt could not have been
 * rolled back.
 *
 * Shape as always (`docsIntentTiebreak.ts`): hard timeout, `null` on anything
 * unusable, `INTERMEDIATE_MODEL`, existing `chat_intent_classification` task.
 *
 * `keine` and `null` are DIFFERENT answers, and the caller relies on it:
 *   - `keine` — the model decided, and the decision is "no live source". A turn
 *     that `SYSTEM_MCP_PHRASING` held back from loop demotion is released back
 *     to it on this answer, which is what lets that regex be generous.
 *   - `null` — timeout, provider failure, or an unparseable reply. Nothing was
 *     decided, so the turn carries on to Tier 4 exactly as before.
 * Collapsing the two (the first version returned `null` for both) would turn
 * every provider hiccup into a silent routing change.
 */

import { createLogger } from '../../../../utils/logger.js';
import { INTERMEDIATE_MODEL } from '../llmConfig.js';

import type { AIWorkerPool } from '../../../../workers/types.js';

const log = createLogger('ChatGraph:SourceScope');

/** One word. Same order of magnitude as the docs tiebreak's 800ms. */
const RESOLVE_TIMEOUT_MS = 900;

/** The sources that can mount. `keine` is a verdict, not a source — see below. */
export const SOURCE_SCOPES = ['bahn', 'hotel', 'wetter', 'news'] as const;
export type SourceScope = (typeof SOURCE_SCOPES)[number];

/** A decided "no live source", as distinct from `null` = nothing was decided. */
export type SourceScopeVerdict = SourceScope | 'keine';

/**
 * The whole boundary, in the words the big prompt used — minus the taxonomy it
 * was embedded in. Each line is a policy-vs-data pair because that IS the
 * decision: every one of these sources has a political topic that sounds
 * exactly like it.
 */
const RESOLVE_PROMPT = `Entscheide, ob diese Anfrage Daten aus einer Live-Quelle braucht. Antworte mit EINEM Wort:

bahn — konkrete Zugverbindung, Abfahrtszeit, Fahrplan, Verspätung, Bahnhofsauskunft
hotel — Hotel-/Unterkunftssuche, auch als Frage formuliert ("wo kann ich in X übernachten")
wetter — konkrete Wettervorhersage, aktuelles Wetter, Temperatur, Regen, Pollen, Luftqualität für einen Ort
news — aktuelle Nachrichtenlage, Schlagzeilen, tagesschau-Meldungen ("was gibt es Neues zu X", "aktuelle Nachrichten aus Y")
keine — alles andere

Politische Fragen sind NIE eine Live-Quelle: Bahnpolitik, Bahnreform, Verkehrspositionen, Tourismuspolitik, Klimapolitik und Klimawandel sind "keine". Entscheidend ist, ob konkrete Daten zu einem Ort oder Zeitpunkt gefragt sind — nicht, ob das Thema anklingt.

Im Zweifel: keine.`;

interface ResolveArgs {
  userContent: string;
  conversationContext: string | null;
  aiWorkerPool: AIWorkerPool;
}

/**
 * The live source this turn needs, `'keine'` if the model decided it needs none,
 * or `null` if nothing could be decided (timeout, failure, unusable reply).
 * Callers MUST treat `null` as "continue to the LLM tier" — the resolver decides
 * only which source may MOUNT, never which path the turn takes.
 */
export async function resolveSourceScope({
  userContent,
  conversationContext,
  aiWorkerPool,
}: ResolveArgs): Promise<SourceScopeVerdict | null> {
  const startTime = Date.now();
  const userMessage = conversationContext
    ? `${conversationContext}\n\nAktuelle Nachricht: "${userContent}"`
    : `Anfrage: "${userContent}"`;

  try {
    const response = await withTimeout(
      aiWorkerPool.processRequest(
        {
          type: 'chat_intent_classification',
          provider: INTERMEDIATE_MODEL.provider,
          systemPrompt: RESOLVE_PROMPT,
          messages: [{ role: 'user', content: userMessage }],
          options: { model: INTERMEDIATE_MODEL.model, max_tokens: 8, temperature: 0 },
        },
        null
      ),
      RESOLVE_TIMEOUT_MS
    );

    const scope = parseScope(response.content);
    log.info(
      `[SourceScope] "${userContent.slice(0, 40)}" → ${scope ?? 'unlesbar'} (${Date.now() - startTime}ms)`
    );
    return scope;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    log.warn(`[SourceScope] Failed after ${Date.now() - startTime}ms: ${reason}. Falling through.`);
    return null;
  }
}

/**
 * Providers wrap a one-word answer in quotes, punctuation and the occasional
 * full sentence, so match the word anywhere — but only as a WHOLE word. The
 * model likes to justify itself ("keine — das ist Bahnpolitik"), and a
 * substring match would read that as `bahn`: the exact confusion the prompt
 * spends its last paragraph ruling out.
 *
 * Sources are checked before `keine` so that "keine — das ist Bahnpolitik" and
 * "wetter, keine Verspätung" both land on the word the model led with. A reply
 * containing neither is `null`: unparseable, not a decision.
 */
function parseScope(raw: string | undefined | null): SourceScopeVerdict | null {
  if (!raw) return null;
  const text = raw.toLowerCase();
  const wholeWord = (word: string): boolean =>
    new RegExp(`(?<!\\p{L})${word}(?!\\p{L})`, 'u').test(text);
  for (const scope of SOURCE_SCOPES) {
    if (wholeWord(scope)) return scope;
  }
  return wholeWord('keine') ? 'keine' : null;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Source scope timeout after ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}
