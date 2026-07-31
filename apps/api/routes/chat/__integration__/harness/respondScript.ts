import { type LanguageModel } from 'ai';

import {
  type AgenticResponseOutcome,
  type streamAgenticResponse,
} from '../../services/agenticLoop/agenticRespondService.js';
import { type resolveModel } from '../../services/responseStreamingService.js';

type AgenticParams = Parameters<typeof streamAgenticResponse>[0];
type ModelResolution = Awaited<ReturnType<typeof resolveModel>>;

/**
 * The doubles for the two service boundaries the router calls to produce an
 * answer. Everything BELOW this line (model resolution, provider selection, the
 * SDK tool loop) is where the nondeterminism lives: `resolveModel` reaches
 * `resolveModelTuple` → a Redis overflow slot, and `isProviderConfigured` reads
 * whichever provider keys the developer happens to have. Doubling here removes
 * all of it while leaving every routing input real.
 *
 * These doubles do NOT prove the loop works — that is `loopEngine.vitest.ts`,
 * which drives the engine through its own `LoopDeps` seam. What they make
 * testable is the ~2000 lines of sequencing and precedence around them.
 *
 * The recorded call arrays are the point: "did the router enter the loop, and
 * with which messages after pruning and compaction" is only expressible if the
 * double remembers. Every routing assertion checks a recorded call ALONGSIDE
 * the SSE flag — the router reads the same `runAgentic` boolean twice, so a
 * regression could set `intent.agentic` without taking the branch.
 */
export interface RespondScript {
  agentic: {
    text: string;
    citations: AgenticResponseOutcome['citations'];
    sources: AgenticResponseOutcome['sources'];
    steps: AgenticResponseOutcome['steps'];
    modelName: string;
  };
  /** `null` makes the single-pass path report a dead stream. */
  singlePassText: string | null;
  resolution: Partial<ModelResolution>;
  agenticCalls: AgenticParams[];
  singlePassCalls: Array<{ messages: unknown; resolution: unknown }>;
  resolveModelCalls: Array<{ modelId: string | undefined; options: unknown }>;
  reset: () => void;
}

const DEFAULTS = {
  text: 'Eine simulierte Antwort.',
  singlePassText: 'Eine simulierte Antwort.',
  modelName: 'stub-model',
};

export const respond: RespondScript = {
  agentic: {
    text: DEFAULTS.text,
    citations: [],
    sources: [],
    steps: [],
    modelName: DEFAULTS.modelName,
  },
  singlePassText: DEFAULTS.singlePassText,
  resolution: {},
  agenticCalls: [],
  singlePassCalls: [],
  resolveModelCalls: [],
  reset(): void {
    respond.agentic = {
      text: DEFAULTS.text,
      citations: [],
      sources: [],
      steps: [],
      modelName: DEFAULTS.modelName,
    };
    respond.singlePassText = DEFAULTS.singlePassText;
    respond.resolution = {};
    respond.agenticCalls.length = 0;
    respond.singlePassCalls.length = 0;
    respond.resolveModelCalls.length = 0;
  },
};

/**
 * Reproduces the two SSE events the real loop emits around its answer
 * (`startResponse()` / `onText` in agenticRespondService). Without them the
 * trace is malformed and `assertEventOrder` rightly complains.
 */
export async function fakeStreamAgenticResponse(
  params: AgenticParams
): Promise<AgenticResponseOutcome> {
  respond.agenticCalls.push(params);
  const { text, citations, sources, steps, modelName } = respond.agentic;

  params.sse.send('response_start', { message: 'Antwort wird erstellt…' });
  if (text) params.sse.send('text_delta', { text });

  return { fullText: text, steps, citations, sources, modelName };
}

const STUB_MODEL = { modelId: 'stub-model' } as unknown as LanguageModel;

export function fakeResolveModel(
  _agentConfig: unknown,
  modelId: string | undefined,
  _requestId: string,
  options?: unknown
): Promise<ModelResolution> {
  respond.resolveModelCalls.push({ modelId, options });
  return Promise.resolve({
    model: STUB_MODEL,
    provider: 'stub',
    modelName: DEFAULTS.modelName,
    reasoningEffort: 'off',
    ...respond.resolution,
  } as ModelResolution);
}

/**
 * `streamForResolution` is where the single-pass path would call `streamText`.
 * The router sends `response_start` itself here, but the TEXT is streamed by
 * this function — so the double must emit `text_delta` as well as return the
 * string, or the trace carries an empty answer and every content assertion on
 * the single-pass path is vacuously true.
 */
export function fakeStreamForResolution(params: {
  resolution: unknown;
  messages: unknown;
  sse: { send: (event: string, data: unknown) => void };
}): Promise<string | null> {
  respond.singlePassCalls.push({ messages: params.messages, resolution: params.resolution });
  const text = respond.singlePassText;
  if (text != null && text.length > 0) params.sse.send('text_delta', { text });
  return Promise.resolve(text);
}

/** Mirrors the real contract: run `buildStream`, fall back to `salvage`. */
export async function fakeStreamWithFallback(params: {
  primary: unknown;
  buildStream: (resolution: never) => Promise<string | null>;
  salvage?: () => string | null;
}): Promise<string | null> {
  const streamed = await params.buildStream(params.primary as never);
  if (streamed != null && streamed.trim().length > 0) return streamed;
  return params.salvage?.() ?? null;
}
