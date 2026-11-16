'use client';

import { type AssistantRuntime } from '@assistant-ui/react';
import { type ReactNode, useMemo, useSyncExternalStore } from 'react';

import { ChatCollaborationProvider } from '../context/ChatCollaborationContext';
import { useChatCollaboration } from '../hooks/useChatCollaboration';
import { usePeerMessageSync } from '../hooks/usePeerMessageSync';
import { useAgentStore } from '../stores/chatStore';

import { isThreadCollaborative, subscribeThreadTags } from './GrueneratorThreadListAdapter';

/**
 * Live sync between the members of a team chat. Private threads open no
 * Hocuspocus socket: the room is only joined when the thread belongs to someone
 * else or carries a group share.
 */
export function ChatCollaborationBridge({
  userId,
  userName,
  runtime,
  children,
}: {
  userId: string;
  userName?: string;
  runtime: AssistantRuntime;
  children: ReactNode;
}) {
  const threadId = useAgentStore((s) => s.currentThreadId);
  const chatViewMode = useAgentStore((s) => s.chatViewMode);
  const collaborative = useSyncExternalStore(
    subscribeThreadTags,
    () => (threadId ? isThreadCollaborative(threadId) : false),
    () => false
  );
  const activeThreadId = chatViewMode === 'thread' && collaborative ? threadId : null;
  const user = useMemo(() => ({ id: userId, name: userName || userId }), [userId, userName]);
  const collab = useChatCollaboration(activeThreadId, user);

  return (
    <ChatCollaborationProvider value={collab}>
      {activeThreadId && <PeerSync threadId={activeThreadId} runtime={runtime} collab={collab} />}
      {children}
    </ChatCollaborationProvider>
  );
}

function PeerSync({
  threadId,
  runtime,
  collab,
}: {
  threadId: string;
  runtime: AssistantRuntime;
  collab: ReturnType<typeof useChatCollaboration>;
}) {
  usePeerMessageSync({ threadId, runtime, collab });
  return null;
}
