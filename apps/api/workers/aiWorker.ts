import 'dotenv/config';
import { parentPort } from 'worker_threads';

import { classifyProviderError } from '../services/providers/providerErrors.js';
import * as providerFallback from '../services/providers/providerFallback.js';
import * as providerSelector from '../services/providers/providerSelector.js';

import * as providers from './providers/index.js';

import type {
  WorkerRequestMessage,
  AIRequestData,
  AIWorkerResult,
  AIRequestOptions,
} from './types.js';
import type { ProviderName, PrivacyProviderData } from '../services/providers/types.js';

const SHAREPIC_TYPES = [
  'sharepic_dreizeilen',
  'sharepic_zitat',
  'sharepic_zitat_pure',
  'sharepic_headline',
  'sharepic_info',
  'sharepic_veranstaltung',
];

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
      errorInfo: classifyProviderError(error),
    });
  }
});

function sendProgress(_requestId: string, _progress: number): void {
  // Progress updates disabled to reduce log noise
}

async function processAIRequest(requestId: string, data: AIRequestData): Promise<AIWorkerResult> {
  const { type, options = {}, metadata: requestMetadata = {} } = data;

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
  };

  console.log(`[AI Worker ${requestId}] Provider selection:`, {
    selectedProvider: selection.provider,
    selectedModel: selection.model,
    temperature: effectiveOptions.temperature ?? 'default',
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
        `[AI Worker ${requestId}] Using explicit provider: ${explicitProvider} with temperature: ${effectiveOptions.temperature ?? 'default'}`
      );
      sendProgress(requestId, 15);
      result = await providers.executeProvider(explicitProvider, requestId, {
        ...data,
        options: effectiveOptions,
      });
    }

    if (!result && selection.provider === 'litellm' && !explicitProvider) {
      console.log(
        `[AI Worker ${requestId}] Using LiteLLM provider with temperature: ${effectiveOptions.temperature ?? 'default'}`
      );
      sendProgress(requestId, 15);
      result = await providers.executeProvider('litellm', requestId, {
        ...data,
        options: effectiveOptions,
      });
    } else if (!result && selection.provider === 'regolo' && !explicitProvider) {
      console.log(
        `[AI Worker ${requestId}] Using Regolo provider with temperature: ${effectiveOptions.temperature ?? 'default'}`
      );
      sendProgress(requestId, 15);
      result = await providers.executeProvider('regolo', requestId, {
        ...data,
        options: effectiveOptions,
      });
    } else if (!result && !explicitProvider) {
      console.log(
        `[AI Worker ${requestId}] Using default Mistral provider with temperature: ${effectiveOptions.temperature ?? 'default'}`
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

      const fallbackData: PrivacyProviderData = {
        ...data,
        options: data.options || {},
      };
      const fallbackResult = await fallbackFn(
        async (providerName: ProviderName, privacyData) => {
          return providers.executeProvider(providerName, requestId, privacyData as AIRequestData);
        },
        requestId,
        fallbackData
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
      const errorFallbackData: PrivacyProviderData = {
        ...data,
        options: data.options || {},
      };
      const fallbackResult = await fallbackFn(
        async (providerName: ProviderName, privacyData) => {
          const temp = (privacyData.options as AIRequestOptions | undefined)?.temperature;
          console.log(
            `[AI Worker ${requestId}] Trying fallback provider: ${providerName} with temperature: ${temp ?? 'default'}`
          );
          return providers.executeProvider(providerName, requestId, privacyData as AIRequestData);
        },
        requestId,
        errorFallbackData
      );
      return { ...fallbackResult, success: true } as AIWorkerResult;
    } catch {
      throw error;
    }
  }
}
