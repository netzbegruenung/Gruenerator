import { useState, useEffect, useRef, useCallback } from 'react';
import { HocuspocusProvider } from '@hocuspocus/provider';
import * as Y from 'yjs';
import { generateUserColor } from '@gruenerator/collab';
import { useChatConfigStore } from '../stores/chatConfigStore';

interface ChatCollaborationState {
  provider: HocuspocusProvider | null;
  typingUsers: string[];
}

interface ChatCollaborationUser {
  id: string;
  name: string;
}

export function useChatCollaboration(threadId: string | null, user: ChatCollaborationUser | null) {
  const [state, setState] = useState<ChatCollaborationState>({ provider: null, typingUsers: [] });
  const providerRef = useRef<HocuspocusProvider | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const docsBaseUrl = useChatConfigStore((s) => s.docsBaseUrl);

  useEffect(() => {
    if (!threadId || !user) return;

    const ydoc = new Y.Doc();
    const url = docsBaseUrl
      ? `${docsBaseUrl.replace(/^http/, 'ws')}/hocuspocus`
      : `ws://${window.location.hostname}:1240`;

    const provider = new HocuspocusProvider({
      url,
      name: `chat-${threadId}`,
      document: ydoc,
    });

    providerRef.current = provider;

    const color = generateUserColor();
    provider.awareness?.setLocalStateField('user', { id: user.id, name: user.name, color });

    const pendingRef = { current: null as ReturnType<typeof setTimeout> | null };

    const handleAwareness = () => {
      if (pendingRef.current) clearTimeout(pendingRef.current);
      pendingRef.current = setTimeout(() => {
        const awareness = provider.awareness;
        if (!awareness) return;
        const typing: string[] = [];

        awareness.getStates().forEach((s, clientId) => {
          if (clientId === awareness.clientID) return;
          if (s['chatTyping']?.isTyping && s['user']?.name) {
            typing.push(s['user'].name as string);
          }
        });

        setState((prev) => {
          const prevStr = prev.typingUsers.join(',');
          const newStr = typing.join(',');
          if (prevStr === newStr) return prev;
          return { ...prev, typingUsers: typing };
        });
        pendingRef.current = null;
      }, 0);
    };

    provider.awareness?.on('change', handleAwareness);

    setState({ provider, typingUsers: [] });

    return () => {
      provider.awareness?.off('change', handleAwareness);
      provider.awareness?.setLocalState(null);
      provider.destroy();
      providerRef.current = null;
      if (pendingRef.current) clearTimeout(pendingRef.current);
    };
  }, [threadId, user?.id, docsBaseUrl]);

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
    provider: state.provider,
    typingUsers: state.typingUsers,
    setTyping,
    broadcastNewMessage,
  };
}
