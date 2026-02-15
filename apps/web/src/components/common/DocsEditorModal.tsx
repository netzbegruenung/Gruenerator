import { DocsProvider, useCollaboration } from '@gruenerator/docs';
import { EditorTopBar } from '@gruenerator/shared/tiptap-editor/components';
import { MantineProvider } from '@mantine/core';
import { marked } from 'marked';
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

import { webAppDocsAdapter } from '../../features/docs/docsAdapter';
import { useLazyAuth } from '../../hooks/useAuth';

import '@mantine/core/styles.css';
import '../../assets/styles/components/docs-editor-modal.css';

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

  const { ydoc, provider, isConnected, isSynced } = useCollaboration({
    documentId,
    user: collabUser,
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
      <div className="docs-modal-body">
        {!isReady ? (
          <div className="docs-modal-loading">Verbinde mit Server...</div>
        ) : (
          <Suspense fallback={<div className="docs-modal-loading">Lädt Editor...</div>}>
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
    <div className={`docs-modal-overlay ${isClosing ? 'docs-modal-closing' : ''}`}>
      <div className="docs-modal">
        <DocsProvider adapter={webAppDocsAdapter}>
          <MantineProvider>
            <DocsEditorContent
              documentId={documentId}
              initialContent={initialContent}
              title={title}
              onClose={handleClose}
            />
          </MantineProvider>
        </DocsProvider>
      </div>
    </div>,
    document.body
  );
};

export default DocsEditorModal;
