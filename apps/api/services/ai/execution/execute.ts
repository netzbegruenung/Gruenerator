/**
 * One text generation, on any provider.
 *
 * This replaces four adapter files that were ~95% the same code. They were not
 * four implementations of four different protocols — all four already ran
 * `generateText` from the AI SDK against a model from `getModel`. What differed
 * between them was, with one exception, DATA: a provider name, a default model,
 * two sampling numbers. Those live in the records below, where they can be read
 * side by side and argued about.
 *
 * Sampling is likewise one decision now — see `samplingFor`. It used to be four,
 * chosen by whichever provider the fallback chain reached.
 */

import { defaultSettingsMiddleware, generateText, wrapLanguageModel } from 'ai';

import ToolHandler from '../../tools/index.js';
import { getGenerationConfig } from '../config.js';
import { getDefaultModel, getModel, isProviderConfigured } from '../providers.js';

import {
  buildAdapterResult,
  buildAiSdkTools,
  convertMessages,
  resolveToolChoice,
} from './adapterUtils.js';

import type { ProviderName } from '../providers.js';
import type { AIRequestData, AIRequestOptions, AiResult } from '../types.js';
import type { LanguageModel } from 'ai';

/** Injected so tests drive the executor with a fake instead of `vi.mock('ai')`
 *  — the pattern `loopEngine.ts` uses, and the one that survives an SDK rename. */
export interface ExecuteDeps {
  generateText: typeof generateText;
}

const defaultDeps: ExecuteDeps = { generateText };

interface Sampling {
  temperature: number;
  topP: number;
  /** `null` = no `max_tokens` on the wire; the model's own ceiling applies. */
  maxOutputTokens: number | null;
}

/**
 * Sampling parameters for a request — the same ones no matter who answers.
 *
 * This used to be one resolver per provider: mistral consulted the
 * type/platform table in `services/ai/config.ts`, litellm hardcoded 0.7/1.0,
 * regolo and greenpt hardcoded 0/0.1. Which of those a request got was decided
 * by the fallback chain, not by the caller — so a press release drafted on the
 * mistral primary and the same press release drafted on the litellm fallback
 * were sampled differently, and a Twitter post was capped at 120 output tokens
 * on one lane and uncapped on the other. Nobody chose that; it accumulated.
 *
 * One table now. `getGenerationConfig` already encodes the intent (formal types
 * cool, social types warm, per-platform token budgets), and that intent belongs
 * to the REQUEST, not to whichever provider happened to be reachable.
 */
function samplingFor(data: AIRequestData, options: AIRequestOptions): Sampling {
  const config = getGenerationConfig({
    type: data.type,
    systemPrompt: data.systemPrompt,
    platforms: (data.metadata as { platforms?: string[] } | undefined)?.platforms,
    temperature: options.temperature,
    maxTokens: options.max_tokens,
    topP: options.top_p,
  });

  return {
    temperature: config.temperature,
    // Greedy decoding wants top_p=1; Mistral rejects the combination outright,
    // the others merely behave oddly. `determineTopP` already returns 1.0 for
    // temperature 0, so this only catches an explicitly passed pair.
    topP: config.temperature === 0 && config.topP !== 1 ? 1.0 : config.topP,
    maxOutputTokens: config.maxTokens,
  };
}

/**
 * The model, plus JSON mode when the caller asked for it.
 *
 * `options.response_format` has been part of `AIRequestOptions` all along and
 * was read by NO adapter, so the eight call sites that set
 * `{type:'json_object'}` — the chat classifier, the compute nodes, the quality
 * gate, query expansion, the board agent — believed they were constrained and
 * were merely asking nicely in the prompt. Both provider packages map
 * `responseFormat: {type:'json'}` onto the wire field, so one middleware covers
 * all four lanes.
 *
 * Wrapped OUTSIDE `getModel` on purpose: `getModel` already wraps for usage
 * accounting, and wrapping the other way round would put this between the
 * accountant and the model.
 */
function modelFor(provider: ProviderName, model: string, options: AIRequestOptions): LanguageModel {
  const base = getModel(provider, model);
  // `LanguageModel` also admits a bare gateway id string, which cannot be
  // wrapped. `getModel` never returns one — same narrowing as `withUsageTracking`.
  if (options.response_format?.type !== 'json_object' || typeof base === 'string') return base;
  return wrapLanguageModel({
    model: base,
    middleware: defaultSettingsMiddleware({ settings: { responseFormat: { type: 'json' } } }),
  });
}

/** Which env var to point the operator at when a lane is unconfigured. */
const CONFIG_HINT: Record<ProviderName, string> = {
  mistral: 'MISTRAL_API_KEY',
  litellm: 'LITELLM_API_KEY',
  regolo: 'REGOLO_API_KEY',
  greenpt: 'GREENPT_API_KEY',
  scaleway: 'SCALEWAY_API_KEY',
};

export async function execute(
  provider: ProviderName,
  requestId: string,
  data: AIRequestData,
  deps: ExecuteDeps = defaultDeps
): Promise<AiResult> {
  const { messages, systemPrompt, options = {}, type, metadata: requestMetadata = {} } = data;

  if (!isProviderConfigured(provider)) {
    throw new Error(
      `${provider} provider is not configured. Check the ${CONFIG_HINT[provider]} environment variable.`
    );
  }

  const model = options.model || getDefaultModel(provider);
  const sampling = samplingFor(data, options);

  const { system, messages: modelMessages } = await convertMessages(messages, systemPrompt);

  const toolsPayload = ToolHandler.prepareToolsPayload(
    {
      ...(options.tools != null && { tools: options.tools }),
      ...(options.tool_choice != null && { tool_choice: options.tool_choice }),
    },
    provider,
    requestId,
    type
  );
  const tools = buildAiSdkTools(toolsPayload);
  const toolChoice = tools ? resolveToolChoice(toolsPayload.tool_choice) : undefined;

  try {
    // Retrying is the SDK's job — 2 retries, i.e. 3 attempts, which is both the
    // SDK default and what the hand-rolled loop this replaced used to do. The
    // difference is HOW retryability is decided: the old loop matched substrings
    // against the error message, so a provider that reworded its errors silently
    // stopped being retried. The SDK reads the structured `APICallError`.
    const result = await deps.generateText({
      model: modelFor(provider, model, options),
      ...(system != null && { system }),
      messages: modelMessages,
      temperature: sampling.temperature,
      topP: sampling.topP,
      // Omitted entirely when the type is uncapped — passing `undefined` and
      // passing nothing are the same to the SDK, but the spread makes it read
      // as a decision rather than a missing value.
      ...(sampling.maxOutputTokens != null && { maxOutputTokens: sampling.maxOutputTokens }),
      // GreenPT's thinking lanes (gemma4 et al.) ignore think:false and keep
      // reasoning internally until the gateway times out (see
      // services/ai/greenptThinkingFetch.ts) — retrying the identical request
      // rarely helps. One retry instead of two reaches the existing
      // provider-fallback chain (services/ai/aiService.ts) faster, while still
      // covering genuinely transient failures.
      maxRetries: provider === 'greenpt' ? 1 : 2,
      ...(tools != null && { tools }),
      ...(toolChoice != null && { toolChoice }),
    });

    return buildAdapterResult({ provider, model, requestId, type, requestMetadata, result });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[${provider} ${requestId}] Request failed after retries: ${message}`);
    // Thrown raw on purpose: classification happens once, at the boundary in
    // `services/ai/aiService.ts`.
    throw error;
  }
}
