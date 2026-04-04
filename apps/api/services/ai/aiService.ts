import * as providers from '../../workers/providers/index.js';
import config from '../../workers/worker.config.js';
import { PrivacyCounter } from '../counters/index.js';
import * as providerFallback from '../providers/providerFallback.js';
import * as providerSelector from '../providers/providerSelector.js';

import type { RedisClient } from '../../utils/redis/types.js';
import type {
  AIRequestData,
  AIWorkerResult,
  AIRequestOptions,
  AIWorkerPool,
} from '../../workers/types.js';
import type { ProviderName, PrivacyProviderData } from '../providers/types.js';

const SHAREPIC_TYPES = [
  'sharepic_dreizeilen',
  'sharepic_zitat',
  'sharepic_zitat_pure',
  'sharepic_headline',
  'sharepic_info',
  'sharepic_veranstaltung',
];

class AIService implements AIWorkerPool {
  private privacyCounter: PrivacyCounter | null;

  constructor(redisClient: RedisClient | null = null) {
    this.privacyCounter = redisClient ? new PrivacyCounter(redisClient) : null;
  }

  async processRequest(
    data: AIRequestData,
    req?: { user?: { id?: string } }
  ): Promise<AIWorkerResult> {
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;

    const processedData = { ...data };

    if (data.usePrivacyMode && this.privacyCounter && req) {
      try {
        const userId = req.user?.id;
        if (userId) {
          const privacyProvider = await this.privacyCounter.getProviderForUser(userId);
          processedData.provider = privacyProvider;
        } else {
          console.warn(
            '[AIService] Privacy mode enabled but no user ID found, using default provider'
          );
        }
      } catch (error) {
        console.error('[AIService] Privacy mode error:', error);
      }
    }

    return this.executeWithTimeout(requestId, processedData);
  }

  private async executeWithTimeout(
    requestId: string,
    data: AIRequestData
  ): Promise<AIWorkerResult> {
    const timeoutMs = config.worker.requestTimeout;

    return new Promise<AIWorkerResult>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Request timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      this.processAIRequest(requestId, data)
        .then((result) => {
          clearTimeout(timeout);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timeout);
          reject(error);
        });
    });
  }

  private async processAIRequest(requestId: string, data: AIRequestData): Promise<AIWorkerResult> {
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
      useProMode: !!options.useProMode,
      useUltraMode: !!options.useUltraMode,
    };

    console.log(`[AIService ${requestId}] Provider selection:`, {
      selectedProvider: selection.provider,
      selectedModel: selection.model,
      useProMode: !!effectiveOptions.useProMode,
      useUltraMode: !!effectiveOptions.useUltraMode,
      temperature: effectiveOptions.temperature ?? 'default',
      explicitProvider: data.provider || 'none',
    });

    try {
      let result: AIWorkerResult | undefined;

      const explicitProvider = data.provider || null;
      if (explicitProvider) {
        result = await providers.executeProvider(explicitProvider, requestId, {
          ...data,
          options: effectiveOptions,
        });
      }

      if (!result && effectiveOptions.useUltraMode === true && !explicitProvider) {
        effectiveOptions.model = 'openai/gpt-oss-120b';
        result = await providers.executeProvider('ionos', requestId, {
          ...data,
          options: effectiveOptions,
        });
      } else if (!result && effectiveOptions.useProMode === true && !explicitProvider) {
        result = await providers.executeProvider('mistral', requestId, {
          ...data,
          options: effectiveOptions,
        });
      } else if (!result && selection.provider === 'ionos' && !explicitProvider) {
        result = await providers.executeProvider('ionos', requestId, {
          ...data,
          options: effectiveOptions,
        });
      } else if (!result && selection.provider === 'litellm' && !explicitProvider) {
        result = await providers.executeProvider('litellm', requestId, {
          ...data,
          options: effectiveOptions,
        });
      } else if (!result && selection.provider === 'regolo' && !explicitProvider) {
        result = await providers.executeProvider('regolo', requestId, {
          ...data,
          options: effectiveOptions,
        });
      } else if (!result && !explicitProvider) {
        result = await providers.executeProvider('mistral', requestId, {
          ...data,
          options: effectiveOptions,
        });
      }

      const hasValidContent = result?.content || result?.stop_reason === 'tool_use';
      if (!hasValidContent) {
        console.warn(`[AIService ${requestId}] Empty response, trying fallback providers`);
        result = await this.executeFallback(requestId, type, data);
      }

      if (!result || (!result.content && result.stop_reason !== 'tool_use')) {
        throw new Error(`Empty or invalid result generated for request ${requestId}`);
      }

      if (
        result.stop_reason === 'tool_use' &&
        (!result.tool_calls || result.tool_calls.length === 0)
      ) {
        throw new Error(`Tool use indicated but no tool calls found for request ${requestId}`);
      }

      return this.enrichResult(result, requestId);
    } catch (error) {
      console.error(`[AIService] Error in processAIRequest for ${requestId}:`, error);
      try {
        const fallbackResult = await this.executeFallback(requestId, type, data);
        return this.enrichResult({ ...fallbackResult, success: true } as AIWorkerResult, requestId);
      } catch {
        throw error;
      }
    }
  }

  private enrichResult(result: AIWorkerResult, requestId: string): AIWorkerResult {
    if (result.metadata) {
      return {
        ...result,
        metadata: {
          ...result.metadata,
          requestId,
          processedAt: new Date().toISOString(),
        },
      };
    }
    return result;
  }

  private async executeFallback(
    requestId: string,
    type: string,
    data: AIRequestData
  ): Promise<AIWorkerResult> {
    const isSharepicType = SHAREPIC_TYPES.includes(type);
    const fallbackFn = isSharepicType
      ? providerFallback.trySharepicFallbackProviders
      : providerFallback.tryPrivacyModeProviders;

    console.log(
      `[AIService ${requestId}] Falling back to ${isSharepicType ? 'sharepic' : 'privacy mode'} providers`
    );

    const fallbackResult = await fallbackFn(
      async (providerName: ProviderName, privacyData) => {
        return providers.executeProvider(providerName, requestId, privacyData as AIRequestData);
      },
      requestId,
      {
        ...data,
        options: data.options || {},
      } as PrivacyProviderData
    );

    return { ...fallbackResult, success: true } as AIWorkerResult;
  }

  async shutdown(): Promise<void> {
    // No worker threads to terminate — nothing to clean up
  }
}

let instance: AIService | null = null;

function createAIService(redisClient: RedisClient | null = null): AIService {
  instance = new AIService(redisClient);
  return instance;
}

function getAIService(): AIService {
  if (!instance) {
    throw new Error('AIService not initialized. Call createAIService() first.');
  }
  return instance;
}

export { AIService, createAIService, getAIService };
