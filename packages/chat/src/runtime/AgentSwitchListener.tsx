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

    const store = useAgentStore.getState();
    store.setThreadMode('chat');
    store.setCustomSystemPrompt(null);
    store.setCustomRoleName(null);
    store.setCustomEnabledTools(null);
    store.setCurrentThread(null);
    void assistantRuntime.threads.switchToNewThread();
  }, [selectedAgentId, assistantRuntime]);

  return null;
}
