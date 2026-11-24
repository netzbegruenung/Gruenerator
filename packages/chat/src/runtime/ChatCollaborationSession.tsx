'use client';

import { type AssistantRuntime } from '@assistant-ui/react';
import { useEffect, useMemo } from 'react';

import { type ChatCollaborationState } from '../context/ChatCollaborationContext';
import { useChatCollaboration } from '../hooks/useChatCollaboration';
import { usePeerMessageSync } from '../hooks/usePeerMessageSync';

/**
 * The live part of a team chat: the Hocuspocus room and the peer message sync.
 * Lazy-loaded by ChatCollaborationBridge only for collaborative threads, so
 * yjs and the Hocuspocus provider stay out of every private chat (#5891).
 * Renders nothing; reports its state up so the chat tree never remounts.
 */
export default function ChatCollaborationSession({
  threadId,
  user,
  runtime,
  onChange,
}: {
  threadId: string;
  user: { id: string; name: string };
  runtime: AssistantRuntime;
  onChange: (state: ChatCollaborationState) => void;
}) {
  const collab = useChatCollaboration(threadId, user);
  const { peerRunning } = usePeerMessageSync({ threadId, runtime, collab });
  const { provider, typingUsers, setTyping, broadcastNewMessage, broadcastTurnStarted } = collab;
  const value = useMemo(
    () => ({
      provider,
      typingUsers,
      setTyping,
      broadcastNewMessage,
      broadcastTurnStarted,
      peerRunning,
    }),
    [provider, typingUsers, setTyping, broadcastNewMessage, broadcastTurnStarted, peerRunning]
  );
  useEffect(() => onChange(value), [onChange, value]);
  return null;
}
