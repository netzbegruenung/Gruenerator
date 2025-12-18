// Privacy mode fallback execution helper (CommonJS)

/**
 * Check if a provider is available based on environment configuration
 * @param {string} provider - Provider name
 * @returns {boolean} True if provider is configured and available
 */
function isProviderAvailable(provider) {
  switch (provider) {
    case 'ionos':
      return !!process.env.IONOS_API_TOKEN;
    case 'litellm':
      return !!process.env.LITELLM_API_KEY;
    case 'mistral':
      return !!process.env.MISTRAL_API_KEY;
    case 'openai':
      return !!process.env.OPENAI_API_KEY;
    case 'claude':
      return !!process.env.CLAUDE_API_KEY;
    case 'bedrock':
      // Bedrock uses AWS credentials, check for region or access key
      return !!(process.env.AWS_REGION || process.env.AWS_ACCESS_KEY_ID);
    default:
      return false;
  }
}

/**
 * Get the appropriate model for a privacy fallback provider
 * @param {string} provider - Provider name
 * @returns {string} Model name to use
 */
function getPrivacyModelForProvider(provider) {
  switch (provider) {
    case 'ionos':
      return 'openai/gpt-oss-120b';
    case 'litellm':
      return 'gpt-oss:120b';
    case 'mistral':
      return 'mistral-medium-latest';
    default:
      return 'gpt-oss:120b';
  }
}

/**
 * Try privacy-friendly providers in order, using a caller-supplied executor.
 * Only attempts providers that have the required API tokens configured.
 * @param {(providerName: string, data: object) => Promise<object>} execForProvider
 * @param {string} requestId
 * @param {object} data
 * @param {Array<string>} chain - Default chain: LiteLLM → Mistral → IONOS → Bedrock
 */
async function tryPrivacyModeProviders(execForProvider, requestId, data, chain = ['litellm', 'mistral', 'ionos', 'bedrock']) {
  let lastError;
  let attemptedProviders = [];

  for (const provider of chain) {
    // Skip providers that are not configured
    if (!isProviderAvailable(provider)) {
      console.log(`[ProviderFallback ${requestId}] Skipping ${provider} - not configured`);
      continue;
    }

    attemptedProviders.push(provider);

    try {
      console.log(`[ProviderFallback ${requestId}] Trying fallback provider: ${provider}`);
      const privacyData = {
        ...data,
        options: {
          ...(data.options || {}),
          provider,
          model: getPrivacyModelForProvider(provider)
        }
      };
      const result = await execForProvider(provider, privacyData);

      // Validate the response has content
      if (result?.content || result?.stop_reason === 'tool_use') {
        console.log(`[ProviderFallback ${requestId}] Success with provider: ${provider}`);
        return result;
      }

      // Empty response, try next provider
      console.warn(`[ProviderFallback ${requestId}] Empty response from ${provider}, trying next`);
      lastError = new Error(`Empty response from ${provider}`);
    } catch (err) {
      console.warn(`[ProviderFallback ${requestId}] Error from ${provider}: ${err.message}`);
      lastError = err;
      continue;
    }
  }

  if (attemptedProviders.length === 0) {
    throw new Error('No privacy mode providers are configured. Please set LITELLM_API_KEY, MISTRAL_API_KEY, IONOS_API_TOKEN, or AWS credentials');
  }

  const msg = lastError?.message || 'Unknown error';
  throw new Error(`All privacy mode providers failed (tried: ${attemptedProviders.join(', ')}). Last error: ${msg}`);
}

module.exports = { tryPrivacyModeProviders, isProviderAvailable, getPrivacyModelForProvider };

