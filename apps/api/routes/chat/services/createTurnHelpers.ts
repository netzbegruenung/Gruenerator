/**
 * Turn-ownership helpers shared by every create_* handler.
 *
 * Both encode a rule that was previously re-derived per handler — and drifted
 * six ways, which is how the fall-through bug survived review.
 */

import { createLogger } from '../../../utils/logger.js';

import { setThreadToolContext } from './threadPersistenceService.js';

import type { SSEWriter } from './sseHelpers.js';
import type { ThreadToolContext } from '../../../agents/langgraph/ChatGraph/types.js';

const log = createLogger('CreateTurn');

/** Text is streamed in fixed-size slices, matching the previous handlers. */
export const TEXT_CHUNK = 20;

/**
 * Stream a finished text as `text_delta` slices.
 *
 * The loop lived in four places with the slice width written out as a literal in
 * three of them, so a change to the pacing would have applied to one turn kind
 * and silently not to the others.
 */
export function streamTextInChunks(sse: SSEWriter, text: string): void {
  for (let i = 0; i < text.length; i += TEXT_CHUNK) {
    sse.send('text_delta', { text: text.slice(i, i + TEXT_CHUNK) });
  }
}

/**
 * Close a create_* turn with an honest error instead of falling through to the
 * generic respond pipeline.
 *
 * The fall-through was the bug: a create_pdf turn whose structure failed to
 * parse handed the turn to the responder, which — having no artifact tools —
 * invented a workaround ("copy the content into the Office app and use 'save as
 * PDF'"). That prose was persisted, and the NEXT referential turn ("erstelle
 * als pdf") inherited it as its subject, so the finished PDF contained the
 * invented instructions.
 *
 * Two properties matter: the message is TEMPLATED, so it can never carry a
 * hallucinated URL or workflow; and it is deliberately NOT persisted (the SSE
 * text listener is attached later than the create branches, so the placeholder
 * row stays empty and `cleanupPending(true)` drops it) — a persisted failure
 * message would itself be eligible as a referential subject.
 *
 * Returns true so handlers can `return failCreation(...)`: the turn is owned.
 */
export function failCreation(
  sse: SSEWriter,
  actualThreadId: string | undefined,
  intent: string,
  message: string
): true {
  sse.send('text_delta', { text: message });
  sse.sendRaw('done', {
    threadId: actualThreadId,
    citations: [],
    metadata: { intent },
  });
  sse.end();
  return true;
}

/**
 * Remember the artifact this turn produced as the thread's sticky tool context,
 * so a vague follow-up ("kürze das", "mach es bunter") routes back to it.
 *
 * The single-pass handlers persist via createMessage directly and never reach
 * persistAssistantResponse's deriveToolContext, so without this a single-pass
 * create_sheet/presentation/pdf/board left the pointer on whatever the previous
 * turn had — and the next follow-up edited the wrong artifact.
 *
 * Awaited, not fire-and-forget: this turn's `done` — and thus the NEXT turn's
 * classifier read of last_tool_context — must not race ahead of the write.
 */
export async function rememberArtifact(
  threadId: string | undefined,
  kind: ThreadToolContext['kind'],
  ref: string,
  label: string
): Promise<void> {
  if (!threadId) return;
  await setThreadToolContext(threadId, { kind, ref, label }).catch((err) =>
    log.warn(`Failed to persist ${kind} thread tool context:`, err)
  );
}
