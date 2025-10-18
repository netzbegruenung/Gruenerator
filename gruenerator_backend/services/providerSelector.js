// Centralized provider selection and model override logic (CommonJS)

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

  // Pro mode (useBedrock flag) - routes to high-quality Bedrock model
  if (options.useBedrock === true) {
    provider = 'bedrock';
    useBedrock = true;
    // Use Claude 4 for Pro mode unless specific model is requested
    model = options.model || 'arn:aws:bedrock:eu-central-1:481665093592:inference-profile/eu.anthropic.claude-sonnet-4-20250514-v1:0';
  }

  // Type-based defaults (preserve existing special cases)
  if (type === 'qa_tools') {
    provider = 'mistral';
    model = options.model || 'mistral-medium-latest';
    useBedrock = false;
  } else if (type === 'gruenerator_ask' || type === 'gruenerator_ask_grundsatz') {
    provider = 'bedrock';
    useBedrock = true;
    model = options.model || 'anthropic.claude-3-haiku-20240307-v1:0';
  }

  // Respect explicit provider at top-level if present (routes may set data.provider)
  if (options.explicitProvider) {
    provider = options.explicitProvider;
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

