/**
 * A scripted `streamText` for the agentic loop.
 *
 * `loopEngine` already has the seam — `runAgenticLoop(p, deps = defaultDeps)`,
 * and `defaultDeps` is built at module scope from the `streamText`/`generateText`
 * it imports from `ai`. Replacing that import replaces the deps, so the loop can
 * be driven from an integration test WITHOUT threading anything through the
 * 2306-line router or changing production code.
 *
 * The shape a stream must have is small: `{ stream: AsyncIterable<Part> }`,
 * where `drain()` reads `type` / `text` / `error` / `finishReason`. That is the
 * same shape `loopStallGuard.vitest.ts` has been faking since the stall guard
 * landed; this module generalises it and adds recording.
 *
 * WHAT THIS UNLOCKS: the two loop decision points the simulated lane could not
 * reach, because it replaced `streamAgenticResponse` wholesale and the real loop
 * never ran — `loop.synth_verdict` (three SILENT answer substitutions, of which
 * the wire shows only the substitute) and `loop.tool_guard` (calls the loop
 * refused; a call that RAN is already on the wire as `tool_step_start`).
 *
 * WHAT IT DOES NOT DO: reproduce the AI SDK's own step loop. The scripted calls
 * below are executed directly, in order — that is enough for the guards, which
 * read call HISTORY, and deliberately not enough to make any claim about how a
 * real model would have stepped.
 */

import { type LanguageModel, type ToolSet } from 'ai';

/** A part as `drain()` reads it. `text-delta` is the only one that reaches the user. */
export interface ScriptedPart {
  type: string;
  text?: string;
  error?: unknown;
  finishReason?: string;
}

/** One tool the script asks the loop to execute, in place of the SDK's step loop. */
export interface ScriptedCall {
  tool: string;
  args: Record<string, unknown>;
}

export interface ScriptedResponse {
  /** Shorthand for a single `text-delta`. */
  text?: string;
  /** Full control, for reasoning deltas / errors / finish reasons. */
  parts?: ScriptedPart[];
  /** Executed before the parts stream, in order. Drives the tool guards. */
  calls?: ScriptedCall[];
  /**
   * Start this step's calls together instead of one after another — what the
   * real SDK does within one model step, and the ONLY way to reach
   * `checkSearchConcurrency`, which measures in-flight calls.
   *
   * Deterministic in one specific sense and no further: each wrapped `execute`
   * runs its guard chain and `noteCall` synchronously before its first await, so
   * the order in which the surplus call sees a full counter is fixed. WHICH call
   * is deferred is an await-interleaving artefact — a scenario must assert the
   * NUMBER of deferrals, never the identity of the loser.
   */
  parallel?: boolean;
}

export interface StreamTextRecord {
  modelId: string;
  system: string;
  toolNames: string[];
}

export interface LoopScript {
  /** Queue one response per expected `streamText` call, consumed in order. */
  script: (...responses: ScriptedResponse[]) => void;
  calls: StreamTextRecord[];
  /** Tool executions the script drove, in order. */
  toolCalls: { tool: string; result: unknown }[];
  assertScriptsConsumed: () => void;
  reset: () => void;
}

const queue: ScriptedResponse[] = [];

export const loopScript: LoopScript = {
  script(...responses: ScriptedResponse[]): void {
    queue.push(...responses);
  },
  calls: [],
  toolCalls: [],
  /**
   * A queued response nobody consumed means the turn took a different shape
   * than the scenario claims — split vs. unified, or a synth retry that never
   * happened. Without this the scenario pins a path it never took, which is the
   * exact failure the aiWorkerPool stub already guards against one layer up.
   */
  assertScriptsConsumed(): void {
    if (queue.length > 0) {
      throw new Error(
        `${queue.length} scripted streamText response(s) were never consumed — ` +
          `the loop made ${loopScript.calls.length} call(s): ` +
          `${loopScript.calls.map((c) => c.modelId).join(', ') || 'none'}`
      );
    }
  },
  reset(): void {
    queue.length = 0;
    loopScript.calls.length = 0;
    loopScript.toolCalls.length = 0;
  },
};

function modelIdOf(model: unknown): string {
  if (typeof model === 'string') return model;
  const record = model as { modelId?: unknown; id?: unknown } | null;
  if (record && typeof record.modelId === 'string') return record.modelId;
  if (record && typeof record.id === 'string') return record.id;
  return 'unknown';
}

function partsOf(response: ScriptedResponse): ScriptedPart[] {
  if (response.parts) return response.parts;
  return response.text != null ? [{ type: 'text-delta', text: response.text }] : [];
}

/**
 * Drop-in for `ai`'s `streamText`, as far as `loopEngine` uses it.
 *
 * Tools are executed here rather than by a replayed step loop. `toolCallId` is
 * deterministic (`t<call>-<index>`) because it becomes the SSE `stepId`, and a
 * random one would put a fresh value into every rendered decision map.
 */
export function fakeLoopStreamText(options: {
  model: LanguageModel;
  system?: string;
  tools?: ToolSet;
}): { stream: AsyncIterable<ScriptedPart> } {
  const callIndex = loopScript.calls.length;
  const tools = options.tools ?? {};
  loopScript.calls.push({
    modelId: modelIdOf(options.model),
    system: options.system ?? '',
    toolNames: Object.keys(tools),
  });

  const response = queue.shift();
  if (!response) {
    throw new Error(
      `unscripted streamText call #${callIndex} (model=${modelIdOf(options.model)}); ` +
        `script one response per expected call`
    );
  }

  const runCall = async (call: ScriptedCall, i: number): Promise<void> => {
    const entry = (tools as Record<string, { execute?: unknown }>)[call.tool];
    if (!entry || typeof entry.execute !== 'function') {
      throw new Error(
        `scripted tool "${call.tool}" is not mounted on this turn; mounted: ` +
          `${Object.keys(tools).join(', ') || 'none'}`
      );
    }
    // Validate + apply defaults exactly as the SDK does before invoking a tool.
    // Skipping this is not a shortcut, it silently changes behaviour:
    // `gruenerator_search` defaults `collection` through its schema, and a raw
    // call left it undefined, so the tool returned "Sammlung nicht verfügbar"
    // before reaching any search. Every guard downstream then saw a failure the
    // product would never have produced — a green map of an invented world,
    // which is the one thing this tier must not produce.
    const schema = (entry as { inputSchema?: { parse?: (v: unknown) => unknown } }).inputSchema;
    const input = typeof schema?.parse === 'function' ? schema.parse(call.args) : call.args;

    const execute = entry.execute as (
      input: unknown,
      opts: { toolCallId: string; messages: never[] }
    ) => unknown;
    const result = await execute(input, { toolCallId: `t${callIndex}-${i}`, messages: [] });
    loopScript.toolCalls.push({ tool: call.tool, result });
  };

  return {
    stream: (async function* () {
      const calls = response.calls ?? [];
      if (response.parallel) {
        await Promise.all(calls.map((call, i) => runCall(call, i)));
      } else {
        for (const [i, call] of calls.entries()) await runCall(call, i);
      }
      yield* partsOf(response);
    })(),
  };
}

/** `generateText` is only reached by paths this lane does not script. */
export function fakeLoopGenerateText(): Promise<{ text: string }> {
  return Promise.resolve({ text: '' });
}
