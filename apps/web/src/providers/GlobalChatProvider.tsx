import {
  GrueneratorChatProvider,
  TooltipProvider,
  preloadChatRuntime,
  requestThreadListReload,
  type ChatConfig,
  type ChatVoice,
  type SharepicVariant,
} from '@gruenerator/chat';
import { type RoleRef } from '@gruenerator/contracts';
import { ApiError, getContractsClient, type UnauthorizedInfo } from '@gruenerator/shared/api';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { handleUnauthorized } from '../components/utils/apiClient';
import { CHUNK_PAGE_SIZE } from '../features/admin/hooks/useChunkInspector';
import { QUERY_KEYS } from '../features/auth/hooks/useProfileData';
import { profileApiService } from '../features/auth/services/profileApiService';
import {
  ChatPdfLetterheadExportHost,
  requestPdfLetterheadExport,
} from '../features/chat/ChatPdfLetterheadExport';
import { ChatSourceReaderHost, requestChatSourceReader } from '../features/chat/ChatSourceReader';
import { useModelPreferences } from '../features/models/hooks/useModelPreferences';
import {
  type NotebookChat,
  useNotebookChatStore,
} from '../features/notebook/stores/notebookChatStore';
import { useTrashUndoToast } from '../features/trash/trashUndoToast';
import { useSetUserDefault } from '../features/user-defaults/userDefaultsQueries';
import { sessionDebug } from '../lib/sessionDebug';
import { runPython } from '../services/pythonInterpreter';
import { useAuthStore } from '../stores/authStore';
import { getDesktopToken } from '../utils/desktopAuth';
import { getDevBypassUserId } from '../utils/devBypassUser';
import { isDesktopApp, resolveApiAssetUrl } from '../utils/platform';

/**
 * Platform-aware fetch for the chat runtime (streaming endpoints).
 *
 * Web: relative `/api/...` URLs resolve same-origin; auth rides on the session
 * cookie (`credentials: 'include'`).
 *
 * Desktop (Tauri): the webview origin is `tauri://localhost`, so a relative
 * `/api/...` URL hits the bundle (404 → SPA `index.html`, `text/html`) instead
 * of the backend — chat streams never connect ("nothing happens"). Resolve to
 * the absolute API origin and send the bearer token (no cookie cross-origin).
 */
const chatFetch = async (url: string, options?: RequestInit): Promise<Response> => {
  if (isDesktopApp()) {
    const headers = new Headers(options?.headers);
    const token = await getDesktopToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
    return fetch(resolveApiAssetUrl(url), { ...options, headers });
  }
  const devUser = getDevBypassUserId();
  if (devUser) {
    const headers = new Headers(options?.headers);
    headers.set('x-dev-auth-user', devUser);
    return fetch(url, { ...options, headers, credentials: 'include' });
  }
  return fetch(url, { ...options, credentials: 'include' });
};

// In-flight mints by variant id. The server mint is idempotent on the (thread,
// variant) binding only once one has finished: two concurrent mints both pass
// the binding lookup and leave an orphaned canvas. The auto-save after a turn
// and a click on „Im Studio öffnen" therefore share one request. Module scope:
// the provider is a singleton.
const mintsInFlight = new Map<string, Promise<string>>();

/** Mints a chat sharepic variant as a canvas and returns its id. */
function mintChatSharepic(variant: SharepicVariant, threadId: string): Promise<string> {
  const running = mintsInFlight.get(variant.id);
  if (running) return running;
  const mint = (async () => {
    const { chatMintBody } = await import('../features/image-studio/freitext/chatMintBody');
    const res = await getContractsClient().canvas.fromVariant({
      body: { ...(await chatMintBody(variant)), threadId, variantId: variant.id },
    });
    if (res.status !== 201) throw new ApiError(res.status, `mint failed (HTTP ${res.status})`);
    return res.body.canvasId;
  })().finally(() => mintsInFlight.delete(variant.id));
  mintsInFlight.set(variant.id, mint);
  return mint;
}

// DOM id of the sidebar slot the global thread list renders into. The slot
// element lives in the layout Sidebar; the chat runtime renders the thread list
// into it (see GrueneratorChatRuntimeProvider's threadListPortalSlotId).
const PORTAL_SLOT_ID = 'chat-thread-portal-slot';

interface GlobalChatProviderProps {
  children: ReactNode;
}

type ResolveNotebookChatEntries = (
  chats: Record<string, NotebookChat>,
  userCollections: Array<{ id: string; name: string }>
) => Array<{ collectionKey: string; title: string; path: string; timestamp: number }>;

export function GlobalChatProvider({ children }: GlobalChatProviderProps) {
  const userId = useAuthStore((s) => s.user?.id);
  const userName = useAuthStore((s) => s.user?.display_name);
  const isInstanceAdmin = useAuthStore((s) => s.user?.is_admin === true);
  const navigate = useNavigate();
  const location = useLocation();
  const { enabledModelIds } = useModelPreferences({ enabled: !!userId });

  // The Mistral voice adapter is for instance admins only; loaded on demand so
  // it stays out of the entry's static closure (#5891).
  const [chatVoice, setChatVoice] = useState<ChatVoice | undefined>(undefined);
  useEffect(() => {
    if (!isInstanceAdmin) return;
    let live = true;
    void import('../features/voice-agent-test/chatVoice').then((m) => {
      if (live) setChatVoice(m.mistralChatVoice);
    });
    return () => {
      live = false;
    };
  }, [isInstanceAdmin]);

  // Rollenwahl im Composer → Konto-Voreinstellung. Über einen Ref, weil
  // `chatConfig` nur bei einem Wechsel von `isInstanceAdmin` neu gebaut wird
  // und die Mutation an den QueryClient dieses Renders gebunden ist.
  const setUserDefault = useSetUserDefault<'profile', 'activeRole'>();
  const setUserDefaultRef = useRef(setUserDefault);
  useEffect(() => {
    setUserDefaultRef.current = setUserDefault;
  }, [setUserDefault]);

  // Notebook collections name the notebook chats in the thread list. Same key and
  // fetcher as the profile/notebook pages (and the /auth/init seed), so it joins
  // their request instead of issuing a second one.
  const { data: notebookCollections } = useQuery({
    queryKey: QUERY_KEYS.notebookCollections(userId),
    queryFn: profileApiService.getNotebookCollections,
    enabled: !!userId,
    staleTime: 15 * 60_000,
  });

  useEffect(() => {
    const handler = (e: Event) => {
      const { mentions } = (e as CustomEvent<{ mentions: string[] }>).detail;
      if (mentions.length === 0) return;
      const names = mentions.map((m) => `@${m}`).join(', ');
      void import('sonner').then(({ toast }) =>
        toast.warning(`${names} konnte nicht aufgeloest werden`, {
          description: 'Nutze @docs um ein kollaboratives Dokument auszuwaehlen.',
        })
      );
    };
    window.addEventListener('gruenerator:unresolved-mentions', handler);
    return () => window.removeEventListener('gruenerator:unresolved-mentions', handler);
  }, []);

  // Refs for stable getExternalThreads callback — updated via Zustand .subscribe() to avoid re-renders
  const chatsRef = useRef(useNotebookChatStore.getState().chats);
  const qaRef = useRef<{ id: string; name: string }[]>([]);

  useEffect(() => {
    qaRef.current = notebookCollections ?? [];
  }, [notebookCollections]);

  useEffect(() => {
    const unsubChats = useNotebookChatStore.subscribe((s) => {
      chatsRef.current = s.chats;
    });
    return () => {
      unsubChats();
    };
  }, []);

  // The resolver carries every notebook page config (~29 KB minified), so it
  // loads after mount instead of with the entry (#5891). A thread list read
  // before it arrives gets no notebook entries and is re-run once it is here.
  const resolverRef = useRef<ResolveNotebookChatEntries | null>(null);
  const listedWithoutResolverRef = useRef(false);
  useEffect(() => {
    let live = true;
    void import('../features/notebook/utils/notebookChatResolver').then((m) => {
      if (!live) return;
      resolverRef.current = m.resolveNotebookChatEntries;
      if (listedWithoutResolverRef.current) requestThreadListReload();
    });
    return () => {
      live = false;
    };
  }, []);

  const getExternalThreads = useCallback(() => {
    const resolveNotebookChatEntries = resolverRef.current;
    if (!resolveNotebookChatEntries) {
      listedWithoutResolverRef.current = true;
      return [];
    }
    const userCols = qaRef.current.map((c) => ({ id: c.id, name: c.name }));
    const entries = resolveNotebookChatEntries(chatsRef.current, userCols);
    return entries.map((e) => ({
      remoteId: `notebook:${e.collectionKey}`,
      title: e.title,
      externalId: e.path,
      updatedAt: new Date(e.timestamp).toISOString(),
    }));
  }, []);

  const notifyTrashed = useTrashUndoToast();
  const handleThreadTrashed = useCallback(
    (t: { remoteId: string; title: string | null }) =>
      notifyTrashed({ kind: 'chat_thread', id: t.remoteId, title: t.title }),
    [notifyTrashed]
  );

  const handleExternalClick = useCallback(
    (path: string) => {
      void navigate(path, { state: { resumeNotebookChat: true } });
    },
    [navigate]
  );

  // Router access for the chat package — the thread list opens a thread by
  // navigating to its URL, which works the same on /chat and off it.
  const handleChatNavigate = useCallback(
    (path: string, opts?: { replace?: boolean; state?: unknown }) => {
      void navigate(path, {
        replace: opts?.replace ?? false,
        ...(opts?.state != null ? { state: opts.state } : {}),
      });
    },
    [navigate]
  );

  // Warm the chat-runtime chunk as soon as the user is authenticated so per-route
  // chat surfaces (and the thread-list portal) render against a loaded runtime.
  useEffect(() => {
    if (userId) preloadChatRuntime();
  }, [userId]);

  const chatConfig = useMemo(
    () => ({
      // Platform-aware fetch so chat streaming works in the desktop shell
      // (absolute API origin + bearer); on web it's the same relative+cookie
      // behaviour as the store default.
      fetch: chatFetch,
      onUnauthorized: async (info?: UnauthorizedInfo) => {
        sessionDebug('http.401', {
          stack: 'chat',
          endpoint: info?.url,
          status: info?.status,
          code: info?.code,
          requestId: info?.requestId,
        });
        // Route through the shared authority: probe → 'retry' replays the
        // request once (transient cookie rotation), 'logout' fires the single
        // atomic teardown, 'stay' leaves the user put (infra blip / logging out).
        return (await handleUnauthorized('chat', info?.code)) === 'retry';
      },
      wolkeConnectUrl: '/settings/wolke',
      onOpenSourceDocument: requestChatSourceReader,
      // Nur für Instanz-Admins: die Rolle lebt in apps/web, die Route auch.
      // packages/chat bekommt fertig entschieden, ob es etwas anzuzeigen gibt.
      chunkInspectorHref: isInstanceAdmin
        ? ({
            documentId,
            collectionId,
            chunkIndex,
          }: {
            documentId: string;
            collectionId: string;
            chunkIndex: number;
          }) => {
            // Ohne offset öffnet die Seite immer bei 0 — der Anker `#chunk-N`
            // trifft dann nur, wenn der Chunk zufällig auf der ersten Seite liegt.
            const offset = Math.floor(chunkIndex / CHUNK_PAGE_SIZE) * CHUNK_PAGE_SIZE;
            return `/admin/chunks/${encodeURIComponent(documentId)}?collection=${encodeURIComponent(collectionId)}&offset=${offset}#chunk-${chunkIndex}`;
          }
        : undefined,
      // Interner Test: Mistrals Voice-Agent geht über den globalen Endpunkt.
      voice: isInstanceAdmin ? chatVoice : undefined,
      // The render stack (canvas composer, ggraphic, screenshot, zip) is ~340 kB
      // of minified JS. This provider sits at the app root, so a static import
      // ships it on every first load; load it on the first sharepic instead.
      renderSharepic: async (...args: Parameters<NonNullable<ChatConfig['renderSharepic']>>) =>
        (await import('../features/image-studio/renderSharepicToImage')).renderSharepicToImage(
          ...args
        ),
      renderSharepicSheet: async (initialProps: Record<string, unknown>) =>
        (await import('../features/image-studio/freitext/creatorRender')).renderSharepicSheet(
          initialProps
        ),
      reviewSharepic: async (input: Parameters<NonNullable<ChatConfig['reviewSharepic']>>[0]) =>
        (await import('../features/image-studio/freitext/creatorRender')).reviewChatSharepic(input),
      runPython,
      onEditSharepic: (variant: SharepicVariant, opts?: { threadId: string | null }) => {
        // Already a real canvas document → open it directly.
        if (variant.canvasId) {
          window.open(`/studio/canvas/${variant.canvasId}`, '_blank', 'noopener,noreferrer');
          return;
        }
        // Unminted: mint server-side (authoritative, lossless Yjs seed), then
        // open the real /studio/canvas/:id. The tab MUST open synchronously in
        // the click handler (popup blockers reject a post-await window.open);
        // it's redirected once the mint responds. threadId binds the canvas to
        // the variant so a later chat edit reuses the same document.
        const threadId = opts?.threadId;
        if (!threadId) {
          console.error('[Sharepic] Cannot open in studio: no active threadId');
          void import('sonner').then(({ toast }) =>
            toast.error('Sharepic konnte nicht geöffnet werden — bitte Chat neu laden.')
          );
          return;
        }
        const tab = window.open('about:blank', '_blank');
        mintChatSharepic(variant, threadId)
          .then((canvasId) => {
            const studioUrl = `/studio/canvas/${canvasId}`;
            // No store stamp needed: a thread reload resolves the canvas from
            // the (thread, variant) binding table.
            if (tab) {
              tab.location.href = studioUrl;
            } else {
              // Popup was blocked: the canvas is saved; give the user a way in.
              void import('sonner').then(({ toast }) =>
                toast.info('Sharepic gespeichert.', {
                  action: { label: 'Im Studio öffnen', onClick: () => window.open(studioUrl) },
                })
              );
            }
          })
          .catch((err: unknown) => {
            console.error('[Sharepic] mint-on-open failed:', err);
            tab?.close();
            void import('sonner').then(({ toast }) =>
              toast.error('Sharepic konnte nicht geöffnet werden — bitte erneut versuchen.')
            );
          });
      },
      onEditImage: ({ src, title }: { src: string; title: string }) => {
        // Same popup rule as onEditSharepic: open the tab inside the click.
        const tab = window.open('about:blank', '_blank');
        void import('../features/image-studio/bild-editor-v2/canvasHandoff')
          .then(({ mintCanvasFromImage }) => mintCanvasFromImage(src, title.slice(0, 120)))
          .then((canvas) => {
            const url = `/studio/canvas/${canvas.id}`;
            if (tab) tab.location.href = url;
            else window.location.assign(url);
          })
          .catch((err: unknown) => {
            console.error('[GeneratedImage] open in editor failed:', err);
            tab?.close();
            void import('sonner').then(({ toast }) =>
              toast.error('Das Bild konnte nicht im Editor geöffnet werden.')
            );
          });
      },
      saveSharepic: (variant: SharepicVariant, threadId: string) =>
        mintChatSharepic(variant, threadId).catch((err: unknown) => {
          // swallow-ok: the sharepic stays in the chat; „Im Studio öffnen" saves it later
          console.warn('[Sharepic] auto-save failed:', err);
          return null;
        }),
      fetchSharepicState: async (canvasId: string) => {
        const result = await getContractsClient().canvas.getState({ params: { id: canvasId } });
        if (result.status !== 200) return null;
        return {
          state: result.body.state,
          version: result.body.version,
          ...(result.body.pages ? { pages: result.body.pages } : {}),
        };
      },
      downloadSharepicZip: async (images: string[], canvasType: string) =>
        (await import('../features/image-studio/services/downloadSharepicZip')).downloadSharepicZip(
          images,
          canvasType
        ),
      fetchSharepicVersions: async (canvasId: string) => {
        const result = await getContractsClient().canvas.listVersions({
          params: { id: canvasId },
        });
        if (result.status !== 200) return [];
        return result.body.versions;
      },
      fetchSharepicVersionState: async (canvasId: string, version: number) => {
        const result = await getContractsClient().canvas.getVersion({
          params: { id: canvasId, version },
        });
        if (result.status !== 200) return null;
        return result.body.state;
      },
      updateSharepicThumbnail: async (canvasId: string, imageDataUrl: string) =>
        (
          await import('../features/image-studio/services/canvasThumbnailService')
        ).updateCanvasThumbnail(canvasId, imageDataUrl, 'chat-sharepic-thumbnail'),
      restoreSharepicVersion: async (canvasId: string, version: number) => {
        const result = await getContractsClient().canvas.restoreVersion({
          params: { id: canvasId, version },
          body: {},
        });
        if (result.status !== 200) return null;
        return { version: result.body.version, state: result.body.state };
      },
      onExportPdfLetterhead: requestPdfLetterheadExport,
      getPodcastUrl: (podcastSlug: string) => `/podcast/${podcastSlug}`,
      persistActiveRole: (role: RoleRef | null) => {
        // Best effort: die Rolle gilt in dieser Sitzung ohnehin schon. Die
        // Mutation rollt den Cache bei Fehlschlag selbst zurück; ein Hinweis
        // im Chat wäre für eine nebenbei gemerkte Voreinstellung zu laut.
        setUserDefaultRef.current.mutate({
          generator: 'profile',
          key: 'activeRole',
          value: role,
        });
      },
      onEditInDocs: async (content: string, title?: string, existingDocId?: string) => {
        if (existingDocId) {
          window.open(`/office/${existingDocId}`, '_blank', 'noopener,noreferrer');
          return existingDocId;
        }

        const response = await chatFetch('/api/docs/from-export', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ content, title, documentType: 'chat-response' }),
        });
        if (!response.ok) throw new Error('Document creation failed');
        const data = (await response.json()) as { documentId?: string; title?: string };
        if (data.documentId) {
          window.open(`/office/${data.documentId}`, '_blank', 'noopener,noreferrer');
          return data.documentId;
        }
      },
    }),
    [isInstanceAdmin, chatVoice]
  );

  return (
    <GrueneratorChatProvider
      userId={userId}
      userName={userName}
      config={chatConfig}
      getExternalThreads={getExternalThreads}
      onThreadTrashed={handleThreadTrashed}
      onExternalThreadClick={handleExternalClick}
      activePath={location.pathname}
      enabledModelIds={enabledModelIds}
      threadListPortalSlotId={PORTAL_SLOT_ID}
      onNavigate={handleChatNavigate}
    >
      <TooltipProvider>
        {children}
        <ChatPdfLetterheadExportHost />
        <ChatSourceReaderHost />
      </TooltipProvider>
    </GrueneratorChatProvider>
  );
}
