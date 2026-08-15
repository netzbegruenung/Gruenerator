import { env } from '../../config/env.js';
import { AiProviderError, classifyProviderError } from '../providers/providerErrors.js';
import * as providerFallback from '../providers/providerFallback.js';
import * as providerSelector from '../providers/providerSelector.js';

import * as providers from './execution/index.js';

import type { AIRequestData, AiResult, AIRequestOptions, AiClient } from './types.js';
import type { RedisClient } from '../../utils/redis/types.js';
import type { ProviderName, FallbackProviderData } from '../providers/types.js';

/**
 * Wall clock for one generation, fallback chain included. The only setting the
 * retired `worker.config.ts` ever had an effect through — the ~18 others it
 * exposed (rate limits, retry counts, debug flags) were read by nobody.
 *
 * It does not cancel the provider request: `generateText` gets no signal, so a
 * timeout here resolves the promise and leaves the HTTP call running.
 */
const REQUEST_TIMEOUT_MS = env.REQUEST_TIMEOUT;

const SHAREPIC_TYPES = [
  'sharepic_dreizeilen',
  'sharepic_zitat',
  'sharepic_zitat_pure',
  'sharepic_headline',
  'sharepic_info',
  'sharepic_veranstaltung',
];

class AIService implements AiClient {
  /**
   * The one classification point. Everything below throws raw — adapters throw
   * the SDK's `APICallError`, the fallback chain throws an aggregate carrying
   * the last one as `cause`, the timeout throws a plain Error — and this
   * boundary turns whatever arrives into an `AiProviderError` the route layer
   * can branch on (`sseHelpers` distinguishes rate limit / provider down / bad
   * request / retryable).
   *
   * The `worker_threads` pool used to do this after rebuilding the error from a
   * postMessage payload; when it went, so did the only place `AiProviderError`
   * was ever constructed, and every provider failure has been reaching the
   * client as a bare `internal` since.
   */
  async processRequest(data: AIRequestData, _req?: { user?: { id?: string } }): Promise<AiResult> {
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
    try {
      return await this.executeWithTimeout(requestId, { ...data });
    } catch (error) {
      if (error instanceof AiProviderError) throw error;
      const message = error instanceof Error ? error.message : String(error);
      throw new AiProviderError(message, classifyProviderError(error), { cause: error });
    }
  }

  private async executeWithTimeout(requestId: string, data: AIRequestData): Promise<AiResult> {
    // Der Aufrufer darf sein eigenes Budget setzen. Der globale Wert ist an der
    // interaktiven Antwort bemessen; ein Nachschritt, der erst nach dem Streamen
    // läuft, hat einen anderen Massstab — dort ist Warten billiger als Ausfall.
    const timeoutMs = data.timeoutMs ?? REQUEST_TIMEOUT_MS;

    return new Promise<AiResult>((resolve, reject) => {
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

  private async processAIRequest(requestId: string, data: AIRequestData): Promise<AiResult> {
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

    console.log(`[AIService ${requestId}] Provider selection:`, {
      selectedProvider: selection.provider,
      selectedModel: selection.model,
      temperature: effectiveOptions.temperature ?? 'default',
      explicitProvider: data.provider || 'none',
    });

    try {
      // The chosen provider, run. This used to be an if/else chain naming
      // litellm and regolo explicitly and sending everything else to mistral —
      // so a `greenpt` selection quietly answered on mistral, and any fifth
      // provider would have too. For the three branches that were reachable
      // this is the identity.
      let result = await providers.executeProvider(data.provider || selection.provider, requestId, {
        ...data,
        options: effectiveOptions,
      });

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
        return this.enrichResult({ ...fallbackResult, success: true } as AiResult, requestId);
      } catch {
        throw error;
      }
    }
  }

  private enrichResult(result: AiResult, requestId: string): AiResult {
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
  ): Promise<AiResult> {
    const isSharepicType = SHAREPIC_TYPES.includes(type);
    const fallbackFn = isSharepicType
      ? providerFallback.trySharepicFallbackProviders
      : providerFallback.tryFallbackProviders;

    console.log(
      `[AIService ${requestId}] Falling back to ${isSharepicType ? 'sharepic' : 'default'} providers`
    );

    const fallbackResult = await fallbackFn(
      async (providerName: ProviderName, fallbackData) => {
        return providers.executeProvider(providerName, requestId, fallbackData as AIRequestData);
      },
      requestId,
      {
        ...data,
        options: data.options || {},
      } as FallbackProviderData
    );

    return { ...fallbackResult, success: true } as AiResult;
  }

  async shutdown(): Promise<void> {
    // No worker threads to terminate — nothing to clean up
  }
}

let instance: AIService | null = null;

function createAIService(_redisClient: RedisClient | null = null): AIService {
  instance = new AIService();
  return instance;
}

function getAIService(): AIService {
  if (!instance) {
    throw new Error('AIService not initialized. Call createAIService() first.');
  }
  return instance;
}

export { AIService, createAIService, getAIService };
