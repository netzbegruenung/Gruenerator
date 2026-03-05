import { useAuiState } from '@assistant-ui/react-native';
import { useAgentStore } from '@gruenerator/chat';
import { useEffect, useRef } from 'react';

import { getMobileChatApiClient } from '../../services/chatConfig';

export function ThreadSync() {
  const remoteId = useAuiState((s) => s.threadListItem.remoteId);
  const loadCompactionState = useAgentStore((s) => s.loadCompactionState);
  const prevRef = useRef<string | null>(null);

  useEffect(() => {
    if (remoteId && remoteId !== prevRef.current) {
      prevRef.current = remoteId;
      useAgentStore.getState().setCurrentThread(remoteId);
      loadCompactionState(remoteId, getMobileChatApiClient());
    }
  }, [remoteId, loadCompactionState]);

  return null;
}
