/**
 * The typed way to ask a model for something.
 *
 * `AiClient.processRequest` takes an untyped envelope — `type` is a bare
 * string, options carry OpenAI wire names (`max_tokens`, `top_p`), and the
 * result is `{content: string | null, success: boolean, …}` that every one of
 * the ~66 call sites immediately unwraps. That envelope exists because it used
 * to be serialised across a `worker_threads` boundary. There is no boundary any
 * more, so there is no reason to keep packing.
 *
 * These three functions are what the call sites actually do, named:
 *
 *   aiText    prompt in, string out                      (~29 sites)
 *   aiObject  schema in, typed value out                 (~26 sites, none of
 *             which validate anything today)
 *   aiTools   real tool calling, raw SDK result out      (~7 sites)
 *
 * IMPORTANT — one engine, two faces. This does NOT reimplement generation. It
 * composes the same pieces `processRequest` uses: `resolveLane` + `laneTarget`
 * for routing, `executeProvider` for the call, `laneFallback` for failover. A
 * request made through `aiText` and the same request made through
 * `processRequest` run the identical code path, so the old face and the new one
 * cannot drift while both exist. That is the property that makes migrating call
 * sites a mechanical swap rather than a behavioural risk.
 */

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
}

/**
 * Fails after the lane's primary and its whole fallback chain.
 *
 * `cause` carries the last provider error, which is what holds the status code
 * — the classifier at the `aiService` boundary walks the chain to find it.
 */
export class NoAnswerError extends Error {
  constructor(lane: string, options?: ErrorOptions) {
    super(`No provider produced an answer for lane "${lane}"`, options);
    this.name = 'NoAnswerError';
  }
}

function toEnvelope(call: AiCall, extra: Partial<AIRequestOptions> = {}): AIRequestData {
  const lane = resolveLane(call.lane);
  const target = laneTarget(lane, { model: call.model });

  const options: AIRequestOptions = {
    ...extra,
    ...(call.temperature != null && { temperature: call.temperature }),
    ...(call.maxOutputTokens != null && { max_tokens: call.maxOutputTokens }),
    ...(call.topP != null && { top_p: call.topP }),
    ...(target.model != null && { model: target.model }),
  };

  return {
    type: lane,
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
 * get a turn. Errors are thrown raw — classification happens at the boundary in
 * `aiService`, and callers of this module get it via that same path.
 */
async function runWithFallback(call: AiCall, extra: Partial<AIRequestOptions> = {}) {
  const lane = resolveLane(call.lane);
  const primary = call.provider ?? laneTarget(lane, { model: call.model }).provider;
  const chain: ProviderName[] = [primary, ...laneFallback(lane).filter((p) => p !== primary)];

  const requestId = `gen_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
  let lastError: Error | undefined;

  for (const provider of chain) {
    try {
      const result = await executeProvider(provider, requestId, toEnvelope(call, extra));
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
