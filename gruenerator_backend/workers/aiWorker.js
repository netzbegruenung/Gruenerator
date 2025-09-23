const { parentPort } = require('worker_threads');
const providerSelector = require('../services/providerSelector');
const providerFallback = require('../services/providerFallback');
const providers = require('./providers');
require('dotenv').config();

// Logging controls
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const isDebug = LOG_LEVEL === 'debug';
const isVerbose = ['debug', 'verbose'].includes(LOG_LEVEL);

// (API clients are owned by provider adapters)

// Process incoming messages with new message protocol
parentPort.on('message', async (message) => {
  const { type, requestId, data } = message;
  
  if (type !== 'request') {
    console.warn(`[AI Worker] Received unknown message type: ${type}`);
    return;
  }
  
  
  try {
    // Send progress update at 10%
    sendProgress(requestId, 10);
    
    // Process the request
    const result = await processAIRequest(requestId, data);
    
    // Validate result before sending - handle both text and tool responses
    
    if (!result || (!result.content && result.stop_reason !== 'tool_use')) {
      throw new Error(`Empty or invalid result generated for request ${requestId}`);
    }
    
    // For tool_use responses, ensure we have tool_calls
    if (result.stop_reason === 'tool_use' && (!result.tool_calls || result.tool_calls.length === 0)) {
      throw new Error(`Tool use indicated but no tool calls found for request ${requestId}`);
    }
    
    // Send back the successful result
    parentPort.postMessage({
      type: 'response',
      requestId,
      data: result
    });
    
  } catch (error) {
    console.error(`[AI Worker] Error processing request ${requestId}:`, error);
    
    // Send back the error
    parentPort.postMessage({
      type: 'error',
      requestId,
      error: error.message || 'Unknown error'
    });
  }
});

// Helper function to send progress updates (disabled for cleaner logs)
function sendProgress(requestId, progress) {
  // Progress updates disabled to reduce log noise
  // Only enable for debugging if needed
  return;
}

// (metadata merge and provider override logic moved to adapters/providerSelector)

/**
 * Determine provider from model name
 * @param {string} modelName - The model identifier
 * @returns {string} Provider name
 */
// (model→provider resolution moved to providerSelector)

/**
 * Privacy mode fallback system - tries privacy-friendly providers in sequence
 * @param {string} requestId - Request identifier
 * @param {Object} data - Request data
 * @returns {Promise<Object>} AI response result
 */
// (privacy fallback moved to services/providerFallback)

// Main AI request processing function
async function processAIRequest(requestId, data) {
  // Destructure data, ensuring options exists and preserve original metadata
  const { type, prompt, options = {}, systemPrompt, messages, metadata: requestMetadata = {} } = data;

  // Provider selection delegated to selector (preserves legacy behavior)
  const selection = providerSelector.selectProviderAndModel({
    type,
    options,
    metadata: requestMetadata,
    env: process.env
  });
  let effectiveOptions = { ...options, provider: selection.provider, model: selection.model, useBedrock: !!selection.useBedrock };

  try {
    let result;
    
    // Check for explicit provider override - check both data.provider and options.provider
    // Only treat top-level data.provider as explicit; selection.provider is a default
    const explicitProvider = data.provider || null;
    if (explicitProvider) {
      sendProgress(requestId, 15);
      result = await providers.executeProvider(explicitProvider, requestId, { ...data, options: effectiveOptions });
    }

    // Default logic refactor: prefer Mistral by default; use Claude only when explicitly chosen; Bedrock only when enabled by flow/options.
    if (!result && explicitProvider === 'claude') {
      sendProgress(requestId, 15);
      result = await providers.executeProvider('claude', requestId, { ...data, options: effectiveOptions });
    } else if (!result && effectiveOptions.useBedrock === true && !explicitProvider) {
      sendProgress(requestId, 15);
      result = await providers.executeProvider('bedrock', requestId, { ...data, options: effectiveOptions });
    } else if (!result && !explicitProvider) {
      sendProgress(requestId, 15);
      result = await providers.executeProvider('mistral', requestId, { ...data, options: effectiveOptions });
    }

    sendProgress(requestId, 100);
    return result;

  } catch (error) {
    console.error(`[AI Worker] Error in processAIRequest for ${requestId}:`, error);
    // Final safety net: try privacy mode providers as backup via helper
    try {
      const result = await providerFallback.tryPrivacyModeProviders(async (providerName, privacyData) => {
        return providers.executeProvider(providerName, requestId, privacyData);
      }, requestId, data);
      return result;
    } catch (privacyError) {
      throw error;
    }
  }
}





