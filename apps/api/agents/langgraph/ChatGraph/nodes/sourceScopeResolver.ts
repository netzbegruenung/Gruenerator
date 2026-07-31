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
 * left a gap for everything the regex misses ("Pollenbelastung in Nürnberg"),
 * and the prompt could not have been rolled back.
 *
 * Shape as always (`docsIntentTiebreak.ts`): hard timeout, `null` on anything
 * unusable, `INTERMEDIATE_MODEL`, existing `chat_intent_classification` task.
 * `null` and `keine` mean "carry on to Tier 4" — never "answer without sources".
 */

import { createLogger } from '../../../../utils/logger.js';
import { INTERMEDIATE_MODEL } from '../llmConfig.js';

import type { AIWorkerPool } from '../../../../workers/types.js';

const log = createLogger('ChatGraph:SourceScope');

/** One word. Same order of magnitude as the docs tiebreak's 800ms. */
const RESOLVE_TIMEOUT_MS = 900;

/** The answer space. `keine` is not in it — it is the absence of an answer. */
export const SOURCE_SCOPES = ['bahn', 'hotel', 'wetter', 'news'] as const;
export type SourceScope = (typeof SOURCE_SCOPES)[number];

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
 * The live source this turn needs, or `null` for "none / unusable / failed".
 * Callers MUST treat `null` as "continue to the LLM tier" — the resolver decides
 * only which source may MOUNT, never which path the turn takes.
 */
export async function resolveSourceScope({
  userContent,
  conversationContext,
  aiWorkerPool,
}: ResolveArgs): Promise<SourceScope | null> {
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
      `[SourceScope] "${userContent.slice(0, 40)}" → ${scope ?? 'keine'} (${Date.now() - startTime}ms)`
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
 */
function parseScope(raw: string | undefined | null): SourceScope | null {
  if (!raw) return null;
  const text = raw.toLowerCase();
  for (const scope of SOURCE_SCOPES) {
    if (new RegExp(`(?<!\\p{L})${scope}(?!\\p{L})`, 'u').test(text)) return scope;
  }
  return null;
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
