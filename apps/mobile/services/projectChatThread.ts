import {
  getDefaultAgent,
  markThreadTeamShared,
  requestThreadListReload,
  setThreadGroupId,
  useAgentStore,
} from '@gruenerator/chat';

import { getMobileChatApiClient } from './chatConfig';

interface Handoff {
  /** The thread once the server created it; a retry reuses it. */
  threadId: string | null;
  /** The opening turn went out. */
  done: boolean;
}

// One entry per hand-off from a Projekt page. The chat route keeps
// `threadId=new` plus the opening message, so a remount (Android recreation,
// back/forward) replays the same hand-off: this makes it a no-op.
const handoffs = new Map<string, Handoff>();

/** Test seam. */
export function resetProjectChatHandoffs(): void {
  handoffs.clear();
}

/**
 * Creates the thread of a Projekt chat BEFORE its first turn, filed in the
 * Projekt (`groupId`) and — for a team chat — shared with all members
 * (`teamShared`). The stream endpoint can only create a plain thread, and the
 * first turn already reads the Projekt context, so a later move would come too
 * late. Web does the same in the thread-list adapter's `initialize()`.
 *
 * The new thread is minted into the agent store, so the turn that follows runs
 * in it and the live sync (`useTeamChatPolling`) knows which thread to ask for.
 *
 * Returns false when this hand-off already ran (nothing to do), true when the
 * opening turn should be sent now. A failure after the POST keeps the created
 * thread, so the retry does not create a second one.
 */
export async function runProjectChatHandoff(
  key: string,
  opts: { groupId: string; teamShared: boolean }
): Promise<boolean> {
  const handoff = handoffs.get(key) ?? { threadId: null, done: false };
  handoffs.set(key, handoff);
  if (handoff.done) return false;

  if (!handoff.threadId) {
    const state = useAgentStore.getState();
    const result = await getMobileChatApiClient().post<{ id: string }>(
      '/api/chat-service/threads',
      {
        agentId: state.selectedAgentId ?? getDefaultAgent(),
        threadType: state.threadMode,
        groupId: opts.groupId,
        ...(opts.teamShared ? { teamShared: true } : {}),
      }
    );
    handoff.threadId = result.id;
  }
  const threadId = handoff.threadId;
  setThreadGroupId(threadId, opts.groupId);
  if (opts.teamShared) markThreadTeamShared(threadId);
  useAgentStore.getState().mintThreadFromDraft(threadId);
  requestThreadListReload();
  handoff.done = true;
  return true;
}
