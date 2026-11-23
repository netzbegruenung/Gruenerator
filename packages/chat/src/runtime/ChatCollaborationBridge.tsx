'use client';

import { type AssistantRuntime } from '@assistant-ui/react';
import {
  lazy,
  type ReactNode,
  Suspense,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';

import {
  ChatCollaborationProvider,
  type ChatCollaborationState,
} from '../context/ChatCollaborationContext';
import { useAgentStore } from '../stores/chatStore';

import { isThreadCollaborative, subscribeThreadTags } from './GrueneratorThreadListAdapter';

// yjs + Hocuspocus (~110 KB minified) load only once a thread is collaborative.
const ChatCollaborationSession = lazy(() => import('./ChatCollaborationSession'));

const noop = () => {};

/** What a private thread sees: no room, nobody typing, nothing to broadcast. */
const IDLE: ChatCollaborationState = {
  provider: null,
  typingUsers: [],
  setTyping: noop,
  broadcastNewMessage: noop,
  broadcastTurnStarted: noop,
  peerRunning: false,
};

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
  const [session, setSession] = useState<ChatCollaborationState>(IDLE);
  // Leaving a team chat drops its state with the session that produced it.
  useEffect(() => {
    if (!activeThreadId) setSession(IDLE);
  }, [activeThreadId]);
  return (
    <ChatCollaborationProvider value={activeThreadId ? session : IDLE}>
      {activeThreadId && (
        <Suspense fallback={null}>
          <ChatCollaborationSession
            key={activeThreadId}
            threadId={activeThreadId}
            user={user}
            runtime={runtime}
            onChange={setSession}
          />
        </Suspense>
      )}
      {children}
    </ChatCollaborationProvider>
  );
}
