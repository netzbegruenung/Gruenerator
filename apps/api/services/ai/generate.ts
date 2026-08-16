/**
 * The typed way to ask a model for something. Seit dem 16.08.2026 der einzige.
 *
 * Der Vorgänger nahm einen untypisierten Umschlag — `type` als bare string,
 * OpenAI-Drahtnamen in den Optionen (`max_tokens`, `top_p`), ein Ergebnis
 * `{content, success, …}`, das jede Aufrufstelle sofort wieder auspackte. Er
 * existierte, weil er einmal über eine `worker_threads`-Grenze serialisiert
 * wurde. Die Grenze fiel, das Packen blieb, und mit Welle 3 ist auch das weg:
 * `AiClient`, `aiService.ts` und `app.locals.aiClient` gibt es nicht mehr.
 *
 * These three functions are what the call sites actually do, named:
 *
 *   aiText    prompt in, string out
 *   aiObject  schema in, typed value out
 *   aiTools   real tool calling, raw SDK result out
 *
 * IMPORTANT — this does NOT reimplement generation: the call itself is
 * `executeProvider`, dieselbe Funktion, die der Umschlag erreichte. Geroutet
 * wird über die Tabelle in `lanes.ts` (`resolveLane`/`laneTarget`/
 * `laneFallback`).
 *
 * `providers/providerSelector.ts` — die if/else-Kette, die die Tabelle ersetzt
 * hat — läuft noch, aber nur noch als PRÜFMITTEL: der Paritätstest in
 * `__tests__/lanes.vitest.ts` fährt jede geroutete Lane durch beide und
 * verlangt dasselbe Paar. Er ist das Netz unter einem Umbau der Tabelle, und er
 * fährt beide mit LEEREN Optionen — was eine Prompt-Config an `model` mitbringt,
 * sieht er nicht. Dafür gibt es `promptConfigModelPin.vitest.ts` und
 * `promptConfigRouting.vitest.ts`.
 *
 * Was die Parität ebenfalls nicht abdeckt: ein `type` ohne Zeile in `AI_LANES`.
 * `resolveLane` schickt ihn auf `default` und protokolliert das — richtig für
 * einen Typ, den niemand geroutet hat, falsch für die Aufrufstellen, die eine
 * Stufe aus `intermediateLanes.ts` oder ein Provider/Modell-Paar hart benennen.
 * Die sagen das mit `AiCall.pinned` und routen an der Tabelle vorbei, ohne die
 * Warnung; siehe dort.
 */

import { env } from '../../config/env.js';
import { createLogger } from '../../utils/logger.js';
import { AiProviderError, classifyProviderError } from '../providers/providerErrors.js';

import { executeProvider } from './execution/index.js';
import { intermediateLane } from './intermediateLanes.js';
import { GENERIC_FALLBACK, laneFallback, laneTarget, resolveLane } from './lanes.js';
import { jsonCandidatesFromText } from './structuredParsing.js';

import type { IntermediateLaneId } from './intermediateLanes.js';
import type { LaneId } from './lanes.js';
import type { ProviderName } from './providers.js';
import type { StructuredValidation } from './structuredParsing.js';
import type { AIRequestData, AIRequestOptions, AiResult, Tool } from './types.js';

const log = createLogger('AiObject');

export interface AiCall {
  /**
   * What kind of request this is.
   *
   * It reaches the engine verbatim — sampling (`services/ai/config.ts`) is keyed
   * off it — and, unless `pinned` says otherwise, it also picks the row in
   * `AI_LANES` that routes the call. `resolveLane` accepts any string and logs
   * the ones it does not know, so a dynamic caller stays possible.
   */
  lane: LaneId | string;
  system?: string;
  /** The single-user-turn case, which is most of them. */
  prompt?: string;
  /** For multi-turn. Same shape the envelope took; SDK conversion happens once,
   *  inside `execute`. */
  messages?: AIRequestData['messages'];
  temperature?: number;
  maxOutputTokens?: number;
  topP?: number;
  /**
   * Wall clock for the whole call, fallback chain included. Defaults to
   * `env.REQUEST_TIMEOUT` (120 s), which is measured against an interactive
   * answer. A step that runs AFTER the stream has closed has a different
   * yardstick — there, waiting is cheaper than failing — and says so; see
   * `agentPipeline`'s `step.timeoutMs`.
   */
  timeoutMs?: number;
  /**
   * Provider and model the CALLER chose, instead of the routing table.
   *
   * The lane registry answers "who writes this kind of text". A large family of
   * call sites is not asking that: the resolvers, the summarizer, the compute
   * nodes and the quality gate name a stage in
   * `services/ai/intermediateLanes.ts` — the registry that decides who does the
   * small work that never reaches a reader — and that decision was made against
   * measurements recorded there, not against a lane. They pass a `type` with no
   * row in `AI_LANES`, so without this field the facade would send every one of
   * them to `default` and log it as an oversight.
   *
   * A stage id is the form to prefer, because it names the decision. The
   * `{provider, model}` pair is for the four call sites that pin a literal
   * (litellm/verdigado-pro on `text_adjustment`, mistral on
   * `search_enhancement`) and for `agentPipeline`, which picks its target at
   * runtime from a stage plus its hedge.
   *
   * Pinning replaces the ROUTING decision only. The type still drives sampling,
   * and the failover chain still runs — on each provider's own default model,
   * wie es der Umschlag für einen gepinnten Aufruf tat.
   */
  pinned?: IntermediateLaneId | { provider: ProviderName; model: string };
  /** Feeds the platform-specific sampling table (`services/ai/config.ts`). */
  platforms?: readonly string[];
  /**
   * Constrained JSON decoding — the wire field, not a prompt request.
   *
   * Here rather than left to the caller because the envelope spells it
   * `response_format: {type:'json_object'}`, and a text call site that migrates
   * to `aiText` without it silently loses JSON mode: `execute.ts` reads the
   * option and wraps the model in `defaultSettingsMiddleware`, so dropping it
   * turns a constrained answer back into "asking nicely in the prompt", which
   * is what those eight call sites believed they were doing before the adapter
   * learned to read it.
   *
   * Orthogonal to `aiObject`, which forces a TOOL call. Use this when the
   * caller parses prose-shaped JSON itself.
   */
  json?: boolean;
}

/**
 * Fails after the lane's primary and its whole fallback chain.
 *
 * An `AiProviderError`, because `code`/`retryable` is what the route layer
 * branches on (`sseHelpers` distinguishes rate limit / provider down / bad
 * request / retryable). Der Umschlag klassifizierte an seiner eigenen Grenze; seit er weg ist, ist
 * dies die einzige Stelle, an der ein Provider-Fehler zu einem typisierten wird
 * — ohne sie käme jeder Ausfall als nacktes `internal` beim Client an, dieselbe
 * Regression, die der stillgelegte `worker_threads`-Pool hinterliess, als er
 * die einzige `AiProviderError`-Konstruktion mitnahm.
 *
 * `cause` stays the last provider error: it is what holds the status code the
 * classifier walks the chain to find, and callers that log it want the real
 * stack rather than this wrapper's.
 */
export class NoAnswerError extends AiProviderError {
  constructor(lane: string, options?: ErrorOptions) {
    // The last provider's own message is quoted, not just carried as `cause`:
    // this string is what a caller logs and what `aiObject` reports back as its
    // failure, and "no provider answered" alone says nothing about which of a
    // 503, a rejected request and a rate limit it was.
    const reason = options?.cause instanceof Error ? `: ${options.cause.message}` : '';
    super(
      `No provider produced an answer for lane "${lane}"${reason}`,
      classifyProviderError(options?.cause),
      options
    );
    this.name = 'NoAnswerError';
  }
}

/**
 * Provider and model for this call — the only place the two ways of choosing
 * them meet.
 *
 * `MAIN_LLM_OVERRIDE` reaches a pinned call as well, and it takes the MODEL
 * only: the pin keeps its provider. Das ist kein Entwurf, sondern das Verhalten,
 * das der Umschlag hatte — `selectProviderAndModel` liess das Override auf
 * beiden Feldern gewinnen, danach entschied `data.provider || selection.provider`
 * über den Adapter, sodass der Pin den Adapter behielt und das Modell nicht.
 */
function targetFor(call: AiCall): { provider: ProviderName; model: string | null } {
  if (call.pinned == null) return laneTarget(resolveLane(call.lane));

  const pin = typeof call.pinned === 'string' ? intermediateLane(call.pinned) : call.pinned;
  return { provider: pin.provider, model: process.env.MAIN_LLM_OVERRIDE || pin.model };
}

/**
 * A pinned call has no lane row to read a chain off, and asking `resolveLane`
 * for one would produce the "nobody routed this" warning the pin exists to
 * answer. It gets the generic chain — the one `tryFallbackProviders` runs by
 * default, und die, die jeder gepinnte Typ über den Umschlag erreichte.
 */
function fallbackFor(call: AiCall): readonly ProviderName[] {
  return call.pinned == null ? laneFallback(resolveLane(call.lane)) : GENERIC_FALLBACK;
}

/**
 * The engine's request shape.
 *
 * `type` is the caller's own string, NOT the resolved lane. Routing is only one
 * of two things the type decides: `getGenerationConfig` (services/ai/config.ts)
 * keys sampling off it too, and it knows names `AI_LANES` does not —
 * `web_search_summary` is 0.2 there, `crawler_agent` 0.1, `chat_rerank` 0.
 * Sending the resolved lane would silently sample every unrouted type at the
 * 0.35 catch-all.
 */
function toEnvelope(
  call: AiCall,
  model: string | null,
  extra: Partial<AIRequestOptions> = {}
): AIRequestData {
  const options: AIRequestOptions = {
    ...extra,
    ...(call.temperature != null && { temperature: call.temperature }),
    ...(call.maxOutputTokens != null && { max_tokens: call.maxOutputTokens }),
    ...(call.topP != null && { top_p: call.topP }),
    ...(call.json === true && { response_format: { type: 'json_object' as const } }),
    ...(model != null && { model }),
  };

  return {
    type: call.lane,
    ...(call.system != null && { systemPrompt: call.system }),
    messages: call.messages ?? [{ role: 'user' as const, content: call.prompt ?? '' }],
    options,
    ...(call.platforms != null && { metadata: { platforms: [...call.platforms] } }),
  };
}

async function runChain(call: AiCall, extra: Partial<AIRequestOptions>): Promise<AiResult> {
  const target = targetFor(call);
  const chain: ProviderName[] = [
    target.provider,
    ...fallbackFor(call).filter((p) => p !== target.provider),
  ];

  const requestId = `gen_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
  let lastError: Error | undefined;

  for (const [index, provider] of chain.entries()) {
    // The primary answers on the target's model; every fallback answers on its
    // OWN default — the rule `providerFallback.getFallbackModelForProvider`
    // applies. Carrying the primary's model down the chain instead would post
    // `gemma4` at LiteLLM and `mistral-small-4-119b` at Mistral: each fallback
    // would fail on an unknown model, so the chain would look like failover and
    // never once catch anything.
    const model = index === 0 ? target.model : null;
    try {
      const result = await executeProvider(provider, requestId, toEnvelope(call, model, extra));
      if (result.content || result.stop_reason === 'tool_use') return result;
      lastError = new Error(`Empty response from ${provider}`);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  throw new NoAnswerError(String(call.lane), { cause: lastError });
}

/**
 * Run one request on the lane's provider, then down its fallback chain, under a
 * wall clock.
 *
 * "Empty counts as failure" is deliberate and matches `providerFallback`: a
 * provider that answers with nothing has not answered, and the next one should
 * get a turn. When the whole chain is spent, `NoAnswerError` classifies the last
 * failure — see there for why this path has to do that itself.
 *
 * The clock covers the WHOLE chain, not one attempt, because that is what der Umschlag tat
 * (`executeWithTimeout`) und weil eine
 * per-attempt budget would let a three-provider chain run three times as long as
 * the caller allowed. Every migrating call site brings this expectation with it:
 * the envelope has no timeout field of its own, so the 120 s default (`env
 * .REQUEST_TIMEOUT`) is the only thing standing between a hung provider and a
 * turn that never ends — a facade without it would drop that ceiling silently.
 *
 * Like there, the timer does NOT cancel the provider request: `generateText`
 * gets no signal, so the HTTP call keeps running after this rejects.
 */
async function runWithFallback(call: AiCall, extra: Partial<AIRequestOptions> = {}) {
  const timeoutMs = call.timeoutMs ?? env.REQUEST_TIMEOUT;
  let timer: NodeJS.Timeout | undefined;

  try {
    return await Promise.race([
      runChain(call, extra),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new NoAnswerError(String(call.lane), {
                cause: new Error(`Request timeout after ${timeoutMs}ms`),
              })
            ),
          timeoutMs
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Plain text.
 *
 * Returns the string, not `{content, success}`: every text call site does
 * `result.content || ''` or throws on `!success` immediately, so the envelope
 * is ceremony. Throwing on an empty answer is a real change from that idiom —
 * `|| ''` turns a failed generation into a blank section that renders as if it
 * had worked — and it is the behaviour worth having.
 */
export async function aiText(call: AiCall): Promise<string> {
  const result = await runWithFallback(call);
  return (result.content ?? '').trim();
}

export type StructuredResult<T> = { ok: true; data: T } | { ok: false; error: string };

export interface AiObjectCall<T> extends AiCall {
  /** Shown to the model. Keep it LOOSE — strict provider schema modes reject
   *  `default`, and gpt-oss/mistral handle deeply nested unions poorly. The
   *  strictness lives in `validate`. */
  schema: Record<string, unknown>;
  toolName: string;
  toolDescription: string;
  /**
   * The single gate. Runs on the tool call AND on JSON recovered from a text
   * answer — see "One validator, two transports" above.
   */
  validate: (input: unknown) => StructuredValidation<T>;
  attempts?: number;
  /** Log prefix, e.g. 'pdf'. Defaults to the tool name. */
  label?: string;
}

/**
 * The tool call by NAME, in either transport the adapters produce.
 *
 * Deliberately not "whatever the first tool call was": a call for a different
 * tool is a wrong answer, and letting it through would hand the caller's
 * `validate` an object from another schema instead of triggering the repair
 * turn that names the problem.
 */
function extractToolInput(result: AiResult, toolName: string): unknown {
  const call = result.tool_calls?.find((c) => c.name === toolName);
  if (call) return call.input;
  for (const block of result.raw_content_blocks ?? []) {
    if (block.type === 'tool_use' && block.name === toolName && block.input) return block.input;
  }
  return null;
}

/**
 * Above this the previous attempt is NOT echoed back into the repair turn.
 *
 * The old code truncated the echo to 2000 chars and then asked for a complete
 * document — so the model saw its own output ending mid-block and "corrected"
 * the truncation. Showing nothing and naming the error is the honest version.
 */
const MAX_ECHO_CHARS = 12_000;

/**
 * Structured creation is deterministic-ish but not greedy. Explicit here rather
 * than left to `getGenerationConfig`, whose catch-all is 0.35 and whose
 * `doc_generation`/`board_generation` rows do not exist — the artifact call
 * sites have run at 0.4 since they were written.
 */
const DEFAULT_TEMPERATURE = 0.4;

/**
 * A validated object, via a forced tool call.
 *
 * Background: artifact generators used to prompt for JSON and parse whatever
 * came back. When the model omitted a required field the parse failed, the
 * generator returned null, and the turn degraded into free prose — which then
 * became the input of the NEXT artifact. Prompting alone cannot prevent that.
 *
 * A forced tool call (`tools` + `tool_choice: 'required'`) rather than the SDK's
 * `generateObject`, for one reason that matters: `validate` is a SEMANTIC gate,
 * not a schema check. The real failure mode at the call sites is a
 * schema-perfect object whose contents are wrong for the context — a deck whose
 * slides are empty, an editor operation the canvas cannot perform. The repair
 * turn quotes that concrete complaint back to the model at temperature 0, which
 * `Output.object()` has no slot for and `experimental_repairText` cannot do
 * either: reviewed 16.08.2026 against ai@7.0.58, its contract is `({text,
 * error}) => Promise<string | null>` — it repairs raw text so the JSON parse
 * succeeds and never sees a well-formed wrong answer, and it cannot take
 * another model turn. `generateObject` is itself marked deprecated there.
 *
 * ── One validator, two transports ───────────────────────────────────────────
 * The tool call and the text answer are TRANSPORTS of the same payload; they
 * differ only in how the candidate object is obtained. Both therefore run
 * through the caller's `validate`.
 *
 * This used to be two paths — `validate` for the tool call and a separate
 * `parseText` for prose — and they drifted, in both directions that matter:
 *  - the text path returned a bare `null`, so a rejection there was reported as
 *    "no tool call in the answer" and the repair turn never learned the actual
 *    field error. A PDF generation died in production this way — the model sent
 *    `caption: null` twice and was never told;
 *  - the presentation generator's `validate` rejects decks with EMPTY SLIDES,
 *    but its `parseText` was the bare parser — so whenever the provider answered
 *    with prose (the common case on the model this ran on) the quality gate was
 *    silently skipped and the empty deck shipped.
 */
export async function aiObject<T>(call: AiObjectCall<T>): Promise<StructuredResult<T>> {
  const attempts = call.attempts ?? 2;
  const label = call.label ?? call.toolName;
  const tool: Tool = {
    name: call.toolName,
    description: call.toolDescription,
    input_schema: call.schema,
  };
  const opening: AIRequestData['messages'] = call.messages ?? [
    { role: 'user', content: call.prompt ?? '' },
  ];

  let lastError = '';
  let lastRaw = '';
  /** Best structure recovered from a CUT-OFF answer, used only if every attempt
   *  was cut off (see the return at the bottom). */
  let truncatedFallback: T | null = null;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    const isRepair = attempt > 1 && lastError !== '';
    const messages: AIRequestData['messages'] = isRepair
      ? [
          ...opening,
          // Echo the rejected attempt so the model corrects rather than
          // rewrites — but only when it fits whole (see MAX_ECHO_CHARS).
          ...(lastRaw && lastRaw.length <= MAX_ECHO_CHARS
            ? [{ role: 'assistant' as const, content: lastRaw }]
            : []),
          {
            role: 'user' as const,
            content:
              `Deine Ausgabe war ungültig: ${lastError}\n\n` +
              `Gib sie korrigiert und VOLLSTÄNDIG erneut über das Tool ${call.toolName} aus. ` +
              'Lass kein Pflichtfeld weg und kürze den Inhalt nicht.',
          },
        ]
      : opening;

    try {
      const result = await runWithFallback(
        {
          ...call,
          messages,
          // A repair runs deterministically — creativity already failed once.
          temperature: isRepair ? 0 : (call.temperature ?? DEFAULT_TEMPERATURE),
        },
        { tools: [tool], tool_choice: 'required' }
      );

      const toolInput = extractToolInput(result, call.toolName);
      const transport = toolInput != null ? 'tool call' : 'text';
      const candidates =
        toolInput != null ? [toolInput] : jsonCandidatesFromText(result.content ?? '');

      // The provider ran out of output budget mid-structure. What comes back is
      // a TORSO, and the lax parsers normalize rather than reject — they drop
      // the malformed tail and hand back what parsed, which then ships as a
      // deck missing its last slides or a document missing its second half.
      // Live on 03.08.2026: 4096 tokens exhausted, "recovered from text",
      // success reported. Treat it as a rejection so the repair turn happens.
      //
      // `stop_reason === 'length'` misses one shape of the same failure: with
      // `tool_choice: 'required'` (always set above), a provider that cuts the
      // tool call's argument JSON off mid-stream can still report a "tool call"
      // finish reason (mapped to stop_reason 'tool_use', see adapterUtils.ts) —
      // the SDK just can't parse the truncated arguments, so `toolInput` is null
      // AND there's no text to fall back to (`candidates` empty). That reads as
      // "no tool call, no JSON" and hit the generic unhelpful error instead of
      // the repair-then-torso path below. Live on 06.08.2026: board_generation,
      // stop_reason=tool_use.
      //
      // Gated on stop_reason === 'tool_use' specifically (not just "no
      // candidates"), so a model that genuinely ignored the tool and wrote
      // unrelated prose — a real rejection, not a truncation — still falls
      // through to the generic error a few lines down instead of being mistaken
      // for a cut-off tool call.
      const noToolDespiteForced =
        toolInput == null && candidates.length === 0 && result.stop_reason === 'tool_use';
      const truncated = result.stop_reason === 'length' || noToolDespiteForced;

      let rejection = '';
      let rejected = '';
      for (const candidate of candidates) {
        const validated = call.validate(candidate);
        if (validated.ok) {
          if (truncated) {
            // Keep it as a last resort — see the fallback return below. Half a
            // document the user can finish beats no document at all, but only
            // after the repair attempt had its chance.
            if (!truncatedFallback) truncatedFallback = validated.value;
            log.warn(
              `[${label}] attempt ${attempt}: structure parsed but the answer was CUT OFF ` +
                `(stop_reason=length) — retrying for a complete one`
            );
            break;
          }
          if (toolInput == null) {
            log.info(`[${label}] attempt ${attempt}: no tool call, recovered from text`);
          }
          return { ok: true, data: validated.value };
        }
        // Report the FIRST candidate that parsed: with prose around the JSON the
        // bare body fails to parse and the fenced block is the real answer.
        if (!rejection) {
          rejection = validated.error;
          rejected = JSON.stringify(candidate);
        }
      }

      if (truncated) {
        // Echoing a cut-off draft back would make the model "correct" the cut
        // (see MAX_ECHO_CHARS); naming the cause and asking for less is what
        // actually fits inside the budget.
        lastError =
          'Die Ausgabe wurde abgeschnitten (Token-Limit erreicht) und war deshalb unvollständig';
        lastRaw = '';
        continue;
      }

      if (rejection) {
        lastError = rejection;
        lastRaw = rejected;
        log.warn(
          `[${label}] attempt ${attempt} rejected (${transport}): ${lastError}\n` +
            `  raw: ${rejected.slice(0, 600)}`
        );
        continue;
      }

      lastError = 'Kein Tool-Aufruf und kein verwertbares JSON in der Antwort';
      lastRaw = '';
      log.warn(
        `[${label}] attempt ${attempt}: ${lastError} (stop_reason=${result.stop_reason ?? 'unknown'})`
      );
    } catch (e) {
      // The whole provider chain is spent — `runWithFallback` throws where
      // der Umschlag `{success: false}` antwortete. Another attempt may
      // still find a provider that has recovered.
      lastError = e instanceof Error ? e.message : String(e);
      log.error(`[${label}] attempt ${attempt} threw: ${lastError}`);
    }
  }

  // Every attempt was cut off, but one of them parsed. Ship it: half a document
  // the person can finish beats none at all — the same call `createPdfDocument`
  // already makes for its own repair round ("deliver the file and disclose the
  // problem"). The WARN above is what makes it findable afterwards.
  if (truncatedFallback) {
    log.warn(`[${label}] all attempts were cut off — using the last complete-parsing torso`);
    return { ok: true, data: truncatedFallback };
  }

  return { ok: false, error: lastError || 'unbekannter Fehler' };
}

export interface AiToolsCall extends AiCall {
  tools: Tool[];
  toolChoice?: 'auto' | 'none' | 'required' | { type: 'tool'; name: string };
}

/**
 * Real tool calling: the model may or may not call, and the caller decides what
 * to do with the calls.
 *
 * Returns the result unwrapped-as-is rather than a re-shaped object.
 * `raw_content_blocks` exists only because the envelope re-packed the SDK's
 * output, and every consumer then had to un-pack it again.
 */
export function aiTools(call: AiToolsCall): Promise<AiResult> {
  return runWithFallback(call, {
    tools: call.tools,
    ...(call.toolChoice != null && { tool_choice: call.toolChoice }),
  });
}
