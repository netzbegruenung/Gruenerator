/**
 * AI Provider Configuration
 * Manages Mistral and LiteLLM providers for the chat service
 */

import { createMistral } from '@ai-sdk/mistral';
import { createOpenAI } from '@ai-sdk/openai';

import { env } from '../../../config/env.js';
import { litellmFetchWithThinkingDisabled } from '../../../services/ai/litellmThinkingFetch.js';
import { isVisionCapable } from '../../../services/ai/modelDiscovery.js';
import { regoloFetchWithThinkingDisabled } from '../../../services/ai/regoloThinkingFetch.js';
import {
  tryAcquireVerdigadoSlot,
  releaseVerdigadoSlot,
} from '../../../services/providers/verdigadoSlot.js';

import type { AgentConfig } from './types.js';
import type { LanguageModel } from 'ai';

const LITELLM_DEFAULT_MODEL = 'verdigado-pro';

export const VISION_MODEL = {
  provider: 'regolo' as const,
  model: env.VISION_DEFAULT_MODEL || 'gemma4-31b',
};

export { INTERMEDIATE_MODEL, getIntermediateModel } from '../../../services/ai/providers.js';

export { isVisionCapable };

/**
 * Available models that can be selected by the user.
 *
 * `single` — pinned to one provider/model.
 * `overflow` — Verdigado-preferred with Regolo overflow when Verdigado's
 * single inference slot is busy. The unchosen sibling becomes the
 * first-token-timeout fallback for the chosen side.
 *
 * Chinese-trained models (Qwen) intentionally have NO fallback. The user
 * sees an explicit warning before selecting them; auto-routing in or out
 * would break that informed-consent boundary.
 */
export type Provider = 'mistral' | 'litellm' | 'regolo';

export interface ModelConfigSingle {
  kind: 'single';
  provider: Provider;
  model: string;
  contextWindow: number;
  /**
   * Optional first-token-timeout fallback (single-step). For Mistral lanes
   * this is typically a Gemma/GPT-OSS overflow lane so a hung Mistral
   * upstream still produces an answer for the user. Qwen entries
   * intentionally have NO fallback — the "Chinese-only-when-selected"
   * informed-consent boundary forbids auto-routing IN or OUT.
   */
  fallback?: string;
}

export interface ModelConfigOverflow {
  kind: 'overflow';
  primary: { provider: 'litellm'; model: string };
  overflow: { provider: 'regolo'; model: string };
  contextWindow: number;
}

export type ModelConfig = ModelConfigSingle | ModelConfigOverflow;

const GPT_OSS_OVERFLOW: ModelConfigOverflow = {
  kind: 'overflow',
  primary: { provider: 'litellm', model: 'verdigado-pro' },
  overflow: { provider: 'regolo', model: 'gpt-oss-120b' },
  contextWindow: 32768,
};

const GEMMA_4_OVERFLOW: ModelConfigOverflow = {
  kind: 'overflow',
  primary: { provider: 'litellm', model: 'verdigado-think' },
  overflow: { provider: 'regolo', model: 'gemma4-31b' },
  contextWindow: 32768,
};

export const AVAILABLE_MODELS: Record<string, ModelConfig> = {
  // 'mistral' is intentionally absent — it uses agent defaults (like 'auto')
  'mistral-medium-3.5': {
    kind: 'single',
    provider: 'mistral',
    model: 'mistral-medium-2604',
    contextWindow: 128000,
    fallback: 'gemma-4',
  },
  // Legacy IDs — repointed to current Mistral generation (Medium 3.5)
  'mistral-large': {
    kind: 'single',
    provider: 'mistral',
    model: 'mistral-medium-2604',
    contextWindow: 128000,
  },
  'mistral-medium': {
    kind: 'single',
    provider: 'mistral',
    model: 'mistral-medium-2604',
    contextWindow: 128000,
  },
  'pixtral-large': {
    kind: 'single',
    provider: 'mistral',
    model: 'pixtral-large-latest',
    contextWindow: 128000,
  },
  regolo: {
    kind: 'single',
    provider: 'regolo',
    model: env.REGOLO_DEFAULT_MODEL || 'qwen3.5-122b',
    contextWindow: 32768,
  },

  // Overflow lanes — Verdigado primary, Regolo on overflow when slot is busy.
  'gpt-oss': GPT_OSS_OVERFLOW,
  'gemma-4': GEMMA_4_OVERFLOW,
};

// Legacy IDs from persisted client state and DB. All point to the new overflow
// lanes so existing users get LB behavior automatically. Drop after one
// release cycle once chatStore migration v8 has propagated.
AVAILABLE_MODELS['litellm'] = GPT_OSS_OVERFLOW;
AVAILABLE_MODELS['gpt-oss-regolo'] = GPT_OSS_OVERFLOW;
AVAILABLE_MODELS['gemma-litellm'] = GEMMA_4_OVERFLOW;
AVAILABLE_MODELS['gemma-regolo'] = GEMMA_4_OVERFLOW;

/**
 * Get model configuration by user-facing model ID.
 * Returns null if model ID is not recognized.
 */
export function getModelConfig(modelId: string): ModelConfig | null {
  return AVAILABLE_MODELS[modelId] || null;
}

/**
 * Resolved tuple ready to feed into getModel() + streaming. For overflow
 * configs the chosen side depends on whether the Verdigado slot was free at
 * resolution time; the unchosen sibling is exposed for single-step fallback.
 */
export interface ResolvedModelTuple {
  provider: Provider;
  model: string;
  contextWindow: number;
  /** Single-step first-token-timeout fallback target. */
  sibling?: { provider: Provider; model: string };
  /** Set when this resolution acquired the Verdigado slot. MUST be invoked
   *  after the stream finishes (success, failure, or abort). Idempotent. */
  releaseSlot?: () => Promise<void>;
}

/**
 * Resolve a user-facing modelId to a concrete provider/model tuple, acquiring
 * the Verdigado slot for overflow lanes when free.
 */
export async function resolveModelTuple(
  modelId: string,
  requestId: string
): Promise<ResolvedModelTuple | null> {
  const config = AVAILABLE_MODELS[modelId];
  if (!config) return null;

  if (config.kind === 'single') {
    const result: ResolvedModelTuple = {
      provider: config.provider,
      model: config.model,
      contextWindow: config.contextWindow,
    };
    // Honor configured fallback (e.g. mistral-medium-3.5 → gemma-4). For
    // overflow-lane fallbacks we deterministically use the overflow (Regolo)
    // side — we don't acquire the Verdigado slot from a fallback path,
    // since the slot would have to be held across the primary's failure
    // window and that risks deadlock on slot release ordering.
    if (config.fallback) {
      const sib = AVAILABLE_MODELS[config.fallback];
      if (sib?.kind === 'single') {
        result.sibling = { provider: sib.provider, model: sib.model };
      } else if (sib?.kind === 'overflow') {
        result.sibling = { provider: sib.overflow.provider, model: sib.overflow.model };
      }
    }
    return result;
  }

  const acquired = await tryAcquireVerdigadoSlot(requestId);
  if (acquired) {
    return {
      provider: config.primary.provider,
      model: config.primary.model,
      contextWindow: config.contextWindow,
      sibling: { provider: config.overflow.provider, model: config.overflow.model },
      releaseSlot: () => releaseVerdigadoSlot(requestId),
    };
  }
  return {
    provider: config.overflow.provider,
    model: config.overflow.model,
    contextWindow: config.contextWindow,
    sibling: { provider: config.primary.provider, model: config.primary.model },
  };
}

/**
 * Default context window for Mistral agent defaults and unknown models.
 * Conservative enough to avoid overflow, generous enough for good responses.
 */
const DEFAULT_CONTEXT_WINDOW = 32768;

/**
 * Get context window size (in tokens) for a model.
 * Looks up AVAILABLE_MODELS first, then falls back to provider defaults.
 */
export function getContextWindow(
  modelId: string | null | undefined,
  provider?: 'mistral' | 'litellm' | 'regolo' | 'anthropic'
): number {
  if (modelId && AVAILABLE_MODELS[modelId]) {
    return AVAILABLE_MODELS[modelId].contextWindow;
  }

  // Provider-level defaults for agent configs that use 'auto' or unnamed models
  if (provider === 'mistral') return 128000;
  if (provider === 'litellm') return 16384;
  if (provider === 'regolo') return 32768;

  return DEFAULT_CONTEXT_WINDOW;
}

let mistralInstance: ReturnType<typeof createMistral> | null = null;
let litellmInstance: ReturnType<typeof createOpenAI> | null = null;
let regoloInstance: ReturnType<typeof createOpenAI> | null = null;

function getMistralProvider() {
  if (!mistralInstance) {
    mistralInstance = createMistral({
      ...(env.MISTRAL_API_KEY && { apiKey: env.MISTRAL_API_KEY }),
    });
  }
  return mistralInstance;
}

function getLiteLLMProvider() {
  if (!litellmInstance) {
    const baseURL = env.LITELLM_BASE_URL;
    if (!baseURL) {
      throw new Error('LITELLM_BASE_URL is not configured');
    }
    litellmInstance = createOpenAI({
      baseURL: `${baseURL}/v1`,
      apiKey: env.LITELLM_API_KEY || '',
      name: 'litellm',
      fetch: litellmFetchWithThinkingDisabled,
    });
  }
  return litellmInstance;
}

function getRegoloProvider() {
  if (!regoloInstance) {
    const apiKey = env.REGOLO_API_KEY;
    if (!apiKey) {
      throw new Error('REGOLO_API_KEY is not configured');
    }
    regoloInstance = createOpenAI({
      baseURL: 'https://api.regolo.ai/v1',
      apiKey,
      name: 'regolo',
      fetch: regoloFetchWithThinkingDisabled,
    });
  }
  return regoloInstance;
}

export function isProviderConfigured(provider: string): boolean {
  let configured = false;
  switch (provider) {
    case 'mistral':
      configured = !!env.MISTRAL_API_KEY;
      console.log(
        `[providers] Checking mistral: MISTRAL_API_KEY=${configured ? 'set' : 'NOT SET'}`
      );
      return configured;
    case 'litellm': {
      const hasBaseUrl = !!env.LITELLM_BASE_URL;
      const hasApiKey = !!env.LITELLM_API_KEY;
      configured = hasBaseUrl && hasApiKey;
      console.log(
        `[providers] Checking litellm: BASE_URL=${hasBaseUrl ? 'set' : 'NOT SET'}, API_KEY=${hasApiKey ? 'set' : 'NOT SET'}`
      );
      return configured;
    }
    case 'regolo':
      configured = !!env.REGOLO_API_KEY;
      console.log(`[providers] Checking regolo: REGOLO_API_KEY=${configured ? 'set' : 'NOT SET'}`);
      return configured;
    case 'anthropic':
      return false;
    default:
      return false;
  }
}

export function getModel(provider: string, modelId: string): LanguageModel {
  console.log(`[providers] getModel called: provider=${provider}, modelId=${modelId}`);
  switch (provider) {
    case 'mistral': {
      console.log(`[providers] Creating Mistral model: ${modelId}`);
      const mistral = getMistralProvider();
      const model = mistral(modelId);
      console.log(`[providers] Mistral model created successfully`);
      return model;
    }
    case 'litellm': {
      const resolvedModel = modelId || LITELLM_DEFAULT_MODEL;
      console.log(`[providers] Creating LiteLLM model: ${resolvedModel}`);
      const litellm = getLiteLLMProvider();
      const model = litellm.chat(resolvedModel);
      console.log(`[providers] LiteLLM model created successfully`);
      return model;
    }
    case 'regolo': {
      if (!env.REGOLO_API_KEY) {
        console.log(`[providers] REGOLO_API_KEY not set, falling back to Mistral: ${modelId}`);
        const mistral = getMistralProvider();
        return mistral(modelId);
      }
      const regoloDefault = env.REGOLO_DEFAULT_MODEL || 'qwen3.5-122b';
      console.log(`[providers] Creating Regolo model: ${modelId || regoloDefault}`);
      const regolo = getRegoloProvider();
      const model = regolo.chat(modelId || regoloDefault);
      console.log(`[providers] Regolo model created successfully`);
      return model;
    }
    case 'anthropic':
      throw new Error('Anthropic provider is not yet implemented');
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

/**
 * Whether a resolved model can drive the agentic chat tool loop (native
 * function calling with multi-step tool use). Conservative on purpose: only
 * Mistral is enabled for now — it's the primary EU provider and our strongest
 * tool-caller (mistral-medium-2604). The overflow lanes (Gemma/GPT-OSS via
 * litellm/regolo) and Qwen are NOT gated in yet; a non-tool-capable user
 * selection stays on the single-pass pipeline rather than being silently
 * swapped (the informed-consent boundary in resolveModel).
 */
export function isAgenticToolCapable(provider: string, _modelName: string): boolean {
  return provider === 'mistral';
}

/**
 * Whether the SELECTED model drives the tool loop directly (unified single-model
 * pass) vs. delegating tool orchestration to the fast planner (planner/executor
 * split: INTERMEDIATE_MODEL gathers, selected model writes the answer).
 *
 * True only for Mistral — our fast NATIVE tool-caller, where one pass is both
 * fastest and highest-fidelity. Everything else splits: the fixed fast planner
 * does every tool call (so tool-calling reliability no longer depends on the
 * user's model) and the selected model only writes prose — which is why ANY
 * model, including slow "thinking" lanes and non-tool-callers, is now selectable
 * for the loop.
 */
export function prefersUnifiedLoop(provider: string, _modelName: string): boolean {
  return provider === 'mistral';
}

/**
 * Split-mode model policy — the planner/executor split gives us two independent
 * slots, so we point each at its best NON-CHINESE model instead of forcing the
 * user's (often slow) lane model into both roles:
 *
 *  - PLANNER (gather): needs fast, reliable NATIVE tool-calling; its prose is
 *    discarded. Prefer the cheaper regolo Mistral-small-4 (verified tool-caller,
 *    the user's requested tool model); fall back to always-up litellm/verdigado-
 *    pro when regolo is absent (it proved flaky in the test env — steps=0).
 *  - SYNTH (write): needs the best GERMAN WRITER and must NEVER be a reasoning
 *    model — litellm/verdigado-think as the synthesizer is the 18–76s latency
 *    culprit. For `auto` (and any think-lane selection) we write with gemma-4
 *    (best prose, 31b = fast); an explicit non-think model selection is honored.
 *
 * qwen / gpt-oss are never chosen here (Chinese lane / verified tool-call fail).
 */
// Planner = litellm/verdigado-pro: a fast, verified tool-caller that is proven
// reachable and completed planner=verdigado-pro turns on test-branch. NOT regolo
// (caused the earlier steps=0 gather regression). Mistral native as the
// cross-provider fallback if litellm is ever down.
const LOOP_PLANNER_PRIMARY = { provider: 'litellm' as const, model: LITELLM_DEFAULT_MODEL };
const LOOP_PLANNER_FALLBACK = { provider: 'mistral' as const, model: 'mistral-medium-2604' };
// Synth = best writer. gemma-4 lives only on regolo; fall back to the always-up
// litellm/verdigado-pro (fast, non-think) when regolo is absent.
const LOOP_SYNTH_PRIMARY = { provider: 'regolo' as const, model: 'gemma4-31b' };
const LOOP_SYNTH_FALLBACK = { provider: 'litellm' as const, model: LITELLM_DEFAULT_MODEL };

/** Models that must NEVER write the loop answer: reasoning/"think" lanes (slow),
 *  Chinese lanes (qwen — excluded by policy), and gpt-oss (verified tool-call
 *  fail / reasoning leak). Any of these in the synth slot is rewritten to the
 *  best-writer lane. */
const AVOID_AS_SYNTH = /verdigado-think|qwen|gpt-oss/i;

function loopPlannerChoice(): { provider: Provider; model: string } {
  return isProviderConfigured('litellm') ? LOOP_PLANNER_PRIMARY : LOOP_PLANNER_FALLBACK;
}

function loopSynthWriterChoice(): { provider: Provider; model: string } {
  return isProviderConfigured('regolo') ? LOOP_SYNTH_PRIMARY : LOOP_SYNTH_FALLBACK;
}

/** Human-readable planner model name (for the [Agentic] log line). */
export function loopPlannerModelName(): string {
  return loopPlannerChoice().model;
}

export function getLoopPlannerModel(): LanguageModel {
  const p = loopPlannerChoice();
  return getModel(p.provider, p.model);
}

/**
 * Synthesizer for the split's write phase. `auto` (or any think-lane selection)
 * writes with the best-writer lane; an explicit fast model is honored as-is.
 * Returns the name too so the caller can log which model actually wrote.
 */
/** Pure synth-model DECISION (no model instantiation) — env-free & unit-testable.
 *  `null` provider means "honor the resolved model as-is". */
export function loopSynthChoice(
  resolvedModelName: string,
  isAuto: boolean
): { provider: Provider | null; model: string } {
  const useWriter = isAuto || AVOID_AS_SYNTH.test(resolvedModelName);
  if (!useWriter) return { provider: null, model: resolvedModelName };
  return loopSynthWriterChoice();
}

export function getLoopSynthModel(
  resolution: { model: LanguageModel; modelName: string },
  isAuto: boolean
): { model: LanguageModel; name: string } {
  const choice = loopSynthChoice(resolution.modelName, isAuto);
  if (choice.provider === null) return { model: resolution.model, name: resolution.modelName };
  return { model: getModel(choice.provider, choice.model), name: choice.model };
}

/**
 * Cheap, slot-free check of whether the model that WILL be used (user selection
 * or agent default) can drive the agentic loop. Mistral lanes never acquire an
 * overflow slot, so this can decide the agentic branch before the heavier
 * `resolveModel` runs — without double-acquiring a Verdigado slot.
 */
export function selectionIsToolCapable(agentProvider: string, modelId?: string): boolean {
  if (modelId && modelId !== 'mistral' && modelId !== 'auto') {
    const cfg = AVAILABLE_MODELS[modelId];
    if (cfg) {
      const provider = cfg.kind === 'single' ? cfg.provider : cfg.primary.provider;
      const model = cfg.kind === 'single' ? cfg.model : cfg.primary.model;
      return isAgenticToolCapable(provider, model);
    }
    // Unknown id → agent default is used, fall through.
  }
  return isAgenticToolCapable(agentProvider, '');
}

export function getProviderName(provider: AgentConfig['provider']): string {
  switch (provider) {
    case 'mistral':
      return 'Mistral AI';
    case 'litellm':
      return 'Verdigado';
    case 'regolo':
      return 'Regolo AI';
    case 'anthropic':
      return 'Anthropic Claude';
    default:
      return 'Unknown';
  }
}
