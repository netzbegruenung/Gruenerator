'use client';

import { createContext, useContext, type ReactNode } from 'react';

/**
 * Signals whether the lazy assistant-ui runtime (AssistantRuntimeProvider) is
 * actually mounted. Default `false` so consumers outside the provider — the
 * unauthenticated branch AND the `<Suspense fallback={children}>` window while
 * the ~200 KB runtime chunk loads — read `false` instead of crashing.
 *
 * Page entry points gate their runtime-dependent content on this so no
 * assistant-ui hook (useAssistantRuntime/useComposerRuntime/…) ever runs in the
 * Suspense fallback. See GrueneratorChatProvider / GrueneratorChatRuntime.
 */
const ChatRuntimeReadyContext = createContext(false);

export function ChatRuntimeReadyProvider({ children }: { children: ReactNode }) {
  return (
    <ChatRuntimeReadyContext.Provider value={true}>{children}</ChatRuntimeReadyContext.Provider>
  );
}

/** `true` only when rendered inside the mounted assistant-ui runtime. */
export function useChatRuntimeReady(): boolean {
  return useContext(ChatRuntimeReadyContext);
}
