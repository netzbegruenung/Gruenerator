/**
 * Langfuse traces for a research run — one span tree per run, one child per
 * subagent.
 *
 * The rest of the API traces through the AI SDK integration
 * (`buildAiTelemetry`). This agent is the one thing that does not run on the AI
 * SDK: it is LangChain, so its calls are invisible to that path. Since #2546
 * delegation is concurrent and since #2550 there are two kinds of researcher —
 * exactly the situation where "read the logs" stops working, because the log
 * lines of three parallel sub-questions interleave with nothing tying a search
 * back to the sub-question that ordered it.
 *
 * `CallbackHandler` emits OTel spans through `getLangfuseTracer()`, i.e. the
 * dedicated provider `initLangfuseTelemetry` registers — NOT the global one
 * Sentry installs with a rate-0 sampler. That is why this file has no
 * configuration of its own: the provider, the masking and the release tag are
 * already set up there, and a second setup would be a second place to get the
 * sampler wrong.
 *
 * **Opt-in per run, like everywhere else in this API.** The handler is passed in
 * the run's `callbacks`; nothing is registered globally. That is the same rule
 * `langfuseTelemetry.ts` states for the AI SDK side and for the same reason —
 * the Datenschutzerklärung covers the chat flow, and the deep research turn is
 * part of it (`@deepresearch` in the chat), while the ~50 unrelated LLM calls in
 * this API are not.
 *
 * ## Why the version bump ships with this
 *
 * `@langfuse/tracing` keeps the registered tracer provider in MODULE state. Two
 * resolved copies mean the handler looks up a provider that was never set, its
 * spans fall back to the global tracer, and the rate-0 sampler drops every one
 * of them — silently, which is the worst possible failure for observability.
 * Adding `@langfuse/langchain@5.10.0` next to `@langfuse/*@5.9.1` produced
 * exactly that second copy, so all four move to `^5.10.0` together.
 */

import { CallbackHandler } from '@langfuse/langchain';

import { isLangfuseEnabled } from '../../telemetry/langfuseTelemetry.js';

import type { BaseCallbackHandler } from '@langchain/core/callbacks/base';

/** Filter tag on every span of a research run. */
export const RESEARCH_TRACE_TAG = 'deep-research';

/**
 * The run's callbacks — empty when Langfuse is not configured, which is the
 * kill switch (unset the env vars) and the default in dev.
 *
 * One handler per RUN, not per leg: it keys its state by run id internally, and
 * the resume legs in `index.ts` are continuations of the same research, so they
 * belong under the same trace.
 */
export function researchCallbacks(options: { userId?: string } = {}): BaseCallbackHandler[] {
  if (!isLangfuseEnabled()) return [];
  return [
    new CallbackHandler({
      tags: [RESEARCH_TRACE_TAG],
      ...(options.userId ? { userId: options.userId } : {}),
    }),
  ];
}
