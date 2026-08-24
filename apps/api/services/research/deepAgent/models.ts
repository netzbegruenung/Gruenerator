/**
 * LangChain chat models for the deep research agent.
 *
 * A second model surface next to `services/ai/providerInstances.ts` on purpose:
 * `deepagents` runs on LangChain, the rest of the app on the AI SDK, and there
 * is no bridge between the two tool protocols. Only the plumbing is shared —
 * base URL, key and the model ids — so ein Host-Wechsel weiterhin an einer
 * Stelle passiert (`cortecsEndpoint.ts` bzw. `scalewayEndpoint.ts`).
 *
 * Both lanes are OpenAI-compatible, so `ChatOpenAI` serves both. Measured
 * 10.08.2026 through this exact wrapper, one tool-call round trip each:
 * Scaleway `mistral-medium-3.5-128b` 861 ms, GreenPT `gemma4` 2.4 s, both
 * emitting a well-formed tool call.
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

import { ChatOpenAI } from '@langchain/openai';

import { env } from '../../../config/env.js';
import { cortecsBaseUrl } from '../../ai/cortecsEndpoint.js';
import { cortecsFetchWithPolicy, SOVEREIGN_ZDR_PROVIDERS } from '../../ai/cortecsRequestPolicy.js';
import { isScalewayMistralRoutingEnabled, MISTRAL_API_URL } from '../../ai/providerInstances.js';
import { scalewayBaseUrl } from '../../ai/scalewayEndpoint.js';

/** Scaleway's name for Mistral Medium 3.5 — mirrors SCALEWAY_MISTRAL_MODELS. */
const SCALEWAY_MEDIUM = 'mistral-medium-3.5-128b';

/** The same weights under the name the Mistral API knows them by — the key of
 *  SCALEWAY_MISTRAL_MODELS that maps to SCALEWAY_MEDIUM. */
const MISTRAL_MEDIUM = 'mistral-medium-2604';

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
 * This is the same family as the GreenPT worker this replaces, on the host that
 * can actually switch the reasoning off. Measured for the
 * intermediate lane on 01.08.2026: roughly twice as fast as the dense 31B, 12/12
 * on a `max_tokens: 20` classification and 3/3 valid JSON on structured
 * extraction — i.e. it holds a tool-shaped contract, which is the property a
 * worker lives on here.
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
const SERIAL_TOOL_CALLS = { parallel_tool_calls: false } as const;

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
 * cleans all three fields a bad call rides in (`tool_calls`,
 * `invalid_tool_calls`, `additional_kwargs.tool_calls` — the last of which was
 * the hole that let the 400 back onto the wire until 11.08.2026), nudges the
 * model back to serial calls, and bounds itself at `RETRY_LIMIT`. So a bad batch
 * costs a step; serial delegation costs the report.
 *
 * The prompt already assumes concurrency, incidentally: subagents answer in
 * their message instead of writing files precisely because parallel `task` calls
 * share one `files` state (see prompts.ts).
 */
const PARALLEL_TOOL_CALLS = { parallel_tool_calls: true } as const;

/**
 * Die Souveränitäts-Weisung, von Hand.
 *
 * Dieses Modul baut sein eigenes `ChatOpenAI` und bekommt deshalb
 * `cortecsRequestPolicy` NICHT, das dieselben Felder für die AI-SDK-Seite der
 * App am Transport setzt. Ohne sie liefe ausgerechnet der Lauf mit den meisten
 * Modellaufrufen ohne Einschränkung durch den Router — und nach Ziffer 2.11
 * der DPA gilt eine unbeschränkte Konfiguration als Zustimmung zu jedem künftig
 * aufgenommenen Unterauftragnehmer.
 *
 * Die Liste steht bewusst dort und wird hier importiert: zwei Kopien würden
 * driften, und die abweichende wäre die, die niemand prüft. Was diese Felder
 * NICHT leisten, steht ebenfalls dort: der Filter ist fail-open, ein Tippfehler
 * oder ein umbenannter Anbieter schaltet ihn lautlos ab.
 *
 * Genau deshalb hängt der Worker zusätzlich `cortecsFetchWithPolicy` ein. Hier
 * stand, die Nachprüfung am Antwort-Header sei auf diesem Pfad „mangels
 * `fetch`-Haken" nicht zu haben — das stimmte nicht: `ChatOpenAI` reicht
 * `configuration.fetch` an den OpenAI-Client durch. Ohne sie liefe ausgerechnet
 * der Lauf mit den MEISTEN Modellaufrufen als einziger ungeprüft, also dort, wo
 * ein unwirksamer Filter am teuersten ist.
 */
const SOVEREIGN_ROUTING = {
  eu_native: true,
  allow_zero_data_retention: true,
  allowed_providers: SOVEREIGN_ZDR_PROVIDERS,
} as const;

/**
 * The lead agent: plans, delegates, and writes the final report.
 *
 * Mistral Medium 3.5 because the run lives or dies on tool-calling discipline —
 * a lead that fumbles `task` or `write_file` produces no document at all.
 *
 * THE THIRD PATH. `isScalewayMistralRoutingEnabled()` also gates this one, even
 * though nothing here goes through `routeMistralModel`: this is the same
 * weights on the same upstream, so a host that answers badly answers badly
 * here too. It was missed on the first pass — the module builds its own
 * `ChatOpenAI` and named the host in a local constant, so neither the routing
 * table nor a grep for `routeMistralModel` led here.
 *
 * The module comment above says "no environment switches here, deliberately",
 * and that still holds: WHICH MODEL each role runs is a research decision with
 * measurements behind it, and that is untouched. WHICH HOST serves the same
 * weights is an operational one, and it is the only thing this reads.
 *
 * The Mistral API is OpenAI-compatible on this endpoint — `ChatOpenAI` needs no
 * adapter. That is not a guess: `scalewayMistralFallbackFetch` already replays
 * a Scaleway-shaped body against `/v1/chat/completions` there, model id swapped,
 * and the whole fallback design rests on it.
 */
export function leadModel(): ChatOpenAI {
  if (!isScalewayMistralRoutingEnabled()) {
    return new ChatOpenAI({
      model: MISTRAL_MEDIUM,
      apiKey: requireMistralKey(),
      temperature: 0.3,
      configuration: { baseURL: MISTRAL_API_URL },
      modelKwargs: { ...PARALLEL_TOOL_CALLS },
    });
  }
  return new ChatOpenAI({
    model: SCALEWAY_MEDIUM,
    apiKey: requireScalewayKey(),
    temperature: 0.3,
    configuration: { baseURL: scalewayBaseUrl() },
    modelKwargs: { ...PARALLEL_TOOL_CALLS },
  });
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
export function workerModel(): ChatOpenAI {
  return new ChatOpenAI({
    model: CORTECS_GEMMA,
    apiKey: requireCortecsKey(),
    temperature: 0.3,
    // Der `fetch` trägt die Nachprüfung am Antwort-Header (siehe
    // SOVEREIGN_ROUTING oben). Er setzt die Weisungsfelder auch selbst und
    // deckungsgleich; `modelKwargs` bleibt trotzdem stehen, damit die Weisung
    // im Anfrage-Body steht, wo sie hingehört, und nicht erst am Transport
    // entsteht — wer den Haken je entfernt, verliert dann nur die Nachprüfung.
    configuration: { baseURL: cortecsBaseUrl(), fetch: cortecsFetchWithPolicy },
    // KEIN REASONING_OFF mehr: `gemma-4-31b-it` liegt bei infercom, und das
    // weist `reasoning_effort` mit HTTP 400 ab ("value must be one of 'low',
    // 'medium', 'high'"). Der Wert wäre hier ohnehin unnötig — dieses Modell
    // denkt von sich aus nicht (gemessen 21.08.2026: 420 Zeichen Inhalt, 0
    // Zeichen Denken, ohne jeden Parameter). Genau deshalb führt die Whitelist
    // in cortecsRequestPolicy.ts es nicht.
    modelKwargs: { ...SERIAL_TOOL_CALLS, ...SOVEREIGN_ROUTING },
  });
}

/** A missing key is a configuration fault and is the one thing a run may throw on. */
function requireScalewayKey(): string {
  const apiKey = env.SCALEWAY_API_KEY;
  if (!apiKey) throw new Error('SCALEWAY_API_KEY is required for the deep research agent');
  return apiKey;
}

/** Dasselbe für den Worker-Host. Cortecs ist vorausbezahlt: ein leeres Guthaben
 *  sieht auf der Leitung aus wie ein falscher Schlüssel (HTTP 401) und ist von
 *  hier aus nicht unterscheidbar — der Lauf bricht dann mit dem Anbieterfehler
 *  ab, nicht mit dieser Meldung. */
function requireCortecsKey(): string {
  const apiKey = env.CORTECS_API_KEY;
  if (!apiKey) throw new Error('CORTECS_API_KEY is required for the deep research agent');
  return apiKey;
}

/** Same rule for the lead's other host. The worker keeps needing its own key
 *  either way — it runs Gemma, which is not affected by the switch. */
function requireMistralKey(): string {
  const apiKey = env.MISTRAL_API_KEY;
  if (!apiKey) throw new Error('MISTRAL_API_KEY is required for the deep research lead agent');
  return apiKey;
}
