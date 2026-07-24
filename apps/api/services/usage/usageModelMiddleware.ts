/**
 * Transparent token accounting for every AI SDK model created in the main
 * process. Wrapping the model instead of the ~60 call sites keeps the
 * instrumentation in one place: `wrapGenerate` reads the usage off the result,
 * `wrapStream` taps the `finish` chunk as it passes through.
 *
 * NOTE: the worker-thread provider adapters call `getModel` too, but they run
 * without a usage context, so this middleware records nothing there. Worker
 * calls are accounted for once in AIWorkerPool.processRequest, from the usage
 * the adapters already return in `metadata.usage`. Do not "fix" that asymmetry
 * — it is what prevents double counting.
 */

import { wrapLanguageModel } from 'ai';

import { getUsageFeature, getUsageUserId } from '../../utils/usageContext.js';

import { recordTokenUsage } from './UsageTrackingService.js';

import type { LanguageModel, LanguageModelMiddleware } from 'ai';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Tolerant token extraction: AI SDK v4 nests counts (`inputTokens.total`)
 * while older provider specs report flat numbers. Both reach this code path
 * depending on the wrapped model's specification version.
 */
function tokenCount(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (isRecord(value) && typeof value.total === 'number') return value.total;
  return 0;
}

function extractUsage(usage: unknown): { inputTokens: number; outputTokens: number } {
  if (!isRecord(usage)) return { inputTokens: 0, outputTokens: 0 };
  return {
    inputTokens: tokenCount(usage.inputTokens ?? usage.promptTokens),
    outputTokens: tokenCount(usage.outputTokens ?? usage.completionTokens),
  };
}

/**
 * Wrap a model so its token usage is attributed to the current request's user.
 * A plain string model id has no call hook to wrap and is passed through.
 */
export function withUsageTracking(model: LanguageModel, provider: string): LanguageModel {
  if (typeof model === 'string') return model;

  const middleware: LanguageModelMiddleware = {
    wrapGenerate: async ({ doGenerate, model: wrapped }) => {
      // Captured here, not in the callback: the flush may outlive the context.
      const userId = getUsageUserId();
      const feature = getUsageFeature();
      const result = await doGenerate();
      if (userId) {
        recordTokenUsage({
          provider,
          model: wrapped.modelId,
          feature,
          userId,
          ...extractUsage(result.usage),
        });
      }
      return result;
    },

    wrapStream: async ({ doStream, model: wrapped }) => {
      const userId = getUsageUserId();
      const feature = getUsageFeature();
      const { stream, ...rest } = await doStream();

      if (!userId) return { stream, ...rest };

      const tap = new TransformStream<unknown, unknown>({
        transform(chunk, controller) {
          if (isRecord(chunk) && chunk.type === 'finish') {
            recordTokenUsage({
              provider,
              model: wrapped.modelId,
              feature,
              userId,
              ...extractUsage(chunk.usage),
            });
          }
          controller.enqueue(chunk);
        },
      });

      return {
        stream: stream.pipeThrough(tap as TransformStream<never, never>),
        ...rest,
      };
    },
  };

  return wrapLanguageModel({ model, middleware });
}
