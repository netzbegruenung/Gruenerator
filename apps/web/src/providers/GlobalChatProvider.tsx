import {
  GrueneratorChatProvider,
  TooltipProvider,
  preloadChatRuntime,
  type SharepicVariant,
} from '@gruenerator/chat';
import { type SharepicHandoffPayload } from '@gruenerator/contracts';
import { getContractsClient } from '@gruenerator/shared/api';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import apiClient from '../components/utils/apiClient';
import { renderSharepicToImage } from '../features/image-studio/renderSharepicToImage';
import { uploadBlobToMediaLibrary } from '../features/image-studio/services/mediaUploadService';
import { useModelPreferences } from '../features/models/hooks/useModelPreferences';
import { useNotebookChatStore } from '../features/notebook/stores/notebookChatStore';
import useNotebookStore from '../features/notebook/stores/notebookStore';
import { resolveNotebookChatEntries } from '../features/notebook/utils/notebookChatResolver';
import { uploadVideoToTus } from '../features/subtitler/utils/videoUtils';
import { runPython } from '../services/pythonInterpreter';
import { useAuthStore } from '../stores/authStore';
import { buildLoginUrl, isPublicPage } from '../utils/authRedirect';
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
  const navigate = useNavigate();
  const location = useLocation();
  const qaCollectionsLength = useNotebookStore((s) => s.qaCollections.length);
  const { enabledModelIds } = useModelPreferences({ enabled: !!userId });

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

  // Clicking the global thread-list portal opens the chat surface.
  const openChat = useCallback(() => {
    if (!location.pathname.startsWith('/chat')) void navigate('/chat');
  }, [location.pathname, navigate]);

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
      onUnauthorized: () => {
        if (!isPublicPage() && window.location.pathname !== '/login') {
          const currentPath = window.location.pathname + window.location.search;
          window.location.href = buildLoginUrl(currentPath);
        }
      },
      wolkeConnectUrl: '/profile/wolke',
      renderSharepic: renderSharepicToImage,
      runPython,
      onEditSharepic: (variant: SharepicVariant) => {
        // Minted variants live in a real canvas document — open it directly
        // (fully bidirectional with chat edits). Unminted ones use the legacy
        // localStorage handoff into the template flow.
        if (variant.canvasId) {
          window.open(`/studio/canvas/${variant.canvasId}`, '_blank', 'noopener,noreferrer');
          return;
        }
        const handoffId =
          typeof crypto !== 'undefined' && 'randomUUID' in crypto
            ? crypto.randomUUID()
            : `handoff-${Date.now()}`;
        // Contract-typed at the write boundary: a non-canonical canvasType is
        // a compile error here instead of a runtime crash in the studio.
        const payload = {
          canvasType: variant.canvasType,
          initialProps: variant.initialProps,
          ts: Date.now(),
        } satisfies SharepicHandoffPayload;
        try {
          localStorage.setItem(
            `gruenerator:sharepic-handoff:${handoffId}`,
            JSON.stringify(payload)
          );
        } catch (err) {
          console.error('[GlobalChatProvider] Failed to persist sharepic handoff:', err);
        }
        window.open(
          `/studio/templates/${variant.canvasType}?handoff=${handoffId}`,
          '_blank',
          'noopener,noreferrer'
        );
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
      updateSharepicThumbnail: async (canvasId: string, imageDataUrl: string) => {
        const blob = await (await fetch(imageDataUrl)).blob();
        const thumbnailUrl = await uploadBlobToMediaLibrary(blob, {
          filename: `sharepic-thumbnail-${canvasId}.png`,
          uploadSource: 'chat-sharepic-thumbnail',
        });
        if (!thumbnailUrl) return;
        await getContractsClient().canvas.update({
          params: { id: canvasId },
          body: { thumbnail_url: thumbnailUrl },
        });
      },
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
      onEditInDocs: async (content: string, title?: string, existingDocId?: string) => {
        if (existingDocId) {
          window.open(`/docs/${existingDocId}`, '_blank', 'noopener,noreferrer');
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
          window.open(`/docs/${data.documentId}`, '_blank', 'noopener,noreferrer');
          return data.documentId;
        }
      },
    }),
    []
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
      onRequestOpenChat={openChat}
    >
      <TooltipProvider>{children}</TooltipProvider>
    </GrueneratorChatProvider>
  );
}
