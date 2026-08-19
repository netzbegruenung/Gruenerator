'use client';

import { useAui } from '@assistant-ui/react';
import { useEffect, useRef } from 'react';

import { getDefaultAgent } from '../lib/agents';
import { useAgentStore } from '../stores/chatStore';

import { getThreadAgentId } from './GrueneratorThreadListAdapter';

export function AgentSwitchListener() {
  const aui = useAui();
  const selectedAgentId = useAgentStore((s) => s.selectedAgentId);
  const prevRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (prevRef.current === undefined) {
      prevRef.current = selectedAgentId;
      return;
    }
    if (prevRef.current === selectedAgentId) return;
    prevRef.current = selectedAgentId;

    // Agent restored from the thread we just opened (ChatThreadRouting sets it
    // from the thread row after the switch) — not a user-initiated switch, so
    // the thread must stay. Checked structurally against the open thread rather
    // than via a "suppress once" flag: that flag was only consumed when the
    // agent actually changed, so a restore that happened to be a no-op left it
    // latched and swallowed the user's NEXT real agent switch.
    const state = aui.threads.getState();
    const mainRemoteId =
      state.threadItems.find((t) => t.id === state.mainThreadId)?.remoteId ?? null;
    if (mainRemoteId) {
      const threadAgentId = getThreadAgentId(mainRemoteId);
      const threadAgent =
        threadAgentId && threadAgentId !== getDefaultAgent() ? threadAgentId : null;
      if (threadAgent === selectedAgentId) return;
    }

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
    void aui.threads.switchToNewThread();
  }, [selectedAgentId, aui]);

  return null;
}
