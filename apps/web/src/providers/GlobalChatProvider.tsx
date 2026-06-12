import {
  GrueneratorChatProvider,
  TooltipProvider,
  preloadChatRuntime,
  type SharepicVariant,
} from '@gruenerator/chat';
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
import { useAuthStore } from '../stores/authStore';
import { buildLoginUrl, isPublicPage } from '../utils/authRedirect';

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
      onUnauthorized: () => {
        if (!isPublicPage() && window.location.pathname !== '/login') {
          const currentPath = window.location.pathname + window.location.search;
          window.location.href = buildLoginUrl(currentPath);
        }
      },
      wolkeConnectUrl: '/profile/wolke',
      renderSharepic: renderSharepicToImage,
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
        const payload = {
          canvasType: variant.canvasType,
          initialProps: variant.initialProps,
          ts: Date.now(),
        };
        try {
          localStorage.setItem(
            `gruenerator:sharepic-handoff:${handoffId}`,
            JSON.stringify(payload)
          );
        } catch (err) {
          console.error('[GlobalChatProvider] Failed to persist sharepic handoff:', err);
        }
        window.open(
          `/studio/vorlagen/${variant.canvasType}?handoff=${handoffId}`,
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
      onEditInDocs: async (content: string, title?: string, existingDocId?: string) => {
        if (existingDocId) {
          window.open(`/docs/${existingDocId}`, '_blank', 'noopener,noreferrer');
          return existingDocId;
        }

        const response = await fetch('/api/docs/from-export', {
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
