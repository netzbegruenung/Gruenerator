import { useState, useEffect, useCallback, useRef } from 'react';
import type * as Y from 'yjs';
import type { HocuspocusProvider } from '@hocuspocus/provider';

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

export const useDocumentChat = ({ ydoc, provider, isSynced }: UseDocumentChatOptions) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const arrayRef = useRef<Y.Array<ChatMessage> | null>(null);

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

  useEffect(() => {
    if (isSynced && arrayRef.current) {
      setMessages(arrayRef.current.toJSON() as ChatMessage[]);
    }
  }, [isSynced]);

  const sendMessage = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || !arrayRef.current) return;

      const user = getLocalUser();
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

  return { messages, sendMessage, getLocalUser };
};
