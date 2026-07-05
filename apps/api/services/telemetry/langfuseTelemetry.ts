/**
 * Langfuse LLM observability (self-hosted).
 *
 * A dedicated, non-global OpenTelemetry TracerProvider feeds a
 * LangfuseSpanProcessor. We register it via `setLangfuseTracerProvider` so the
 * Langfuse SDK's `startActiveObservation` / `getLangfuseTracer` emit through
 * OUR provider — NOT the global one Sentry installs with a rate-0 sampler
 * (which would silently drop every span in production).
 *
 * The whole module is a no-op unless LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY
 * and LANGFUSE_BASE_URL are all set — so dev and unconfigured environments pay
 * nothing and unsetting the vars is the kill switch.
 */

import { LangfuseSpanProcessor } from '@langfuse/otel';
import {
  getLangfuseTracer,
  propagateAttributes,
  setLangfuseTracerProvider,
  startActiveObservation,
} from '@langfuse/tracing';
import { context } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';

import { env } from '../../config/env.js';

import type { Tracer } from '@opentelemetry/api';
import type { streamText } from 'ai';

/** Telemetry settings shape the AI SDK accepts on `experimental_telemetry`. */
type AiTelemetry = NonNullable<Parameters<typeof streamText>[0]['experimental_telemetry']>;

interface LangfuseConfig {
  publicKey: string;
  secretKey: string;
  baseUrl: string;
}

let config: LangfuseConfig | null = null;
let provider: NodeTracerProvider | null = null;

function readConfig(): LangfuseConfig | null {
  const publicKey = env.LANGFUSE_PUBLIC_KEY;
  const secretKey = env.LANGFUSE_SECRET_KEY;
  const baseUrl = env.LANGFUSE_BASE_URL;
  if (!publicKey || !secretKey || !baseUrl) return null;
  return { publicKey, secretKey, baseUrl };
}

/** Boot the dedicated provider. Idempotent; no-op when env vars are unset. */
export function initLangfuseTelemetry(): void {
  if (provider) return;
  const cfg = readConfig();
  if (!cfg) return;

  const processor = new LangfuseSpanProcessor({
    publicKey: cfg.publicKey,
    secretKey: cfg.secretKey,
    baseUrl: cfg.baseUrl,
    environment: env.NODE_ENV,
  });

  provider = new NodeTracerProvider({ spanProcessors: [processor] });
  // Intentionally NOT provider.register() — keep it off the global tracer.
  setLangfuseTracerProvider(provider);

  // Span nesting needs a global context manager. Sentry installs an ALS-based
  // one when it inits; register our own only when it didn't (dev / no DSN).
  if (!env.SENTRY_DSN) {
    try {
      context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable());
    } catch {
      // A context manager already exists — fine, nesting still works.
    }
  }

  config = cfg;
  console.info(`[langfuse] telemetry enabled → ${cfg.baseUrl}`);
}

export function isLangfuseEnabled(): boolean {
  return provider != null;
}

/** Config for out-of-band API calls (e.g. the feedback/scores endpoint). */
export function getLangfuseConfig(): LangfuseConfig | null {
  return config;
}

export function getLangfuseTracerOrUndefined(): Tracer | undefined {
  return provider ? getLangfuseTracer() : undefined;
}

/**
 * Telemetry settings for an AI SDK call, or undefined when disabled. Spread as
 * `...(t && { experimental_telemetry: t })` so call sites stay clean.
 */
export function buildAiTelemetry(
  functionId: string,
  metadata?: Record<string, string | number | boolean>
): AiTelemetry | undefined {
  const tracer = getLangfuseTracerOrUndefined();
  if (!tracer) return undefined;
  return {
    isEnabled: true,
    functionId,
    tracer,
    ...(metadata && { metadata }),
  };
}

interface TraceOptions {
  name: string;
  userId?: string;
  sessionId?: string;
  metadata?: Record<string, string>;
  tags?: string[];
}

/**
 * Run `fn` inside one Langfuse trace (root span). `fn` receives the trace id
 * (= OTel trace id, 32-hex) so callers can surface it to the client for
 * feedback scoring. When disabled, `fn` runs with `traceId = undefined`.
 */
export function withLangfuseTrace<T>(
  opts: TraceOptions,
  fn: (traceId: string | undefined) => Promise<T>
): Promise<T> {
  if (!isLangfuseEnabled()) return fn(undefined);

  const attrs: Parameters<typeof propagateAttributes>[0] = {
    traceName: opts.name,
    ...(opts.userId && { userId: opts.userId }),
    ...(opts.sessionId && { sessionId: opts.sessionId }),
    ...(opts.metadata && { metadata: opts.metadata }),
    ...(opts.tags && { tags: opts.tags }),
  };

  return propagateAttributes(attrs, () =>
    startActiveObservation(opts.name, async (span) => {
      const traceId = span.otelSpan.spanContext().traceId;
      try {
        return await fn(traceId);
      } catch (err) {
        span.update({
          level: 'ERROR',
          statusMessage: err instanceof Error ? err.message : String(err),
        });
        throw err;
      }
    })
  );
}

/** Flush + shut down on process exit. Safe to call when disabled. */
export async function shutdownLangfuseTelemetry(): Promise<void> {
  if (!provider) return;
  try {
    await provider.forceFlush();
    await provider.shutdown();
  } catch (err) {
    console.warn('[langfuse] shutdown flush failed:', err);
  }
}
