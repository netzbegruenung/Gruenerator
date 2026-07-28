'use client';

import { useAssistantRuntime } from '@assistant-ui/react';
import { useEffect, useRef } from 'react';

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
    const prevAgentId = prevRef.current;
    prevRef.current = selectedAgentId;

    // Agent restored from a thread deep link (ChatThreadRouting) — not a
    // user-initiated switch. Consume the flag and keep the loaded thread.
    if (useAgentStore.getState().suppressAgentSwitchReset) {
      useAgentStore.setState({ suppressAgentSwitchReset: false });
      console.debug(
        `[AgentSwitchListener] ${prevAgentId ?? 'null'} -> ${selectedAgentId ?? 'null'}: suppressed (deep-link restore)`
      );
      return;
    }

    // A deselect-to-null while in thread view is the side effect of opening an
    // existing thread (ChatPage clears the agent on /chat without an agent
    // param) — not a user-initiated agent switch. Resetting here would stomp
    // the just-switched thread with a blank new one.
    if (selectedAgentId === null && useAgentStore.getState().chatViewMode === 'thread') {
      console.debug(
        `[AgentSwitchListener] ${prevAgentId ?? 'null'} -> null: ignored (deselect while in thread view)`
      );
      return;
    }

    // Clear the per-thread context but keep the just-selected agent, then start
    // a fresh thread. (resetChatContext would wipe selectedAgentId too.)
    console.debug(
      `[AgentSwitchListener] ${prevAgentId ?? 'null'} -> ${selectedAgentId ?? 'null'}: resetting to a new thread (currentThreadId=${useAgentStore.getState().currentThreadId ?? 'null'})`
    );
    const store = useAgentStore.getState();
    store.resetThreadContext();
    store.setCurrentThread(null);
    void assistantRuntime.threads.switchToNewThread();
  }, [selectedAgentId, assistantRuntime]);

  return null;
}
