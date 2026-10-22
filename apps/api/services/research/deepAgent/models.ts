/**
 * The two model lanes of the deep research agent.
 *
 * Built from the app's own provider instances (`services/ai/providerInstances.ts`),
 * so host, key, the Mistral reasoning pin and the Cortecs sovereignty policy
 * are the ones every other call gets. What is specific to this agent is the
 * choice of model per role and the tool-call batching, both below.
 *
 * ── No environment switches here, deliberately ────────────────────────────
 *
 * Which lane the worker runs on, and whether the lead delegates in parallel,
 * are research decisions with measurements behind them — not deployment
 * settings. An env knob would let a deployment pick a lane nobody measured, and
 * the failure mode is a thin report, which reads as the agent being weak rather
 * than as a setting being wrong. `DEEP_AGENT_WORKER` used to exist and is gone;
 * a deployment that still sets it is simply ignored (the schema strips unknown
 * keys), so nothing breaks on the way out.
 */

import { type LanguageModel } from 'ai';

import { env } from '../../../config/env.js';
import { getCortecsProvider, getMistralChatModel } from '../../ai/providerInstances.js';

/** A model plus the provider options its calls need. */
export interface ResearchModel {
  model: LanguageModel;
  providerOptions: Record<string, Record<string, boolean>>;
  temperature: number;
}

/** Mistral Large 4 — seit 12.10.2026 anstelle von Medium 3.5 (`mistral-medium-2604`). */
const MISTRAL_LARGE = 'mistral-large-4';

/**
 * Gemma 4 31B über Cortecs — dasselbe Modell, das `INTERMEDIATE_LANES.heavy`
 * für die Zwischenarbeit der App fährt.
 *
 * ── Warum nicht mehr die 26B-MoE, und warum NICHT GreenPT ──
 *
 * Der Worker lief auf `gemma-4-26b-a4b-it`, erst auf Scaleway, dann über
 * Cortecs. Diese Modell-ID ist über Cortecs am 21.08.2026 unbedienbar geworden
 * (der einzige brauchbare Unterauftragnehmer verschwand aus dem Katalog, der
 * zweite ist quantisiert — siehe den Doc-Block bei `heavy`).
 *
 * GreenPT, wohin das 26B anderswo ausgewichen ist, kommt für DIESE Rolle nicht
 * in Frage: sein `gemma4` denkt bei jedem Schritt rund 5.400 Zeichen, und kein
 * Flag schaltet das ab. Für eine einzelne Antwort ist das bezahlbar, für einen
 * Loop ruinös — gemessen 10.08.2026 an derselben Frage produzierte der
 * GreenPT-Worker in 500 s keinen Bericht, während der Vergleichslauf in 156 s
 * fertig war. Am 21.08.2026 nachgemessen und unverändert: mit und ohne
 * `reasoning_effort` identisch leerer Inhalt bei 120 Token Budget.
 *
 * Dass dieses Modell von sich aus nicht denkt, ist gemessen (21.08.2026: 420
 * Zeichen Inhalt, 0 Zeichen Denken, ohne jeden Parameter) — es braucht den
 * Reasoning-Pin also gar nicht, und es bekäme ihn hier auch nicht: infercom
 * weist `reasoning_effort` mit HTTP 400 ab — deshalb führt die Whitelist in
 * cortecsRequestPolicy.ts dieses Modell nicht.
 *
 * ── UNGEPRÜFT: die Werkzeug-Treue dieser Rolle ──
 *
 * Hier stand bis 24.08.2026 „roughly twice as fast as the dense 31B … 12/12 on
 * a `max_tokens: 20` classification and 3/3 valid JSON" — Zahlen vom
 * 01.08.2026, erhoben an der 26B-MoE. Sie sind mit dem Modellwechsel nicht
 * mitgewandert: der Vergleich „doppelt so schnell wie das dichte 31B" ist
 * gegenstandslos, seit DIESES das dichte 31B IST.
 *
 * Für das dichte 31B in der Worker-Rolle liegen diese Zahlen NICHT vor. Was
 * vorliegt, ist die `pruefung`-Messung (Inhaltstreue in 22 Läufen nicht vom
 * früheren Primär unterscheidbar) und ein Live-Lauf der gebauten Kette — beides sagt
 * nichts über wohlgeformte Tool-Calls unter knappem Budget, und genau das ist
 * die Eigenschaft, von der ein Worker hier lebt. `scripts/probeCortecs.ts`
 * misst sie (Tool-Call und `json_object`); wer sie braucht, lässt es laufen,
 * statt sich auf diesen Absatz zu verlassen.
 */
const CORTECS_GEMMA = 'gemma-4-31b-it';

/**
 * Serial tool calls, for the lane that only ever uses tools one at a time.
 *
 * Asked for several at once, the Mistral lane intermittently emits one malformed
 * call whose `name` is the joined indices of the batch ("1,2,5"), which the API
 * rejects with a 400 (reproduced 10.08.2026). `sanitizeToolCallsMiddleware`
 * repairs the history afterwards, but a lane with nothing to gain from batching
 * should not pay for the repair at all.
 */
const SERIAL_TOOL_CALLS = { parallelToolCalls: false } as const;

/**
 * Batched tool calls — the whole point of the lead's turn.
 *
 * The lead's expensive move is `task`, and issuing one `task` per turn makes the
 * subagents run strictly one after another. That is the single reason a full run
 * outlasts its own clock: the budget comments in `types.ts` note wall-clock as
 * THE binding constraint, and the 11.08.2026 run arrived at its deadline with 83
 * sources in hand and filed a `Teilbericht`. Delegating five sub-questions in
 * one turn costs the time of the slowest one, not the sum.
 *
 * The malformed-batch risk above is real and is why this is a considered choice
 * rather than a default: it is now ABSORBED rather than avoided. The sanitizer
 * drops the bad call from the history before the next request, nudges the
 * model to repeat it, and bounds itself at `RETRY_LIMIT`. So a bad batch costs
 * a step; serial delegation costs the report.
 *
 * The prompt already assumes concurrency, incidentally: subagents answer in
 * their message instead of writing files precisely because parallel `task` calls
 * share one `files` state (see prompts.ts).
 */
const PARALLEL_TOOL_CALLS = { parallelToolCalls: true } as const;

/**
 * The lead agent: plans, delegates, and writes the final report.
 *
 * Mistral Large 4 because the run lives or dies on tool-calling discipline —
 * a lead that fumbles `task` or `write_file` produces no document at all.
 *
 * Large 4 denkt ohne `reasoning_effort` von selbst (#4553); `getMistralChatModel`
 * schreibt für dieses Modell `none` auf den Draht. Der Lead lief bis 12.10.2026
 * auf Medium 3.5 ohne Denken.
 */
export function leadModel(): ResearchModel {
  requireMistralKey();
  return {
    model: getMistralChatModel(MISTRAL_LARGE),
    providerOptions: { mistral: PARALLEL_TOOL_CALLS },
    temperature: 0.3,
  };
}

/**
 * The research subagent: one sub-question, a few searches, a short answer back.
 *
 * The small lane, and the one place where "use a cheaper model" actually pays
 * here — the worker does the overwhelming majority of the run's model calls
 * (every search, every read, every write-up), while the lead does a plan, a
 * handful of delegations and one report.
 *
 * It used to be `leadModel()` verbatim unless an env var named GreenPT, so in
 * practice both roles ran Mistral Medium: there was no cheap lane at all, only
 * the appearance of one. Gemma hält den Worker in der Familie, die schon
 * funktioniert, und lässt die teure Lane der Rolle, die ihre Werkzeug-Disziplin
 * braucht.
 *
 * WELCHES Gemma, steht im Modulkopf („Warum nicht mehr die 26B-MoE") und nicht
 * hier: es ist das dichte `gemma-4-31b-it` über Cortecs, nicht mehr die
 * 26B-MoE. Hier stand bis 24.08.2026 die MoE „mit gepinntem Reasoning" — beide
 * Hälften waren zu dem Zeitpunkt schon falsch, und der Kommentar direkt an
 * `modelKwargs` unten sagte das Gegenteil. Ein Satz weniger an dieser Stelle
 * ist die Reparatur: die Modellwahl hat genau einen Ort, an dem sie begründet
 * wird.
 *
 * Serial tool calls: a worker never delegates, so it has nothing to batch.
 */
export function workerModel(): ResearchModel {
  // Die Souveränitäts-Weisung (nur Unterauftragnehmer mit Zero Data Retention
  // in der EU/im EWR) samt Nachprüfung am Antwort-Header setzt der `fetch` des
  // Cortecs-Providers — derselbe Weg wie für jeden anderen Cortecs-Aufruf der
  // App. Bis zur AI-SDK-Fassung stand sie hier von Hand, weil `ChatOpenAI`
  // daran vorbeiging.
  return {
    model: getCortecsProvider().chat(CORTECS_GEMMA),
    providerOptions: { openai: SERIAL_TOOL_CALLS },
    temperature: 0.3,
  };
}

/**
 * A missing key is a configuration fault and is the one thing a run may throw
 * on. The Mistral provider itself would only fail at request time; the Cortecs
 * provider throws on a missing key already. Cortecs ist vorausbezahlt: ein
 * leeres Guthaben sieht auf der Leitung aus wie ein falscher Schlüssel (HTTP
 * 401) und ist von hier aus nicht unterscheidbar.
 */
function requireMistralKey(): void {
  if (!env.MISTRAL_API_KEY) {
    throw new Error('MISTRAL_API_KEY is required for the deep research lead agent');
  }
}
