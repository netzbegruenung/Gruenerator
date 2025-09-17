// Privacy mode fallback execution helper (CommonJS)

/**
 * Try privacy-friendly providers in order, using a caller-supplied executor.
 * @param {(providerName: string, data: object) => Promise<object>} execForProvider
 * @param {string} requestId
 * @param {object} data
 * @param {Array<string>} chain
 */
async function tryPrivacyModeProviders(execForProvider, requestId, data, chain = ['litellm', 'ionos']) {
  let lastError;
  for (const provider of chain) {
    try {
      const privacyData = {
        ...data,
        options: {
          ...(data.options || {}),
          provider,
          model: provider === 'litellm' ? 'llama3.3' : 'meta-llama/Llama-3.3-70B-Instruct'
        }
      };
      return await execForProvider(provider, privacyData);
    } catch (err) {
      lastError = err;
      continue;
    }
  }
  const msg = lastError?.message || 'Unknown error';
  throw new Error(`All privacy mode providers failed. Last error: ${msg}`);
}

module.exports = { tryPrivacyModeProviders };

