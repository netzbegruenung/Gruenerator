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
 * The exception, and the reason this file has a `SAMPLING` record rather than
 * one set of numbers: the providers sample differently, and on the fallback path
 * that difference is not something the caller chose. mistral follows the
 * type/platform table in `services/ai/config.ts`; the other three use fixed
 * values. So the same request gets different parameters depending on who
 * answers — a Twitter post is capped at 120 output tokens on mistral and
 * uncapped on the litellm fallback. That is pinned by
 * `__tests__/sampling.vitest.ts` and unified in a separate, eval-gated commit,
 * because changing it changes generated text and is not a refactor.
 */

import { generateText } from 'ai';

import { getGenerationConfig } from '../../services/ai/config.js';
import { getDefaultModel, getModel, isProviderConfigured } from '../../services/ai/providers.js';
import ToolHandler from '../../services/tools/index.js';

import {
  buildAdapterResult,
  buildAiSdkTools,
  convertMessages,
  resolveToolChoice,
} from './adapterUtils.js';

import type { ProviderName } from '../../services/ai/providers.js';
import type { AIRequestData, AIRequestOptions, AIWorkerResult } from '../types.js';

/** Injected so tests drive the executor with a fake instead of `vi.mock('ai')`
 *  — the pattern `loopEngine.ts` uses, and the one that survives an SDK rename. */
export interface ExecuteDeps {
  generateText: typeof generateText;
}

const defaultDeps: ExecuteDeps = { generateText };

interface Sampling {
  temperature: number;
  topP: number;
  /** Omitted when the caller named no budget, so the provider default applies. */
  maxOutputTokens?: number;
}

type SamplingResolver = (data: AIRequestData, options: AIRequestOptions) => Sampling;

/** What the caller asked for, or the provider's fixed default. */
const fixed =
  (temperature: number, topP: number): SamplingResolver =>
  (_data, options) => ({
    temperature: options.temperature ?? temperature,
    topP: options.top_p ?? topP,
    ...(options.max_tokens != null && { maxOutputTokens: options.max_tokens }),
  });

const SAMPLING: Record<ProviderName, SamplingResolver> = {
  mistral: (data, options) => {
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
      // Mistral requires top_p=1 for greedy sampling.
      topP: config.temperature === 0 && config.topP !== 1 ? 1.0 : config.topP,
      maxOutputTokens: config.maxTokens,
    };
  },
  litellm: fixed(0.7, 1.0),
  regolo: fixed(0, 0.1),
  greenpt: fixed(0, 0.1),
};

/** Which env var to point the operator at when a lane is unconfigured. */
const CONFIG_HINT: Record<ProviderName, string> = {
  mistral: 'MISTRAL_API_KEY',
  litellm: 'LITELLM_API_KEY',
  regolo: 'REGOLO_API_KEY',
  greenpt: 'GREENPT_API_KEY',
};

export async function execute(
  provider: ProviderName,
  requestId: string,
  data: AIRequestData,
  deps: ExecuteDeps = defaultDeps
): Promise<AIWorkerResult> {
  const { messages, systemPrompt, options = {}, type, metadata: requestMetadata = {} } = data;

  if (!isProviderConfigured(provider)) {
    throw new Error(
      `${provider} provider is not configured. Check the ${CONFIG_HINT[provider]} environment variable.`
    );
  }

  const model = options.model || getDefaultModel(provider);
  const sampling = SAMPLING[provider](data, options);

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
      model: getModel(provider, model),
      ...(system != null && { system }),
      messages: modelMessages,
      temperature: sampling.temperature,
      topP: sampling.topP,
      ...(sampling.maxOutputTokens != null && { maxOutputTokens: sampling.maxOutputTokens }),
      maxRetries: 2,
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
