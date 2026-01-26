import { parentPort } from 'worker_threads';
import * as providerSelector from '../services/providers/providerSelector.js';
import * as providerFallback from '../services/providers/providerFallback.js';
import * as providers from './providers/index.js';
import type {
  WorkerRequestMessage,
  AIRequestData,
  AIWorkerResult,
  AIRequestOptions,
} from './types.js';
import type { ProviderName } from '../services/providers/types.js';

const SHAREPIC_TYPES = [
  'sharepic_dreizeilen',
  'sharepic_zitat',
  'sharepic_zitat_pure',
  'sharepic_headline',
  'sharepic_info',
  'sharepic_veranstaltung',
];

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
require('dotenv').config({ quiet: true });

const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

if (!parentPort) {
  throw new Error('aiWorker must be run as a worker thread');
}

parentPort.on('message', async (message: WorkerRequestMessage) => {
  const { type, requestId, data } = message;

  if (type !== 'request') {
    console.warn(`[AI Worker] Received unknown message type: ${type}`);
    return;
  }

  try {
    sendProgress(requestId, 10);

    const result = await processAIRequest(requestId, data);

    if (!result || (!result.content && result.stop_reason !== 'tool_use')) {
      throw new Error(`Empty or invalid result generated for request ${requestId}`);
    }

    if (
      result.stop_reason === 'tool_use' &&
      (!result.tool_calls || result.tool_calls.length === 0)
    ) {
      throw new Error(`Tool use indicated but no tool calls found for request ${requestId}`);
    }

    parentPort!.postMessage({
      type: 'response',
      requestId,
      data: result,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[AI Worker] Error processing request ${requestId}:`, error);

    parentPort!.postMessage({
      type: 'error',
      requestId,
      error: errorMessage,
    });
  }
});

function sendProgress(requestId: string, progress: number): void {
  // Progress updates disabled to reduce log noise
}

async function processAIRequest(requestId: string, data: AIRequestData): Promise<AIWorkerResult> {
  const { type, options = {}, systemPrompt, messages, metadata: requestMetadata = {} } = data;

  const selection = providerSelector.selectProviderAndModel({
    type,
    options,
    metadata: requestMetadata,
    env: process.env,
  });

  const effectiveOptions: AIRequestOptions = {
    ...options,
    provider: selection.provider,
    model: selection.model,
    useProMode: !!options.useProMode,
    useUltraMode: !!options.useUltraMode,
  };

  console.log(`[AI Worker ${requestId}] Provider selection:`, {
    selectedProvider: selection.provider,
    selectedModel: selection.model,
    useProMode: !!effectiveOptions.useProMode,
    useUltraMode: !!effectiveOptions.useUltraMode,
    temperature: effectiveOptions.temperature || 'default',
    explicitProvider: data.provider || 'none',
  });

  if (data.instructions) {
    console.log(`[AI Worker ${requestId}] Instructions:`, data.instructions);
  }

  try {
    let result: AIWorkerResult | undefined;

    const explicitProvider = data.provider || null;
    if (explicitProvider) {
      console.log(
        `[AI Worker ${requestId}] Using explicit provider: ${explicitProvider} with temperature: ${effectiveOptions.temperature || 'default'}`
      );
      sendProgress(requestId, 15);
      result = await providers.executeProvider(explicitProvider, requestId, {
        ...data,
        options: effectiveOptions,
      });
    }

    if (!result && explicitProvider === 'claude') {
      console.log(
        `[AI Worker ${requestId}] Using Claude provider with temperature: ${effectiveOptions.temperature || 'default'}`
      );
      sendProgress(requestId, 15);
      result = await providers.executeProvider('claude', requestId, {
        ...data,
        options: effectiveOptions,
      });
    } else if (!result && effectiveOptions.useUltraMode === true && !explicitProvider) {
      // Ultra Mode now uses IONOS with high-quality model
      console.log(
        `[AI Worker ${requestId}] Using Ultra Mode (IONOS) with temperature: ${effectiveOptions.temperature || 'default'}`
      );
      sendProgress(requestId, 15);
      effectiveOptions.model = 'openai/gpt-oss-120b';
      result = await providers.executeProvider('ionos', requestId, {
        ...data,
        options: effectiveOptions,
      });
    } else if (!result && effectiveOptions.useProMode === true && !explicitProvider) {
      console.log(
        `[AI Worker ${requestId}] Using Pro Mode (Magistral) provider with temperature: ${effectiveOptions.temperature || 'default'}`
      );
      sendProgress(requestId, 15);
      result = await providers.executeProvider('mistral', requestId, {
        ...data,
        options: effectiveOptions,
      });
    } else if (!result && selection.provider === 'ionos' && !explicitProvider) {
      console.log(
        `[AI Worker ${requestId}] Using IONOS provider with temperature: ${effectiveOptions.temperature || 'default'}`
      );
      sendProgress(requestId, 15);
      result = await providers.executeProvider('ionos', requestId, {
        ...data,
        options: effectiveOptions,
      });
    } else if (!result && selection.provider === 'litellm' && !explicitProvider) {
      console.log(
        `[AI Worker ${requestId}] Using LiteLLM provider with temperature: ${effectiveOptions.temperature || 'default'}`
      );
      sendProgress(requestId, 15);
      result = await providers.executeProvider('litellm', requestId, {
        ...data,
        options: effectiveOptions,
      });
    } else if (!result && !explicitProvider) {
      console.log(
        `[AI Worker ${requestId}] Using default Mistral provider with temperature: ${effectiveOptions.temperature || 'default'}`
      );
      sendProgress(requestId, 15);
      result = await providers.executeProvider('mistral', requestId, {
        ...data,
        options: effectiveOptions,
      });
    }

    const hasValidContent = result?.content || result?.stop_reason === 'tool_use';
    if (!hasValidContent) {
      console.warn(`[AI Worker ${requestId}] Empty response, trying fallback providers`);

      // Use sharepic-specific fallback for sharepic types
      const isSharepicType = SHAREPIC_TYPES.includes(type);
      const fallbackFn = isSharepicType
        ? providerFallback.trySharepicFallbackProviders
        : providerFallback.tryPrivacyModeProviders;

      const fallbackResult = await fallbackFn(
        async (providerName: ProviderName, privacyData) => {
          return providers.executeProvider(providerName, requestId, privacyData as AIRequestData);
        },
        requestId,
        {
          ...data,
          options: data.options || {},
        } as unknown as import('../services/providers/types.js').PrivacyProviderData
      );
      result = { ...fallbackResult, success: true } as AIWorkerResult;
    }

    sendProgress(requestId, 100);
    return result!;
  } catch (error) {
    console.error(`[AI Worker] Error in processAIRequest for ${requestId}:`, error);
    try {
      // Use sharepic-specific fallback for sharepic types
      const isSharepicType = SHAREPIC_TYPES.includes(type);
      const fallbackFn = isSharepicType
        ? providerFallback.trySharepicFallbackProviders
        : providerFallback.tryPrivacyModeProviders;

      console.log(
        `[AI Worker ${requestId}] Falling back to ${isSharepicType ? 'sharepic' : 'privacy mode'} providers`
      );
      const fallbackResult = await fallbackFn(
        async (providerName: ProviderName, privacyData) => {
          const temp = (privacyData.options as unknown as { temperature?: number })?.temperature;
          console.log(
            `[AI Worker ${requestId}] Trying fallback provider: ${providerName} with temperature: ${temp || 'default'}`
          );
          return providers.executeProvider(providerName, requestId, privacyData as AIRequestData);
        },
        requestId,
        {
          ...data,
          options: data.options || {},
        } as unknown as import('../services/providers/types.js').PrivacyProviderData
      );
      return { ...fallbackResult, success: true } as AIWorkerResult;
    } catch {
      throw error;
    }
  }
}
