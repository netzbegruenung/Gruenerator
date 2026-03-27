import { useCollaboration } from '@gruenerator/collab';
import { DocsProvider } from '@gruenerator/docs';
import { EditorTopBar } from '@gruenerator/shared/components/EditorTopBar';
import { marked } from 'marked';
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

import { webAppDocsAdapter } from '../../features/docs/docsAdapter';
import { useLazyAuth } from '../../hooks/useAuth';
import { useCollaborationConfig } from '../../hooks/useCollaborationConfig';

import { cn } from '@/utils/cn';

const BlockNoteEditor = lazy(() =>
  import('@gruenerator/docs').then((m) => ({ default: m.BlockNoteEditor }))
);

interface DocsEditorModalProps {
  documentId: string;
  initialContent?: string;
  title?: string;
  onClose: () => void;
}

const SYNC_TIMEOUT_MS = 8000;

const DocsEditorContent = ({
  documentId,
  initialContent,
  title,
  onClose,
}: {
  documentId: string;
  initialContent?: string;
  title?: string;
  onClose: () => void;
}) => {
  const { user } = useLazyAuth();
  const [syncTimedOut, setSyncTimedOut] = useState(false);

  const collabUser = useMemo(
    () => (user ? { id: user.id, display_name: user.display_name, email: user.email } : null),
    [user]
  );

  const collabConfig = useCollaborationConfig();
  const { ydoc, provider, isConnected, isSynced } = useCollaboration({
    documentId,
    user: collabUser,
    config: collabConfig,
  });

  useEffect(() => {
    if (!provider || isSynced || syncTimedOut) return;
    const timer = setTimeout(() => setSyncTimedOut(true), SYNC_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [provider, isSynced, syncTimedOut]);

  const htmlContent = useMemo(() => {
    if (!initialContent) return undefined;
    if (initialContent.trim().startsWith('<')) return initialContent;
    return marked.parse(initialContent, { async: false }) as string;
  }, [initialContent]);

  const connectionStatus: 'connected' | 'syncing' | 'disconnected' = !isConnected
    ? 'disconnected'
    : isSynced
      ? 'connected'
      : 'syncing';

  const isReady = provider && (isSynced || syncTimedOut);

  return (
    <>
      <EditorTopBar
        title={title || 'Dokument bearbeiten'}
        connectionStatus={connectionStatus}
        onBack={onClose}
      />
      <div className="flex-1 overflow-y-auto px-6 pt-4 pb-8 bg-grey-100 dark:bg-grey-900 max-[768px]:px-3 max-[768px]:pt-2 max-[768px]:pb-6">
        {!isReady ? (
          <div className="flex items-center justify-center h-[200px] text-grey-500 text-sm">
            Verbinde mit Server...
          </div>
        ) : (
          <Suspense
            fallback={
              <div className="flex items-center justify-center h-[200px] text-grey-500 text-sm">
                Lädt Editor...
              </div>
            }
          >
            <BlockNoteEditor
              documentId={documentId}
              initialContent={htmlContent}
              ydoc={ydoc}
              provider={provider}
              isSynced={isSynced || syncTimedOut}
              showComments={false}
            />
          </Suspense>
        )}
      </div>
    </>
  );
};

const DocsEditorModal = ({ documentId, initialContent, title, onClose }: DocsEditorModalProps) => {
  const [isClosing, setIsClosing] = useState(false);

  const handleClose = useCallback(() => {
    setIsClosing(true);
    setTimeout(onClose, 200);
  }, [onClose]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [handleClose]);

  return createPortal(
    <div
      className={cn(
        'fixed inset-0 z-[9999] bg-black/50 backdrop-blur-sm flex animate-in fade-in duration-200',
        isClosing && 'animate-out fade-out duration-200'
      )}
    >
      <div
        className={cn(
          'flex flex-col w-full h-full bg-background animate-in slide-in-from-bottom-5 duration-250',
          isClosing && 'animate-out slide-out-to-bottom-5 duration-200'
        )}
      >
        <DocsProvider adapter={webAppDocsAdapter}>
          <DocsEditorContent
            documentId={documentId}
            initialContent={initialContent}
            title={title}
            onClose={handleClose}
          />
        </DocsProvider>
      </div>
    </div>,
    document.body
  );
};

export default DocsEditorModal;
