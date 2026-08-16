/**
 * The typed way to ask a model for something.
 *
 * `AiClient.processRequest` takes an untyped envelope — `type` is a bare
 * string, options carry OpenAI wire names (`max_tokens`, `top_p`), and the
 * result is `{content: string | null, success: boolean, …}` that every call site
 * immediately unwraps. That envelope exists because it used to be serialised
 * across a `worker_threads` boundary. There is no boundary any more, so there is
 * no reason to keep packing.
 *
 * These three functions are what the call sites actually do, named:
 *
 *   aiText    prompt in, string out
 *   aiObject  schema in, typed value out
 *   aiTools   real tool calling, raw SDK result out
 *
 * MIGRATION STATE, measured 16.08.2026: 62 `processRequest` calls in 55
 * production files still take the envelope (count and method in `types.ts`).
 * `generateTaskList` (services/boards/agentFlow/artifactGen.ts) is the only one
 * that has moved. This is a per-call-site migration, not a flag day.
 *
 * IMPORTANT — one engine, two faces. This does NOT reimplement generation: the
 * call itself is `executeProvider`, the same function `processRequest` reaches.
 * Routing is where the two faces differ, and the difference is deliberate —
 * `resolveLane`/`laneTarget`/`laneFallback` read the table in `lanes.ts`, while
 * `processRequest` reads the if/else chain in `providers/providerSelector.ts`.
 * The two are held in step by the parity test in `__tests__/lanes.vitest.ts`,
 * which drives every routed lane through BOTH and asserts the same
 * provider/model, so migrating a routed call site is a mechanical swap.
 *
 * What that parity does NOT cover, and what therefore is NOT a mechanical swap:
 * a `type` with no row in `AI_LANES`. `resolveLane` sends it to `default` and
 * logs it — correct for a type nobody routed, wrong for the ~7 call sites that
 * pass `chat_intent_classification` together with an explicit provider/model
 * from `intermediateLanes.ts`. Those pin their target on purpose; the facade
 * has no way to say so and would log every one of them as an oversight. Giving
 * it one is the prerequisite for migrating that family.
 */

import { AiProviderError, classifyProviderError } from '../providers/providerErrors.js';

import { executeProvider } from './execution/index.js';
import { laneFallback, laneTarget, resolveLane } from './lanes.js';

import type { LaneId } from './lanes.js';
import type { ProviderName } from './providers.js';
import type { AIRequestData, AIRequestOptions, AiResult, Tool } from './types.js';

export interface AiCall {
  /** Routes the request. `resolveLane` accepts any string and logs the ones it
   *  does not know, so a dynamic caller stays possible. */
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
  /** Playground / mobile / agent-config escape hatch. Everything else should
   *  let the lane decide. */
  provider?: ProviderName;
  model?: string;
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
 * request / retryable). `processRequest` classifies at its own boundary in
 * `aiService.ts`; nothing on THIS path runs through it, so without classifying
 * here a call site migrated onto the facade would trade a typed error for a
 * bare `internal` — the same regression the retired `worker_threads` pool left
 * behind when it took the only `AiProviderError` construction site with it.
 *
 * `cause` stays the last provider error: it is what holds the status code the
 * classifier walks the chain to find, and callers that log it want the real
 * stack rather than this wrapper's.
 */
export class NoAnswerError extends AiProviderError {
  constructor(lane: string, options?: ErrorOptions) {
    super(
      `No provider produced an answer for lane "${lane}"`,
      classifyProviderError(options?.cause),
      options
    );
    this.name = 'NoAnswerError';
  }
}

function targetFor(call: AiCall): { provider: ProviderName; model: string | null } {
  const routed = laneTarget(resolveLane(call.lane), { model: call.model });
  return { provider: call.provider ?? routed.provider, model: routed.model };
}

function fallbackFor(call: AiCall): readonly ProviderName[] {
  return laneFallback(resolveLane(call.lane));
}

/**
 * The engine's request shape.
 *
 * `type` is the caller's own string, NOT the resolved lane. Routing is only one
 * of two things the type decides: `getGenerationConfig` (services/ai/config.ts)
 * keys sampling off it too, and it knows names `AI_LANES` does not —
 * `web_search_summary` is 0.2 there, `crawler_agent` 0.1, `chat_rerank` 0.
 * Sending the resolved lane would silently sample every unrouted type at the
 * 0.35 catch-all, which is not what `processRequest` does: it hands `type`
 * through untouched and lets the selector route on a copy.
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

/**
 * Run one request on the lane's provider, then down its fallback chain.
 *
 * "Empty counts as failure" is deliberate and matches `providerFallback`: a
 * provider that answers with nothing has not answered, and the next one should
 * get a turn. When the whole chain is spent, `NoAnswerError` classifies the last
 * failure — see there for why this path has to do that itself.
 */
async function runWithFallback(call: AiCall, extra: Partial<AIRequestOptions> = {}) {
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
  /** Shown to the model. Keep it LOOSE — strict schemas make gpt-oss and
   *  mistral produce nothing at all rather than something imperfect. */
  schema: Record<string, unknown>;
  toolName: string;
  toolDescription: string;
  /** Where strictness belongs. Runs after the schema and can reject on grounds
   *  a schema cannot express — "this operation is not in the editor's
   *  capability list" — and its message drives the repair turn. */
  validate: (input: unknown) => { ok: true; value: T } | { ok: false; error: string };
  /** Last resort when a provider ignores the tool and answers in prose, so this
   *  path stays a strict superset of the prompt-and-parse it replaces. */
  parseText?: (text: string) => T | null;
  attempts?: number;
  label?: string;
}

function extractToolInput(result: AiResult, toolName: string): unknown {
  const call = result.tool_calls?.find((c) => c.name === toolName) ?? result.tool_calls?.[0];
  if (call) return call.input;
  for (const block of result.raw_content_blocks ?? []) {
    if (block.type === 'tool_use' && (!block.name || block.name === toolName)) return block.input;
  }
  return null;
}

/**
 * A validated object, via a forced tool call.
 *
 * A forced tool call rather than the SDK's `generateObject`, for one reason
 * that matters: `validate` is a semantic gate, not a schema check. The real
 * failure mode at the call sites is a schema-perfect object whose contents are
 * wrong for the context — an editor operation the canvas cannot perform. The
 * repair turn quotes that concrete complaint back to the model, which
 * `Output.object` has no slot for and `repairText` cannot do either, since it
 * repairs malformed JSON rather than a well-formed wrong answer.
 *
 * Repairs run at temperature 0: the first attempt was creative enough.
 */
export async function aiObject<T>(call: AiObjectCall<T>): Promise<StructuredResult<T>> {
  const attempts = call.attempts ?? 2;
  const label = call.label ?? call.toolName;
  const tool: Tool = {
    name: call.toolName,
    description: call.toolDescription,
    input_schema: call.schema,
  };

  let lastError = '';
  let lastRaw: unknown = null;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    const isRepair = attempt > 1;
    const messages: AIRequestData['messages'] = isRepair
      ? [
          { role: 'user', content: call.prompt ?? '' },
          { role: 'assistant', content: JSON.stringify(lastRaw ?? {}) },
          {
            role: 'user',
            content:
              `Deine Ausgabe war ungültig: ${lastError}\n\n` +
              `Gib sie korrigiert und VOLLSTÄNDIG erneut über das Tool ${call.toolName} aus. ` +
              `Lass kein Pflichtfeld weg und kürze den Inhalt nicht.`,
          },
        ]
      : (call.messages ?? [{ role: 'user', content: call.prompt ?? '' }]);

    const result = await runWithFallback(
      { ...call, messages },
      {
        tools: [tool],
        tool_choice: 'required',
        ...(isRepair && { temperature: 0 }),
      }
    );

    const toolInput = extractToolInput(result, call.toolName);
    if (toolInput != null) {
      const checked = call.validate(toolInput);
      if (checked.ok) return { ok: true, data: checked.value };
      lastError = checked.error;
      lastRaw = toolInput;
      console.warn(`[aiObject ${label}] attempt ${attempt} rejected: ${checked.error}`);
      continue;
    }

    // No tool call at all — some providers answer in prose under pressure.
    const parsed = call.parseText?.(result.content ?? '');
    if (parsed != null) return { ok: true, data: parsed };
    lastError = lastError || 'Modell hat das Tool nicht aufgerufen';
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
