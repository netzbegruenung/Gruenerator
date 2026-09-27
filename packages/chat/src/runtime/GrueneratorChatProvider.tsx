'use client';

import { isApiErrorWithStatus, isUnauthorizedError } from '@gruenerator/shared/api';
import { type TextModelId } from '@gruenerator/shared/models';
import { type ReactNode, lazy, Suspense, useEffect, useRef } from 'react';

import { ModelPreferencesProvider } from '../context/ModelPreferencesContext';
import { useChatConfigStore, type ChatConfig } from '../stores/chatConfigStore';

import { type ExternalThreadEntry } from './GrueneratorThreadListAdapter';

// The assistant-ui runtime (AssistantRuntimeProvider + model/voice/attachment
// adapters + toolkit) is ~200 KB and is only ever rendered for authenticated
// users. Loading it lazily keeps it out of the initial/entry bundle, so
// logged-out visitors on public pages never download it. The unauthenticated
// branch below never references this lazy component, so the chunk is fetched
// only once a logged-in user mounts a page. See GrueneratorChatRuntime.tsx.
const importRuntime = () => import('./GrueneratorChatRuntime');

// WebKit (iOS Safari) occasionally resolves a dynamic import() to `undefined`
// instead of rejecting, most often for a stale chunk URL left over from a
// previous deploy (see apps/web/src/index.tsx's `vite:preloadError` reload —
// that listener only fires on an actual rejection, not on this resolved-but-
// empty case). The browser memoizes import() per specifier, so re-calling
// importRuntime() here would just return the same broken result — a retry
// loop can't help. Reload once per URL instead, mirroring the
// `vite:preloadError` recovery, so a stale deploy self-heals instead of
// crashing with "undefined is not an object (evaluating '...RuntimeProvider')".
const loadRuntimeProvider = async () => {
  const m = await importRuntime();
  if (m?.GrueneratorChatRuntimeProvider) {
    return { default: m.GrueneratorChatRuntimeProvider };
  }
  const reloadKey = 'gruenerator:chatRuntimeImportError:reloaded';
  if (sessionStorage.getItem(reloadKey) !== window.location.href) {
    sessionStorage.setItem(reloadKey, window.location.href);
    window.location.reload();
  }
  throw new Error('Failed to load chat runtime module');
};

const GrueneratorChatRuntimeProvider = lazy(loadRuntimeProvider);

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
  /** Host router. Lets the thread list open a thread by navigating to its URL. */
  onNavigate?: (path: string, opts?: { replace?: boolean }) => void;
}

/**
 * assistant-ui's message for acting on a thread it never initialized:
 * `Thread "__LOCALID_x" has status "new", so it cannot generate a title.`
 * Matched on shape rather than on one full sentence, so the sibling actions the
 * same error factory produces ("be initialized here", …) are covered too.
 */
const UNINITIALIZED_THREAD_RE = /^Thread ".*" has status "new", so it cannot /;

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
  onNavigate,
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
  // - 'has status "new"': assistant-ui's own runEnd hook calls generateTitle()
  //   unguarded and unawaited (RemoteThreadListHookInstanceManager). When
  //   adapter.initialize() rejected, the optimistic "regular" status rolls back
  //   to "new" and that call throws into nowhere. Nothing is lost — the server
  //   names the thread on turn persistence — so the report is pure noise.
  useEffect(() => {
    const handler = (event: PromiseRejectionEvent) => {
      if (!(event.reason instanceof Error)) return;
      // Narrowed from a bare message-string match: that suppressed ANY error
      // whose text happened to read "Thread not found" or "Unauthorized",
      // including future genuine ones, and hid them from monitoring too.
      // Only the typed cases this hook exists for are swallowed.
      const isStaleThread = isApiErrorWithStatus(event.reason, 404);
      const isUninitializedThread = UNINITIALIZED_THREAD_RE.test(event.reason.message);
      if (isStaleThread || isUninitializedThread || isUnauthorizedError(event.reason)) {
        event.preventDefault();
        console.warn(
          `[ThreadList] Suppressed unhandled "${event.reason.message}" rejection`,
          event.reason
        );
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
          onNavigate={onNavigate}
        >
          {children}
        </GrueneratorChatRuntimeProvider>
      </Suspense>
    </ModelPreferencesProvider>
  );
}
