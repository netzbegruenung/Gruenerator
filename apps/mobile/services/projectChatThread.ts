import {
  getDefaultAgent,
  markThreadTeamShared,
  requestThreadListReload,
  setThreadGroupId,
  useAgentStore,
} from '@gruenerator/chat';

import { getMobileChatApiClient } from './chatConfig';

/**
 * Creates the thread of a Projekt chat BEFORE its first turn, filed in the
 * Projekt (`groupId`) and — for a team chat — shared with all members
 * (`teamShared`). The stream endpoint can only create a plain thread, and the
 * first turn already reads the Projekt context, so a later move would come too
 * late. Web does the same in the thread-list adapter's `initialize()`.
 *
 * The new thread is minted into the agent store, so the turn that follows runs
 * in it and the live sync (`useTeamChatPolling`) knows which thread to ask for.
 */
export async function createProjectChatThread(opts: {
  groupId: string;
  teamShared: boolean;
}): Promise<string> {
  const state = useAgentStore.getState();
  const result = await getMobileChatApiClient().post<{ id: string }>('/api/chat-service/threads', {
    agentId: state.selectedAgentId ?? getDefaultAgent(),
    threadType: state.threadMode,
    groupId: opts.groupId,
    ...(opts.teamShared ? { teamShared: true } : {}),
  });
  setThreadGroupId(result.id, opts.groupId);
  if (opts.teamShared) markThreadTeamShared(result.id);
  useAgentStore.getState().mintThreadFromDraft(result.id);
  requestThreadListReload();
  return result.id;
}
