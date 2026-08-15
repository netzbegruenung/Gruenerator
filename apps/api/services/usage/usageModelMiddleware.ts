/**
 * Transparent token accounting for every AI SDK model created in the main
 * process. Wrapping the model instead of the ~60 call sites keeps the
 * instrumentation in one place: `wrapGenerate` reads the usage off the result,
 * `wrapStream` taps the `finish` chunk as it passes through.
 *
 * This is the ONLY place usage is recorded. An earlier note here claimed the
 * provider adapters were accounted for separately, inside
 * `AiClient.processRequest`, and warned against "fixing" the asymmetry —
 * that was true of the `worker_threads` pool, which is gone. The adapters now
 * run in this process, on models from `getModel`, and are counted right here.
 * Adding a second recorder for them would double-count.
 *
 * Dieselbe Hülle misst auch, WIE SCHNELL geantwortet wurde — Durchsatz und Zeit
 * bis zum ersten Token, je Provider/Modell (services/ai/modelHealth.ts). Die
 * Buchhaltung braucht dafür einen angemeldeten Nutzer, die Messung nicht: sonst
 * bliebe alles unbeobachtet, was ohne Anmeldung läuft (Cron, Scraper) — und der
 * Thread-Titel, den niemand abwartet, ist die grösste Lane im System.
 */

import { wrapLanguageModel } from 'ai';

import { getUsageFeature, getUsageUserId } from '../../utils/usageContext.js';
import { recordModelSample } from '../ai/modelHealth.js';

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
      const startedAt = Date.now();
      const result = await doGenerate();
      const usage = extractUsage(result.usage);
      recordModelSample({
        provider,
        model: wrapped.modelId,
        outputTokens: usage.outputTokens,
        durationMs: Date.now() - startedAt,
      });
      if (userId) {
        recordTokenUsage({ provider, model: wrapped.modelId, feature, userId, ...usage });
      }
      return result;
    },

    wrapStream: async ({ doStream, model: wrapped }) => {
      const userId = getUsageUserId();
      const feature = getUsageFeature();
      const startedAt = Date.now();
      const { stream, ...rest } = await doStream();
      let firstTextAt: number | null = null;

      const tap = new TransformStream<unknown, unknown>({
        transform(chunk, controller) {
          if (isRecord(chunk)) {
            if (firstTextAt === null && chunk.type === 'text-delta') firstTextAt = Date.now();
            if (chunk.type === 'finish') {
              const usage = extractUsage(chunk.usage);
              recordModelSample({
                provider,
                model: wrapped.modelId,
                outputTokens: usage.outputTokens,
                durationMs: Date.now() - startedAt,
                ttftMs: firstTextAt === null ? null : firstTextAt - startedAt,
              });
              if (userId) {
                recordTokenUsage({ provider, model: wrapped.modelId, feature, userId, ...usage });
              }
            }
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
