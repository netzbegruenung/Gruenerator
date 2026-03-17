import { GrueneratorChatProvider, ChatThreadList, TooltipProvider } from '@gruenerator/chat';
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';

import { useNotebookChatStore } from '../features/notebook/stores/notebookChatStore';
import useNotebookStore from '../features/notebook/stores/notebookStore';
import { resolveNotebookChatEntries } from '../features/notebook/utils/notebookChatResolver';
import { useOptimizedAuth } from '../hooks/useAuth';
import { buildLoginUrl, isPublicPage } from '../utils/authRedirect';

const DocsEditorModal = lazy(() => import('@/components/common/DocsEditorModal'));

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

  const [editorModal, setEditorModal] = useState<{
    documentId: string;
    initialContent: string;
    title: string;
  } | null>(null);
  const editorModalSetterRef = useRef(setEditorModal);

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
      onEditInDocs: async (content: string, title?: string, existingDocId?: string) => {
        if (existingDocId) {
          editorModalSetterRef.current({
            documentId: existingDocId,
            initialContent: content,
            title: title || 'Dokument',
          });
          return existingDocId;
        }

        const htmlContent = content
          .split('\n\n')
          .map((block) => `<p>${block.replace(/\n/g, '<br />')}</p>`)
          .join('');

        const response = await fetch('/api/docs/from-export', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ content: htmlContent, title, documentType: 'chat-response' }),
        });
        if (!response.ok) throw new Error('Document creation failed');
        const data = await response.json();
        if (data.documentId) {
          editorModalSetterRef.current({
            documentId: data.documentId,
            initialContent: content,
            title: title || data.title || 'Dokument',
          });
          return data.documentId;
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
      {editorModal && (
        <Suspense fallback={null}>
          <DocsEditorModal
            documentId={editorModal.documentId}
            initialContent={editorModal.initialContent}
            title={editorModal.title}
            onClose={() => setEditorModal(null)}
          />
        </Suspense>
      )}
    </GrueneratorChatProvider>
  );
}
