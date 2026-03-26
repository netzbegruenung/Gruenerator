/**
 * Centralized provider selection and model override logic
 * Handles routing between Mistral, IONOS, LiteLLM, and other providers
 */

import type {
  ProviderName,
  ModelName,
  ProviderOptions,
  RequestMetadata,
  ProviderResult,
} from './types.js';

/**
 * Check if a model name is compatible with LiteLLM
 */
export function isLiteLLMCompatibleModel(modelName: string = ''): boolean {
  const name = String(modelName || '').toLowerCase();
  // LiteLLM models typically use prefixes like gpt-oss, or are mistral/mixtral variants
  // Exclude Mistral API models (mistral-large-2512, magistral-*, etc.)
  if (name.includes('gpt-oss') || name.includes('gpt-4') || name.includes('gpt-3')) {
    return true;
  }
  if (name.includes('mixtral') && !name.includes('-latest')) {
    return true;
  }
  // Mistral API models are NOT litellm compatible
  if (name.includes('mistral-') || name.includes('magistral-')) {
    return false;
  }
  return false;
}

/**
 * Determine if MAIN_LLM_OVERRIDE environment variable should be applied
 */
export function shouldAllowMainLlmOverride(
  options: ProviderOptions = {},
  metadata: RequestMetadata = {}
): boolean {
  if (options.privacyMode === true || metadata.privacyMode === true) return false;
  if (options.disableExternalProviders || metadata.requiresPrivacy) return false;
  return true;
}

/**
 * Infer provider from model name patterns
 */
export function determineProviderFromModel(modelName: string = ''): ProviderName {
  const name = String(modelName || '').toLowerCase();
  // Mistral API models (mistral-large, mistral-small, magistral-*)
  if (
    name.includes('mistral-medium-') ||
    name.includes('mistral-large-') ||
    name.includes('mistral-small-') ||
    name.includes('magistral-')
  ) {
    return 'mistral';
  }
  // OpenAI-compatible models via LiteLLM
  if (name.includes('gpt-') || name.includes('openai')) {
    return 'litellm';
  }
  // Mixtral models via LiteLLM
  if (name.includes('mistral') || name.includes('mixtral')) {
    return 'litellm';
  }
  // Llama models via IONOS
  if (name.includes('llama') || name.includes('meta-llama')) {
    return 'ionos';
  }
  // Regolo-prefixed models
  if (name.startsWith('regolo/') || name.includes('regolo')) {
    return 'regolo';
  }
  return 'mistral';
}

interface SelectProviderParams {
  type: string;
  options?: ProviderOptions;
  metadata?: RequestMetadata;
  env?: NodeJS.ProcessEnv;
}

/**
 * Select provider and model given request context and environment
 * Handles mode flags (ultra, pro), type-based routing, and environment overrides
 */
export function selectProviderAndModel({
  type,
  options = {},
  metadata = {},
  env = process.env,
}: SelectProviderParams): ProviderResult {
  // Base defaults — GPT-OSS 120B via LiteLLM as primary model
  let provider: ProviderName = (options.provider as ProviderName) || 'litellm';
  let model: ModelName = options.model || 'gpt-oss:120b';

  // Ultra mode (useUltraMode flag) - routes to IONOS with high-quality model
  if (options.useUltraMode === true) {
    provider = 'ionos';
    model = 'openai/gpt-oss-120b';
  }
  // Pro mode (useProMode flag) - routes to high-quality Magistral model
  else if (options.useProMode === true) {
    provider = 'mistral';
    model = options.model || 'magistral-medium-latest';
  }

  // Type-based defaults
  // Notebook enrichment - fast model
  if (type === 'notebook_enrich') {
    provider = 'mistral';
    model = options.model || 'mistral-large-2512';
  }
  // Fast mode QA draft - fast model
  else if (type === 'qa_draft_fast') {
    provider = 'mistral';
    model = options.model || 'mistral-large-2512';
  }
  // QA draft (final answer) — GPT-OSS with reasoning
  else if (type === 'qa_draft') {
    provider = 'litellm';
    model = options.model || 'gpt-oss:120b';
  }
  // QA intermediate steps (planner, repair, tools) — fast model
  else if (type === 'qa_tools' || type === 'qa_planner' || type === 'qa_repair') {
    provider = 'mistral';
    model = options.model || 'mistral-large-2512';
  }
  // Legislative documents — GPT-OSS (reasoning handled via reasoningEffort)
  else if (
    type === 'antrag_simple' ||
    type === 'antrag' ||
    type === 'kleine_anfrage' ||
    type === 'grosse_anfrage'
  ) {
    provider = 'litellm';
    model = options.model || 'gpt-oss:120b';
  }
  // Fast helper tasks — Mistral Small
  else if (type === 'antrag_question_generation' || type === 'antrag_qa_summary') {
    provider = 'mistral';
    model = options.model || 'mistral-small-latest';
  } else if (type === 'gruenerator_ask' || type === 'gruenerator_ask_grundsatz') {
    provider = 'mistral';
    model = options.model || 'mistral-small-latest';
  }
  // Sharepic types — short creative text, GPT-OSS
  else if (
    type === 'sharepic_dreizeilen' ||
    type === 'sharepic_zitat' ||
    type === 'sharepic_zitat_pure' ||
    type === 'sharepic_headline' ||
    type === 'sharepic_info' ||
    type === 'sharepic_veranstaltung'
  ) {
    provider = 'litellm';
    model = options.model || 'gpt-oss:120b';
  }

  // Respect explicit provider at top-level if present (routes may set data.provider)
  if (options.explicitProvider) {
    provider = options.explicitProvider;
    // When explicitly using litellm, ensure model is litellm-compatible
    if (provider === 'litellm' && !isLiteLLMCompatibleModel(model)) {
      // Use explicitly provided litellm model or default
      model = isLiteLLMCompatibleModel(options.model) ? options.model! : 'gpt-oss:120b';
    }
  }

  // MAIN_LLM_OVERRIDE environment variable
  const mainLlmOverride = env.MAIN_LLM_OVERRIDE;
  if (mainLlmOverride && shouldAllowMainLlmOverride(options, metadata)) {
    model = mainLlmOverride;
    provider = determineProviderFromModel(mainLlmOverride);
  }

  return { provider, model };
}
