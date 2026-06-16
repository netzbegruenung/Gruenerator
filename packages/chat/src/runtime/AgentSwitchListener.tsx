'use client';

import { useEffect, useRef } from 'react';
import { useAssistantRuntime } from '@assistant-ui/react';
import { useAgentStore } from '../stores/chatStore';

export function AgentSwitchListener() {
  const assistantRuntime = useAssistantRuntime();
  const selectedAgentId = useAgentStore((s) => s.selectedAgentId);
  const prevRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (prevRef.current === undefined) {
      prevRef.current = selectedAgentId;
      return;
    }
    if (prevRef.current === selectedAgentId) return;
    prevRef.current = selectedAgentId;

    // A deselect-to-null while in thread view is the side effect of opening an
    // existing thread (ChatPage clears the agent on /chat without an agent
    // param) — not a user-initiated agent switch. Resetting here would stomp
    // the just-switched thread with a blank new one.
    if (selectedAgentId === null && useAgentStore.getState().chatViewMode === 'thread') {
      return;
    }

    // Clear the per-thread context but keep the just-selected agent, then start
    // a fresh thread. (resetChatContext would wipe selectedAgentId too.)
    const store = useAgentStore.getState();
    store.resetThreadContext();
    store.setCurrentThread(null);
    void assistantRuntime.threads.switchToNewThread();
  }, [selectedAgentId, assistantRuntime]);

  return null;
}
