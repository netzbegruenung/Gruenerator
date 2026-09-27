'use client';

import { createContext, useContext } from 'react';

export interface ChatNavigationContextValue {
  /** Navigate the host app to an in-app path. */
  navigate: (path: string, opts?: { replace?: boolean }) => void;
  /** Current in-app pathname (host's `location.pathname`), if the host provides one. */
  activePath?: string;
}

const ChatNavigationContext = createContext<ChatNavigationContextValue | null>(null);

export const ChatNavigationProvider = ChatNavigationContext.Provider;

/**
 * Host navigation for chat UI that must change the URL — the thread list above
 * all, where opening a thread IS a navigation. Null on hosts without a router
 * (mobile drives its own thread selection), so callers keep a direct-switch
 * fallback.
 */
export function useChatNavigation() {
  return useContext(ChatNavigationContext);
}
