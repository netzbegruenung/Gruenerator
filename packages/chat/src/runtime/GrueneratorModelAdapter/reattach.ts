import { isNetworkDrop, reattachWithBackoff } from '../resumableStream';

import { parseSSEStream } from './parseSSEStream';

import type { GrueneratorAdapterCallbacks, StreamOutcome } from './types';
import type { ChatModelRunResult } from '@assistant-ui/react';

/**
 * Parse a turn's stream. When the connection drops mid-flight and the server
 * announced a stream id, re-attach and replay the turn from its first byte —
 * the replay rebuilds the whole message — instead of ending on half an answer.
 *
 * Returns the outcome of the stream that finished the turn. Rethrows the drop
 * when re-attaching is impossible; `outcome.lastResult` then holds the most
 * complete partial answer seen, for the interruption notice.
 */
export async function* parseWithReattach(
  response: Response,
  callbacks: GrueneratorAdapterCallbacks,
  outcome: StreamOutcome,
  agentInfo: { agentId: string; agentMention?: string } | undefined,
  abortSignal: AbortSignal | undefined,
  /** The first response is itself a replay (history resume after a reload). */
  replayFirst = false
): AsyncGenerator<ChatModelRunResult, StreamOutcome, void> {
  const budget = { used: 0 };
  let current = outcome;
  let next = response;
  // Effects of events that already ran live stay off on the replay; those
  // that never arrived before the drop (an editor op, say) still run.
  let effectsFrom = replayFirst ? Infinity : 0;
  for (;;) {
    try {
      yield* parseSSEStream(next, callbacks, current, agentInfo, { effectsFrom });
      return current;
    } catch (err) {
      if (current.lastResult) outcome.lastResult = current.lastResult;
      effectsFrom = Math.max(effectsFrom, current.eventsSeen ?? 0);
      const streamId = current.streamId ?? outcome.streamId;
      if (abortSignal?.aborted || !isNetworkDrop(err) || !streamId) throw err;
      console.warn('[GrueneratorModelAdapter] Stream dropped — re-attaching to', streamId);
      const reattached = await reattachWithBackoff(streamId, abortSignal, budget);
      if (!reattached) throw err;
      next = reattached;
      current = { interrupted: false, indexedDocumentIds: [], streamId };
    }
  }
}
