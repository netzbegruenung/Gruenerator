/**
 * Langfuse tracing for a research run.
 *
 * One trace per run, tagged and attributed, with every model call of the lead
 * and the researchers nested under it — so a slow or failed research can be
 * found from a support request instead of by grepping. Under LangChain this
 * needed `@langfuse/langchain`; on the AI SDK it is the same OpenTelemetry path
 * the chat uses (`langfuseTelemetry.ts`).
 */

import { withLangfuseTrace } from '../../telemetry/langfuseTelemetry.js';

/** Filter tag on every span of a research run. */
export const RESEARCH_TRACE_TAG = 'deep-research';

export function withResearchTrace<T>(
  options: { userId?: string; threadId: string },
  fn: () => Promise<T>
): Promise<T> {
  return withLangfuseTrace(
    {
      name: 'deep-research',
      tags: [RESEARCH_TRACE_TAG],
      metadata: { threadId: options.threadId },
      ...(options.userId ? { userId: options.userId } : {}),
    },
    fn
  );
}
