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
 *
 * TRACING IS OPT-IN, PER CALL: an AI SDK call only reaches Langfuse when it
 * passes the settings from `buildAiTelemetry()` — which carries the telemetry
 * integration itself. Anything that skips it stays silent. Do NOT register the
 * integration globally via `registerTelemetry`: AI SDK 7 then treats telemetry
 * as opt-OUT (`ai` only bails on `isEnabled === false`), and every one of the
 * ~50 unrelated LLM calls in this API — voice transcripts, receipt extraction,
 * docs/boards/sheets generation — would ship its full input/output as an
 * unnamed, user-less orphan trace. The Datenschutzerklärung covers the chat
 * flow only.
 */

import { OpenTelemetry } from '@ai-sdk/otel';
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

import type { LangfuseSpanAttributes } from '@langfuse/tracing';
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
/** Shared per-call telemetry integration; see `buildAiTelemetry`. */
let aiIntegration: OpenTelemetry | null = null;

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]*[\w]/g;
/** Two letters, two check digits, then 11–30 alphanumerics (IBANs are 15–34). */
const IBAN_RE = /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g;
/**
 * Deliberately narrow: only `+`-prefixed international numbers and `0`-prefixed
 * national ones, each at least nine digits long. Years, dates, paragraph
 * numbers and statistics are the common case in this corpus and must survive.
 */
const PHONE_RE = /(?<![\w.])(?:\+\d{1,3}|0)[\d\s/-]{7,18}\d(?![\w.])/g;

/**
 * Redacts contact and payment identifiers from trace payloads. Chat content
 * itself is deliberately NOT masked — quality assurance on prompts and answers
 * is the declared purpose of the tracing; a blanket filter would empty it out.
 *
 * Note the SDK applies this to Langfuse-namespaced attributes only (trace and
 * observation input/output/metadata), not to the raw `gen_ai.*` attributes the
 * AI SDK writes. Today that means the trace metadata; it starts carrying real
 * weight once the root span gets input/output.
 */
export function maskSensitive(data: unknown): unknown {
  if (typeof data === 'string') {
    return data
      .replace(EMAIL_RE, '[email]')
      .replace(IBAN_RE, '[iban]')
      .replace(PHONE_RE, '[phone]');
  }
  if (Array.isArray(data)) return data.map(maskSensitive);
  if (data !== null && typeof data === 'object') {
    return Object.fromEntries(
      Object.entries(data as Record<string, unknown>).map(([k, v]) => [k, maskSensitive(v)])
    );
  }
  return data;
}

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

  // A telemetry misconfig must never take down the API. instrument.ts calls
  // this bare and is --import'ed before server.ts, so any throw here would
  // crash every cluster worker — swallow and stay disabled instead.
  try {
    const processor = new LangfuseSpanProcessor({
      publicKey: cfg.publicKey,
      secretKey: cfg.secretKey,
      baseUrl: cfg.baseUrl,
      environment: env.NODE_ENV,
      mask: ({ data }) => maskSensitive(data),
      // Binds every trace to the running deploy, so a quality regression can be
      // pinned to a version. Optional — unset behaves exactly as before.
      ...(env.LANGFUSE_RELEASE && { release: env.LANGFUSE_RELEASE }),
    });

    const created = new NodeTracerProvider({ spanProcessors: [processor] });
    // Intentionally NOT created.register() — keep it off the global tracer.
    setLangfuseTracerProvider(created);

    // Span nesting needs a global context manager. Sentry installs an ALS-based
    // one — but ONLY when it actually inits, i.e. dsn && NODE_ENV==='production'
    // (see instrument.ts). A DSN set in a non-prod env leaves Sentry disabled
    // and no context manager, so key off Sentry's real init condition, not just
    // SENTRY_DSN presence — otherwise context propagation silently no-ops.
    const sentryActive = !!env.SENTRY_DSN && env.NODE_ENV === 'production';
    if (!sentryActive) {
      try {
        context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable());
      } catch {
        // A context manager already exists — fine, nesting still works.
      }
    }

    provider = created;
    config = cfg;

    // AI SDK 7 dropped the per-call `tracer` option; the tracer now belongs to a
    // telemetry integration. Built here so it carries OUR tracer (from the
    // non-global provider above) instead of Sentry's rate-0 global one — and
    // deliberately NOT handed to `registerTelemetry`, which would flip the whole
    // API to opt-out tracing (see the module header). `buildAiTelemetry` passes
    // this one instance per call; it keeps its state keyed by call id, so
    // sharing it across concurrent requests is intended.
    aiIntegration = new OpenTelemetry({ tracer: getLangfuseTracer() });

    console.info(`[langfuse] telemetry enabled → ${cfg.baseUrl}`);
  } catch (err) {
    provider = null;
    config = null;
    aiIntegration = null;
    console.warn('[langfuse] telemetry init failed — running without tracing:', err);
  }
}

export function isLangfuseEnabled(): boolean {
  return provider != null;
}

/** Config for out-of-band API calls (e.g. the feedback/scores endpoint). */
export function getLangfuseConfig(): LangfuseConfig | null {
  return config;
}

/**
 * Telemetry settings for an AI SDK call, or undefined when disabled. Spread as
 * `...(t && { experimental_telemetry: t })` so call sites stay clean.
 *
 * Carrying `integrations` here is what makes tracing opt-in: a call that omits
 * these settings finds no registered integration and emits nothing.
 *
 * There is no metadata parameter — AI SDK 7's telemetry options have no such
 * field, so anything passed here would be dropped on the floor. Trace-level
 * context belongs on `withLangfuseTrace({ metadata })`, which Langfuse hoists.
 */
export function buildAiTelemetry(functionId: string): AiTelemetry | undefined {
  if (!aiIntegration) return undefined;
  return {
    isEnabled: true,
    functionId,
    integrations: [aiIntegration],
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
 * Status message for a turn whose primary AND sibling lane both died.
 * `streamWithFallback` reports that as `null` rather than throwing, so the root
 * span has to be marked by hand — a shared constant keeps the Langfuse filter
 * on it from silently missing a call site that phrased it differently.
 */
export const BOTH_LANES_FAILED = 'generation failed on both model lanes';

/** What a traced turn gets to talk back to its own root span. */
export interface LangfuseTrace {
  /**
   * OTel trace id (32 hex) so callers can surface it to the client for feedback
   * scoring. `undefined` when Langfuse is disabled — the client hides the thumbs
   * buttons on that signal rather than offering a control that drops the score.
   */
  readonly traceId: string | undefined;
  /**
   * Record input/output/level on the turn's ROOT span. No-op when disabled.
   *
   * Observation-level, not trace-level: `setActiveTraceIO` is deprecated in the
   * SDK and only exists for legacy trace-level evaluators. Everything that reads
   * a turn's I/O today — annotation queues, LLM-as-a-judge, dataset runs — reads
   * it off the root observation.
   */
  update(attrs: LangfuseSpanAttributes): void;
}

/** Disabled-mode handle: an id nobody can score, and a no-op writer. */
const INERT_TRACE: LangfuseTrace = { traceId: undefined, update: () => {} };

/**
 * Run `fn` inside one Langfuse trace (root span). Every LLM call it makes with
 * `buildAiTelemetry()` settings nests under that span.
 */
export function withLangfuseTrace<T>(
  opts: TraceOptions,
  fn: (trace: LangfuseTrace) => Promise<T>
): Promise<T> {
  if (!isLangfuseEnabled()) return fn(INERT_TRACE);

  const attrs: Parameters<typeof propagateAttributes>[0] = {
    traceName: opts.name,
    ...(opts.userId && { userId: opts.userId }),
    ...(opts.sessionId && { sessionId: opts.sessionId }),
    ...(opts.metadata && { metadata: opts.metadata }),
    ...(opts.tags && { tags: opts.tags }),
  };

  return propagateAttributes(attrs, () =>
    startActiveObservation(opts.name, async (span) => {
      const trace: LangfuseTrace = {
        traceId: span.otelSpan.spanContext().traceId,
        update: (patch) => span.update(patch),
      };
      try {
        return await fn(trace);
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
