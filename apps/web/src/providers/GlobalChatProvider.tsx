import {
  GrueneratorChatProvider,
  TooltipProvider,
  preloadChatRuntime,
  type SharepicVariant,
} from '@gruenerator/chat';
import { type RoleRef } from '@gruenerator/contracts';
import { getContractsClient } from '@gruenerator/shared/api';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import apiClient, { handleUnauthorized } from '../components/utils/apiClient';
import { CHUNK_PAGE_SIZE } from '../features/admin/hooks/useChunkInspector';
import {
  ChatPdfLetterheadExportHost,
  requestPdfLetterheadExport,
} from '../features/chat/ChatPdfLetterheadExport';
import { renderSharepicToImage } from '../features/image-studio/renderSharepicToImage';
import { updateCanvasThumbnail } from '../features/image-studio/services/canvasThumbnailService';
import { useModelPreferences } from '../features/models/hooks/useModelPreferences';
import { useNotebookChatStore } from '../features/notebook/stores/notebookChatStore';
import useNotebookStore from '../features/notebook/stores/notebookStore';
import { resolveNotebookChatEntries } from '../features/notebook/utils/notebookChatResolver';
import { uploadVideoToTus } from '../features/subtitler/utils/videoUtils';
import { useSetUserDefault } from '../features/user-defaults/userDefaultsQueries';
import { sessionDebug } from '../lib/sessionDebug';
import { runPython } from '../services/pythonInterpreter';
import { useAuthStore } from '../stores/authStore';
import { getDesktopToken } from '../utils/desktopAuth';
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
  return fetch(url, { ...options, credentials: 'include' });
};

// Variant ids with an in-flight mint-on-open, to drop concurrent double-clicks
// (see onEditSharepic). Module scope: the provider is a singleton.
const mintingVariantIds = new Set<string>();

// DOM id of the sidebar slot the global thread list renders into. The slot
// element lives in the layout Sidebar; the chat runtime renders the thread list
// into it (see GrueneratorChatRuntimeProvider's threadListPortalSlotId).
const PORTAL_SLOT_ID = 'chat-thread-portal-slot';

interface GlobalChatProviderProps {
  children: ReactNode;
}

export function GlobalChatProvider({ children }: GlobalChatProviderProps) {
  const userId = useAuthStore((s) => s.user?.id);
  const userName = useAuthStore((s) => s.user?.display_name);
  const isInstanceAdmin = useAuthStore((s) => s.user?.is_admin === true);
  const navigate = useNavigate();
  const location = useLocation();
  const qaCollectionsLength = useNotebookStore((s) => s.qaCollections.length);
  const { enabledModelIds } = useModelPreferences({ enabled: !!userId });

  // Rollenwahl im Composer → Konto-Voreinstellung. Über einen Ref, weil
  // `chatConfig` nur bei einem Wechsel von `isInstanceAdmin` neu gebaut wird
  // und die Mutation an den QueryClient dieses Renders gebunden ist.
  const setUserDefault = useSetUserDefault<'profile', 'activeRole'>();
  const setUserDefaultRef = useRef(setUserDefault);
  useEffect(() => {
    setUserDefaultRef.current = setUserDefault;
  }, [setUserDefault]);

  // Notebook collections power @notebook mention metadata; fetch lazily when
  // an authenticated user actually needs them. React Query caches the result.
  useQuery({
    queryKey: ['qa-collections', userId],
    queryFn: async () => {
      await useNotebookStore.getState().fetchQACollections();
      return useNotebookStore.getState().qaCollections;
    },
    enabled: !!userId && qaCollectionsLength === 0,
    staleTime: 5 * 60_000,
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
  const qaRef = useRef(useNotebookStore.getState().qaCollections);

  useEffect(() => {
    const unsubChats = useNotebookChatStore.subscribe((s) => {
      chatsRef.current = s.chats;
    });
    const unsubQa = useNotebookStore.subscribe((s) => {
      qaRef.current = s.qaCollections;
    });
    return () => {
      unsubChats();
      unsubQa();
    };
  }, []);

  const getExternalThreads = useCallback(() => {
    const userCols = qaRef.current.map((c) => ({ id: c.id, name: c.name }));
    const entries = resolveNotebookChatEntries(chatsRef.current, userCols);
    return entries.map((e) => ({
      remoteId: `notebook:${e.collectionKey}`,
      title: e.title,
      externalId: e.path,
      updatedAt: new Date(e.timestamp).toISOString(),
    }));
  }, []);

  const handleExternalClick = useCallback(
    (path: string) => {
      void navigate(path, { state: { resumeNotebookChat: true } });
    },
    [navigate]
  );

  // Router access for the chat package — the thread list opens a thread by
  // navigating to its URL, which works the same on /chat and off it.
  const handleChatNavigate = useCallback(
    (path: string, opts?: { replace?: boolean }) => {
      void navigate(path, { replace: opts?.replace ?? false });
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
      onUnauthorized: async () => {
        sessionDebug('http.401', { stack: 'chat' });
        // Route through the shared authority: probe → 'retry' replays the
        // request once (transient cookie rotation), 'logout' fires the single
        // atomic teardown, 'stay' leaves the user put (infra blip / logging out).
        return (await handleUnauthorized('chat')) === 'retry';
      },
      wolkeConnectUrl: '/settings/wolke',
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
      renderSharepic: renderSharepicToImage,
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
        // Guard a rapid double-click on the same variant: two concurrent mints
        // would race (both pass the binding lookup → two canvas docs, one
        // orphaned). Ignore the second click while the first is in flight.
        if (mintingVariantIds.has(variant.id)) return;
        mintingVariantIds.add(variant.id);
        const tab = window.open('about:blank', '_blank');
        void (async () => {
          try {
            const res = await getContractsClient().canvas.fromVariant({
              body: {
                canvasType: variant.canvasType,
                initialProps: variant.initialProps,
                threadId,
                variantId: variant.id,
              },
            });
            if (res.status !== 201) throw new Error(`mint failed (HTTP ${res.status})`);
            const { canvasId } = res.body;
            const studioUrl = `/studio/canvas/${canvasId}`;
            // No store stamp needed: the mint is idempotent on the (thread,
            // variant) binding, so a re-click returns the same canvasId, and a
            // thread reload resolves it from the binding table.
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
          } catch (err) {
            console.error('[Sharepic] mint-on-open failed:', err);
            tab?.close();
            void import('sonner').then(({ toast }) =>
              toast.error('Sharepic konnte nicht geöffnet werden — bitte erneut versuchen.')
            );
          } finally {
            mintingVariantIds.delete(variant.id);
          }
        })();
      },
      fetchSharepicState: async (canvasId: string) => {
        const result = await getContractsClient().canvas.getState({ params: { id: canvasId } });
        if (result.status !== 200) return null;
        return {
          state: result.body.state,
          version: result.body.version,
          ...(result.body.pages ? { pages: result.body.pages } : {}),
        };
      },
      downloadSharepicZip: async (images: string[], canvasType: string) => {
        const response = await apiClient.post(
          '/exports/zip',
          { images, canvasType },
          { responseType: 'blob' }
        );
        const url = URL.createObjectURL(response.data as Blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `gruenerator-${canvasType}-${Date.now()}.zip`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      },
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
      updateSharepicThumbnail: (canvasId: string, imageDataUrl: string) =>
        updateCanvasThumbnail(canvasId, imageDataUrl, 'chat-sharepic-thumbnail'),
      restoreSharepicVersion: async (canvasId: string, version: number) => {
        const result = await getContractsClient().canvas.restoreVersion({
          params: { id: canvasId, version },
          body: {},
        });
        if (result.status !== 200) return null;
        return { version: result.body.version, state: result.body.state };
      },
      uploadReelVideo: (file: File, onProgress?: (pct: number) => void) =>
        uploadVideoToTus(file, onProgress),
      getReelVideoUrl: (projectId: string) =>
        `${apiClient.defaults.baseURL}/subtitler/projects/${projectId}/video`,
      fetchReelProject: async (projectId: string) => {
        const result = await getContractsClient().subtitler.getProject({ params: { projectId } });
        if (result.status !== 200) return null;
        const project = result.body.project;
        if (!project) return null;
        return {
          title: project.title ?? 'Reel',
          subtitles: project.subtitles ?? null,
        };
      },
      fetchReelAutoProgress: async (uploadId: string) => {
        try {
          const response = await apiClient.get<{
            status: 'processing' | 'processing_done' | 'complete' | 'error';
            overallProgress?: number | null;
            projectId?: string | null;
            subtitles?: string | null;
            error?: string | null;
          }>(`/subtitler/auto-progress/${uploadId}`);
          const p = response.data;
          return {
            status: p.status === 'processing_done' ? ('processing' as const) : p.status,
            overallProgress: p.overallProgress ?? 0,
            projectId: p.projectId ?? null,
            subtitles: p.subtitles ?? null,
            error: p.error ?? null,
          };
        } catch (err) {
          // 404 = Redis key expired (1h TTL) or unknown uploadId.
          if ((err as { response?: { status?: number } }).response?.status === 404) {
            return {
              status: 'not_found' as const,
              overallProgress: 0,
              projectId: null,
              subtitles: null,
              error: null,
            };
          }
          return null;
        }
      },
      onOpenReelStudio: (projectId: string) => {
        window.open(`/reel/studio?project=${projectId}`, '_blank', 'noopener,noreferrer');
      },
      onExportPdfLetterhead: requestPdfLetterheadExport,
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
    [isInstanceAdmin]
  );

  return (
    <GrueneratorChatProvider
      userId={userId}
      userName={userName}
      config={chatConfig}
      getExternalThreads={getExternalThreads}
      onExternalThreadClick={handleExternalClick}
      activePath={location.pathname}
      enabledModelIds={enabledModelIds}
      threadListPortalSlotId={PORTAL_SLOT_ID}
      onNavigate={handleChatNavigate}
    >
      <TooltipProvider>
        {children}
        <ChatPdfLetterheadExportHost />
      </TooltipProvider>
    </GrueneratorChatProvider>
  );
}
