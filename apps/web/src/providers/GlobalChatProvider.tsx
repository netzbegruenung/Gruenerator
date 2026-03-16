import { GrueneratorChatProvider, ChatThreadList, TooltipProvider } from '@gruenerator/chat';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';

import { useNotebookChatStore } from '../features/notebook/stores/notebookChatStore';
import useNotebookStore from '../features/notebook/stores/notebookStore';
import { resolveNotebookChatEntries } from '../features/notebook/utils/notebookChatResolver';
import { useOptimizedAuth } from '../hooks/useAuth';
import { buildLoginUrl, isPublicPage } from '../utils/authRedirect';

const PORTAL_SLOT_ID = 'chat-thread-portal-slot';

function ChatThreadPortal() {
  const navigate = useNavigate();
  const location = useLocation();
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const el = document.getElementById(PORTAL_SLOT_ID);
    if (el) {
      setPortalTarget(el);
      return;
    }

    const observer = new MutationObserver(() => {
      const target = document.getElementById(PORTAL_SLOT_ID);
      if (target) {
        setPortalTarget(target);
        observer.disconnect();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  const handleClick = () => {
    if (!location.pathname.startsWith('/chat')) {
      navigate('/chat');
    }
  };

  if (!portalTarget) return null;

  return createPortal(
    <div onClick={handleClick} className="contents">
      <ChatThreadList />
    </div>,
    portalTarget
  );
}

interface GlobalChatProviderProps {
  children: ReactNode;
}

export function GlobalChatProvider({ children }: GlobalChatProviderProps) {
  const { user } = useOptimizedAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const chats = useNotebookChatStore((s) => s.chats);
  const qaCollections = useNotebookStore((s) => s.qaCollections);
  const fetchQACollections = useNotebookStore((s) => s.fetchQACollections);

  useEffect(() => {
    if (qaCollections.length === 0) {
      fetchQACollections();
    }
  }, [qaCollections.length, fetchQACollections]);

  const getExternalThreads = useCallback(() => {
    const userCols = qaCollections.map((c) => ({ id: c.id, name: c.name }));
    const entries = resolveNotebookChatEntries(chats, userCols);
    return entries.map((e) => ({
      remoteId: `notebook:${e.collectionKey}`,
      title: e.title,
      externalId: e.path,
      updatedAt: new Date(e.timestamp).toISOString(),
    }));
  }, [chats, qaCollections]);

  const handleExternalClick = useCallback(
    (path: string) => {
      navigate(path);
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
    }),
    []
  );

  return (
    <GrueneratorChatProvider
      userId={user?.id}
      userName={user?.display_name || user?.name}
      config={chatConfig}
      getExternalThreads={getExternalThreads}
      onExternalThreadClick={handleExternalClick}
      activePath={location.pathname}
    >
      <TooltipProvider>
        {children}
        {user?.id && <ChatThreadPortal />}
      </TooltipProvider>
    </GrueneratorChatProvider>
  );
}
