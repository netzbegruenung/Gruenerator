'use client';

import { type ReactNode, lazy, Suspense, useEffect, useRef } from 'react';
import { type TextModelId } from '@gruenerator/shared/models';
import { useChatConfigStore, type ChatConfig } from '../stores/chatConfigStore';
import { ModelPreferencesProvider } from '../context/ModelPreferencesContext';
import { type ExternalThreadEntry } from './GrueneratorThreadListAdapter';

// The assistant-ui runtime (AssistantRuntimeProvider + model/voice/attachment
// adapters + toolkit) is ~200 KB and is only ever rendered for authenticated
// users. Loading it lazily keeps it out of the initial/entry bundle, so
// logged-out visitors on public pages never download it. The unauthenticated
// branch below never references this lazy component, so the chunk is fetched
// only once a logged-in user mounts a page. See GrueneratorChatRuntime.tsx.
const importRuntime = () => import('./GrueneratorChatRuntime');

const GrueneratorChatRuntimeProvider = lazy(() =>
  importRuntime().then((m) => ({
    default: m.GrueneratorChatRuntimeProvider,
  }))
);

/**
 * Warm the chat-runtime chunk ahead of first use. Call once a user is known to be
 * authenticated so per-route chat surfaces (and the global thread-list portal) hit
 * an already-loaded runtime instead of a cold lazy import. React's `lazy` dedupes
 * the underlying import promise, so this shares the same module fetch.
 */
export const preloadChatRuntime = () => {
  void importRuntime();
};

interface GrueneratorChatProviderProps {
  children: ReactNode;
  userId?: string;
  userName?: string;
  config?: ChatConfig;
  getExternalThreads?: () => ExternalThreadEntry[];
  onExternalThreadClick?: (externalId: string) => void;
  activePath?: string;
  enabledModelIds?: ReadonlySet<TextModelId> | null;
  /**
   * DOM id of the slot the global thread-list portal renders into. When set, the
   * runtime renders the thread list itself (inside AssistantRuntimeProvider), so
   * the app never injects runtime-dependent UI into the Suspense fallback.
   */
  threadListPortalSlotId?: string;
  /** Invoked when the user clicks the global thread-list portal (e.g. navigate to /chat). */
  onRequestOpenChat?: () => void;
}

export function GrueneratorChatProvider({
  children,
  userId,
  userName,
  config,
  getExternalThreads,
  onExternalThreadClick,
  activePath,
  enabledModelIds,
  threadListPortalSlotId,
  onRequestOpenChat,
}: GrueneratorChatProviderProps) {
  // Sync config store during render (before any hooks read from it).
  // useEffect runs AFTER render, which creates a race: providerApiClient
  // would capture the default onUnauthorized before configure() updates it.
  const prevConfigRef = useRef<ChatConfig | undefined>(undefined);
  if (config !== prevConfigRef.current) {
    prevConfigRef.current = config;
    useChatConfigStore.getState().configure(config);
  }

  // Safety net: suppress unhandled rejections from @assistant-ui internals
  // (generateTitle, initialize, rename) that we can't intercept via onClick.
  // - "Thread not found": optimistic rollback after a delete
  // - "Unauthorized": stale cached userId triggers eager initialize() before
  //   useAuth clears the session, then the 401 surfaces after redirect.
  //   onUnauthorized() in chatConfig has already fired the redirect.
  useEffect(() => {
    const handler = (event: PromiseRejectionEvent) => {
      if (!(event.reason instanceof Error)) return;
      const msg = event.reason.message;
      if (msg === 'Thread not found' || msg === 'Unauthorized') {
        event.preventDefault();
        console.warn(`[ThreadList] Suppressed unhandled "${msg}" rejection`);
      }
    };
    window.addEventListener('unhandledrejection', handler);
    return () => window.removeEventListener('unhandledrejection', handler);
  }, []);

  if (!userId) {
    return (
      <ModelPreferencesProvider enabledModelIds={enabledModelIds}>
        {children}
      </ModelPreferencesProvider>
    );
  }

  // fallback={children} renders the page unwrapped while the runtime chunk
  // loads — identical to the unauthenticated branch above, so it is safe by
  // construction. The chunk caches after first load, so navigation never
  // re-suspends. Runtime-dependent chrome (the thread-list portal) is rendered
  // INSIDE the runtime via threadListPortalSlotId, never as fallback children.
  return (
    <ModelPreferencesProvider enabledModelIds={enabledModelIds}>
      <Suspense fallback={children}>
        <GrueneratorChatRuntimeProvider
          userId={userId}
          userName={userName}
          getExternalThreads={getExternalThreads}
          onExternalThreadClick={onExternalThreadClick}
          activePath={activePath}
          threadListPortalSlotId={threadListPortalSlotId}
          onRequestOpenChat={onRequestOpenChat}
        >
          {children}
        </GrueneratorChatRuntimeProvider>
      </Suspense>
    </ModelPreferencesProvider>
  );
}
