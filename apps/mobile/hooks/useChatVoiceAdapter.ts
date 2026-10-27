import { type AssistantRuntime } from '@assistant-ui/react-native';
import {
  convertToThreadMessageLike,
  insertSavedMessage,
  reloadSavedThread,
  useAgentStore,
} from '@gruenerator/chat';
import { useAuthStore } from '@gruenerator/shared/stores';
import { type RefObject, useMemo } from 'react';

import { getMobileChatApiClient } from '../services/chatConfig';
import { DEV_AUTH_BYPASS } from '../services/devAuth';
import { createMobileVoiceAdapter } from '../services/voice/mobileVoice';
import { useVoiceCallStore } from '../stores/voiceCallStore';

const messagesUrl = (threadId: string) => `/api/chat-service/messages?threadId=${threadId}`;

/**
 * The voice call as an adapter of the chat's own runtime, so a call runs in
 * whatever chat it is started from: spoken lines become that chat's messages,
 * a card the call creates joins it live, and once the call is over the chat
 * is read back as the server saved it.
 *
 * Instance admins only, like the API: audio leaves through Mistral's global
 * endpoint. The emulator's bypass user stands in for one. Without the adapter
 * the thread reports no voice capability and the chat offers no call.
 */
export function useChatVoiceAdapter(runtime: RefObject<AssistantRuntime | null>) {
  const canCall = useAuthStore((s) => s.user?.is_admin === true) || DEV_AUTH_BYPASS;

  return useMemo(() => {
    if (!canCall) return null;
    const thread = () => runtime.current?.thread ?? null;
    // The thread the server opened or confirmed for the current call.
    let callThreadId: string | null = null;
    return createMobileVoiceAdapter({
      resolveThreadId: () => useAgentStore.getState().currentThreadId,
      onThread: (id) => {
        callThreadId = id;
        // A call from a new chat makes it a saved one, as its first turn would.
        useAgentStore.getState().mintThreadFromDraft(id);
      },
      onToolActivity: (tool) => useVoiceCallStore.setState({ tool }),
      onError: (error) => useVoiceCallStore.setState({ error }),
      onArtifact: ({ messageId }) => {
        if (!messageId || !callThreadId) return;
        void insertSavedMessage(
          thread,
          getMobileChatApiClient(),
          messagesUrl(callThreadId),
          messageId,
          convertToThreadMessageLike
        )
          .then((shown) => {
            if (shown) useVoiceCallStore.setState((s) => ({ cardsShown: s.cardsShown + 1 }));
          })
          .catch((error: unknown) => console.warn('[voice] card not inserted:', error));
      },
      onEnded: () => {
        if (!callThreadId) return;
        void reloadSavedThread(
          thread,
          getMobileChatApiClient(),
          messagesUrl(callThreadId),
          convertToThreadMessageLike
        ).catch((error: unknown) => console.warn('[voice] thread not reloaded:', error));
      },
    });
  }, [canCall, runtime]);
}
