import { useState, useEffect, useCallback, useRef } from 'react';
import type * as Y from 'yjs';
import type { HocuspocusProvider } from '@hocuspocus/provider';
import { useAwarenessState } from '@gruenerator/collab';

export interface ChatMessage {
  id: string;
  userId: string;
  userName: string;
  userColor: string;
  text: string;
  timestamp: number;
}

interface ChatUser {
  id: string;
  name: string;
  color: string;
}

interface UseDocumentChatOptions {
  ydoc: Y.Doc | null;
  provider: HocuspocusProvider | null;
  isSynced: boolean;
}

function typingUsersEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

const selectTypingUsers = (
  states: Map<number, Record<string, unknown>>,
  localClientId: number
): string[] => {
  const typing: string[] = [];
  states.forEach((state, clientId) => {
    if (clientId !== localClientId && state.typing && (state.user as { name?: string })?.name) {
      typing.push((state.user as { name: string }).name);
    }
  });
  return typing;
};

export const useDocumentChat = ({ ydoc, provider, isSynced }: UseDocumentChatOptions) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const typingUsers = useAwarenessState(provider, selectTypingUsers, typingUsersEqual);
  const arrayRef = useRef<Y.Array<ChatMessage> | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const getLocalUser = useCallback((): ChatUser | null => {
    if (!provider?.awareness) return null;
    const state = provider.awareness.getLocalState();
    return (state?.user as ChatUser) ?? null;
  }, [provider]);

  useEffect(() => {
    if (!ydoc) return;

    const yarray = ydoc.getArray<ChatMessage>('chat-messages');
    arrayRef.current = yarray;

    const syncState = () => {
      setMessages(yarray.toJSON() as ChatMessage[]);
    };

    syncState();
    yarray.observeDeep(syncState);

    return () => {
      yarray.unobserveDeep(syncState);
      arrayRef.current = null;
    };
  }, [ydoc]);

  // Typing awareness: broadcast and observe typing state via Hocuspocus awareness
  const setTyping = useCallback(
    (isTyping: boolean) => {
      if (!provider?.awareness) return;
      provider.awareness.setLocalStateField('typing', isTyping);

      // Auto-clear after 3 seconds of no activity
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      if (isTyping) {
        typingTimeoutRef.current = setTimeout(() => {
          provider.awareness?.setLocalStateField('typing', false);
        }, 3000);
      }
    },
    [provider]
  );

  const sendMessage = useCallback(
    (text: string, fallbackUser?: ChatUser) => {
      const trimmed = text.trim();
      if (!trimmed || !arrayRef.current) return;

      const user = getLocalUser() || fallbackUser;
      if (!user) return;

      const message: ChatMessage = {
        id: crypto.randomUUID(),
        userId: user.id,
        userName: user.name,
        userColor: user.color,
        text: trimmed,
        timestamp: Date.now(),
      };

      arrayRef.current.push([message]);
    },
    [getLocalUser]
  );

  return { messages, sendMessage, getLocalUser, setTyping, typingUsers };
};
