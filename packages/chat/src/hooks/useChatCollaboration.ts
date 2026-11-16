import { generateUserColor, useAwarenessState } from '@gruenerator/collab';
import { HocuspocusProvider } from '@hocuspocus/provider';
import { useState, useEffect, useRef, useCallback } from 'react';
import * as Y from 'yjs';

import { useChatConfigStore } from '../stores/chatConfigStore';

/** Dev bypass only: this tab's second identity (`sessionStorage['gr.devBypassUser']`). */
function devBypassUserId(): string | null {
  const env = import.meta.env as unknown as Record<string, string | undefined>;
  if (env['VITE_E2E_AUTH_BYPASS'] !== 'true' || typeof window === 'undefined') return null;
  try {
    return window.sessionStorage.getItem('gr.devBypassUser') || null;
  } catch {
    return null;
  }
}

/**
 * @hocuspocus/provider 4.x has no `parameters` option (it was silently dropped,
 * so the second dev identity never reached the server) — the identity rides in
 * the URL query. The slash before `?` keeps the Vite `/ws` rewrite a valid path.
 */
export function appendDevBypassUser(url: string, userId: string | null): string {
  if (!userId) return url;
  return `${url.replace(/\/+$/, '')}/?dev_auth_user=${encodeURIComponent(userId)}`;
}

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

// Derive the Hocuspocus WS host from the absolute API base. In the desktop
// (Tauri) webview the origin is `tauri://localhost`, so `window.location` would
// resolve to the local dev socket and never reach the server.
// Web is unchanged: the API host equals the page host. See the same pattern in
// apps/web/.../docsAdapter.ts.
function deriveChatCollabWsUrl(): string {
  const apiBase = (import.meta.env as unknown as Record<string, string | undefined>)
    .VITE_API_BASE_URL;
  if (apiBase && /^https?:/i.test(apiBase)) {
    try {
      const u = new URL(apiBase);
      return `${u.protocol === 'https:' ? 'wss:' : 'ws:'}//${u.host}/ws`;
    } catch {
      // fall through to window-based default
    }
  }
  // Dev: the Vite proxy forwards `/ws` to Hocuspocus, as nginx does in prod.
  return `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`;
}

export function useChatCollaboration(threadId: string | null, user: ChatCollaborationUser | null) {
  const [provider, setProvider] = useState<HocuspocusProvider | null>(null);
  const providerRef = useRef<HocuspocusProvider | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const docsBaseUrl = useChatConfigStore((s) => s.docsBaseUrl);

  useEffect(() => {
    if (!threadId || !user) return;

    const ydoc = new Y.Doc();
    const url = appendDevBypassUser(
      docsBaseUrl ? `${docsBaseUrl.replace(/^http/, 'ws')}/hocuspocus` : deriveChatCollabWsUrl(),
      devBypassUserId()
    );

    const p = new HocuspocusProvider({
      url,
      name: `chat-${threadId}`,
      document: ydoc,
    });

    providerRef.current = p;

    const color = generateUserColor();
    p.awareness?.setLocalStateField('user', { id: user.id, name: user.name, color });

    // eslint-disable-next-line react-hooks/set-state-in-effect -- publishes the Hocuspocus provider after it is constructed; a connection/subscription object that only exists post-mount
    setProvider(p);

    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      p.awareness?.setLocalState(null);
      p.destroy();
      providerRef.current = null;
      setProvider(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on user.id (stable identity); user.name is read once at connect and re-subscribing on every name-object change would needlessly tear down the collab session
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

  const broadcastTurnStarted = useCallback(() => {
    providerRef.current?.awareness?.setLocalStateField('chatTurnStarted', { t: Date.now() });
  }, []);

  return {
    provider,
    typingUsers,
    setTyping,
    broadcastNewMessage,
    broadcastTurnStarted,
  };
}
