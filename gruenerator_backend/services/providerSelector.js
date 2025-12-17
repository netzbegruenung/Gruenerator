// Centralized provider selection and model override logic (CommonJS)

/**
 * Check if a model name is compatible with LiteLLM
 */
function isLiteLLMCompatibleModel(modelName = '') {
  const name = String(modelName || '').toLowerCase();
  // LiteLLM models typically use prefixes like gpt-oss, or are mistral/mixtral variants
  // Exclude Mistral API models (mistral-medium-latest, magistral-*, etc.)
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

function shouldAllowMainLlmOverride(options = {}, metadata = {}) {
  if (options.privacyMode === true || metadata.privacyMode === true) return false;
  if (options.disableExternalProviders || metadata.requiresPrivacy) return false;
  return true;
}

function determineProviderFromModel(modelName = '') {
  const name = String(modelName || '').toLowerCase();
  if (name.includes('arn:aws:bedrock') || name.includes('anthropic.claude') || name.includes('anthropic/claude')) {
    return 'bedrock';
  }
  if (name.includes('gpt-') || name.includes('openai')) {
    return 'openai';
  }
  if (name.includes('mistral-medium-') || name.includes('mistral-large-') || name.includes('mistral-small-')) {
    return 'mistral';
  }
  if (name.includes('mistral') || name.includes('mixtral')) {
    return 'litellm';
  }
  if (name.includes('llama') || name.includes('meta-llama')) {
    return 'ionos';
  }
  return 'litellm';
}

/**
 * Select provider and model given request context and env
 * @param {Object} params
 * @param {string} params.type
 * @param {Object} params.options
 * @param {Object} params.metadata
 * @param {Object} params.env
 * @returns {{provider: string, model: string, useBedrock?: boolean}}
 */
function selectProviderAndModel({ type, options = {}, metadata = {}, env = process.env }) {
  // Base defaults
  let provider = options.provider || 'mistral';
  let model = options.model || 'mistral-medium-latest';
  let useBedrock = false;

  // Ultra mode (useUltraMode flag) - routes to Claude Sonnet 4.5 via Bedrock
  if (options.useUltraMode === true) {
    provider = 'bedrock';
    useBedrock = true;
    model = 'arn:aws:bedrock:eu-central-1:481665093592:inference-profile/eu.anthropic.claude-sonnet-4-5-20250929-v1:0';
  }
  // Pro mode (useProMode flag) - routes to high-quality Magistral model
  else if (options.useProMode === true) {
    provider = 'mistral';
    model = options.model || 'magistral-medium-latest';
    useBedrock = false;
  }
  // Bedrock mode (useBedrock flag) - routes to high-quality Bedrock model
  else if (options.useBedrock === true) {
    provider = 'bedrock';
    useBedrock = true;
    // Use Claude 4.5 for Bedrock mode unless specific model is requested
    model = options.model || 'arn:aws:bedrock:eu-central-1:481665093592:inference-profile/eu.anthropic.claude-sonnet-4-5-20250929-v1:0';
  }

  // Type-based defaults (preserve existing special cases)
  // QA draft (final answer) uses magistral for higher quality
  if (type === 'qa_draft') {
    provider = 'mistral';
    model = options.model || 'magistral-medium-latest';
    useBedrock = false;
  }
  // QA intermediate steps (planner, repair, tools) use standard model
  else if (type === 'qa_tools' || type === 'qa_planner' || type === 'qa_repair') {
    provider = 'mistral';
    model = options.model || 'mistral-medium-latest';
    useBedrock = false;
  } else if (type === 'antrag_simple' || type === 'antrag' || type === 'kleine_anfrage' || type === 'grosse_anfrage') {
    provider = 'mistral';
    model = options.model || 'magistral-medium-latest';
    useBedrock = false;
  } else if (type === 'antrag_question_generation' || type === 'antrag_qa_summary') {
    provider = 'mistral';
    model = options.model || 'mistral-small-latest';
    useBedrock = false;
  } else if (type === 'gruenerator_ask' || type === 'gruenerator_ask_grundsatz') {
    provider = 'bedrock';
    useBedrock = true;
    model = options.model || 'anthropic.claude-3-haiku-20240307-v1:0';
  }

  // Respect explicit provider at top-level if present (routes may set data.provider)
  if (options.explicitProvider) {
    provider = options.explicitProvider;
    // When explicitly using litellm, ensure model is litellm-compatible
    if (provider === 'litellm' && !isLiteLLMCompatibleModel(model)) {
      // Use explicitly provided litellm model or default
      model = isLiteLLMCompatibleModel(options.model) ? options.model : 'gpt-oss:120b';
    }
  }

  // MAIN_LLM override
  const mainLlmOverride = env.MAIN_LLM_OVERRIDE;
  if (mainLlmOverride && shouldAllowMainLlmOverride(options, metadata)) {
    model = mainLlmOverride;
    provider = determineProviderFromModel(mainLlmOverride);
  }

  return { provider, model, useBedrock };
}

module.exports = {
  shouldAllowMainLlmOverride,
  determineProviderFromModel,
  selectProviderAndModel
};

