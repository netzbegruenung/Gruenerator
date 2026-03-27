import { useState, useEffect, useRef, useCallback } from 'react';
import { HocuspocusProvider } from '@hocuspocus/provider';
import * as Y from 'yjs';
import { generateUserColor, useAwarenessState } from '@gruenerator/collab';
import { useChatConfigStore } from '../stores/chatConfigStore';

interface ChatCollaborationUser {
  id: string;
  name: string;
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
    if (clientId === localClientId) return;
    if (
      (state['chatTyping'] as { isTyping?: boolean })?.isTyping &&
      (state['user'] as { name?: string })?.name
    ) {
      typing.push((state['user'] as { name: string }).name);
    }
  });
  return typing;
};

export function useChatCollaboration(threadId: string | null, user: ChatCollaborationUser | null) {
  const [provider, setProvider] = useState<HocuspocusProvider | null>(null);
  const providerRef = useRef<HocuspocusProvider | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const docsBaseUrl = useChatConfigStore((s) => s.docsBaseUrl);

  useEffect(() => {
    if (!threadId || !user) return;

    const ydoc = new Y.Doc();
    const url = docsBaseUrl
      ? `${docsBaseUrl.replace(/^http/, 'ws')}/hocuspocus`
      : window.location.protocol === 'https:'
        ? `wss://${window.location.host}/ws`
        : 'ws://localhost:1240';

    const p = new HocuspocusProvider({
      url,
      name: `chat-${threadId}`,
      document: ydoc,
    } as ConstructorParameters<typeof HocuspocusProvider>[0]);

    providerRef.current = p;

    const color = generateUserColor();
    p.awareness?.setLocalStateField('user', { id: user.id, name: user.name, color });

    setProvider(p);

    return () => {
      p.awareness?.setLocalState(null);
      p.destroy();
      providerRef.current = null;
      setProvider(null);
    };
  }, [threadId, user?.id, docsBaseUrl]);

  const typingUsers = useAwarenessState(provider, selectTypingUsers, typingUsersEqual);

  const setTyping = useCallback((isTyping: boolean) => {
    const awareness = providerRef.current?.awareness;
    if (!awareness) return;
    awareness.setLocalStateField('chatTyping', { isTyping, t: Date.now() });

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    if (isTyping) {
      typingTimeoutRef.current = setTimeout(() => {
        awareness.setLocalStateField('chatTyping', { isTyping: false, t: Date.now() });
      }, 3000);
    }
  }, []);

  const broadcastNewMessage = useCallback(() => {
    providerRef.current?.awareness?.setLocalStateField('chatNewMessage', { t: Date.now() });
  }, []);

  return {
    provider,
    typingUsers,
    setTyping,
    broadcastNewMessage,
  };
}
