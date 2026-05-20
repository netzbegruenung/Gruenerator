import {
  GrueneratorChatProvider,
  ChatThreadList,
  TooltipProvider,
  type SharepicVariant,
} from '@gruenerator/chat';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';

import { renderSharepicToImage } from '../features/image-studio/renderSharepicToImage';
import { useModelPreferences } from '../features/models/hooks/useModelPreferences';
import { useNotebookChatStore } from '../features/notebook/stores/notebookChatStore';
import useNotebookStore from '../features/notebook/stores/notebookStore';
import { resolveNotebookChatEntries } from '../features/notebook/utils/notebookChatResolver';
import { useAuthStore } from '../stores/authStore';
import { buildLoginUrl, isPublicPage } from '../utils/authRedirect';

const PORTAL_SLOT_ID = 'chat-thread-portal-slot';

function ChatThreadPortal() {
  const navigate = useNavigate();
  const location = useLocation();
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const sync = () => setPortalTarget(document.getElementById(PORTAL_SLOT_ID));
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  const handleClick = () => {
    if (!location.pathname.startsWith('/chat')) {
      void navigate('/chat');
    }
  };

  if (!portalTarget) return null;

  return createPortal(
    <div onClick={handleClick} className="contents">
      <ChatThreadList noScroll />
    </div>,
    portalTarget
  );
}

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
    >
      <TooltipProvider>
        {children}
        {userId && <ChatThreadPortal />}
      </TooltipProvider>
    </GrueneratorChatProvider>
  );
}
