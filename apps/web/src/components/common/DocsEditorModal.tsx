import { DocsProvider, useCollaboration } from '@gruenerator/docs';
import { MantineProvider } from '@mantine/core';
import { marked } from 'marked';
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { IoCloseOutline } from 'react-icons/io5';

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

const EditorWithCollaboration = ({
  documentId,
  initialContent,
}: {
  documentId: string;
  initialContent?: string;
}) => {
  const { user } = useLazyAuth();
  const [syncTimedOut, setSyncTimedOut] = useState(false);

  const collabUser = useMemo(
    () => (user ? { id: user.id, display_name: user.display_name, email: user.email } : null),
    [user]
  );

  const { ydoc, provider, isSynced } = useCollaboration({
    documentId,
    user: collabUser,
  });

  // Timeout fallback — don't wait forever for Hocuspocus sync
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

  const isReady = provider && (isSynced || syncTimedOut);

  // Gate rendering: only mount BlockNoteEditor once collaboration is ready.
  // This avoids the race where the editor is created without collaboration,
  // then re-created when the provider arrives — losing initialContent.
  if (!isReady) {
    return <div className="docs-modal-loading">Verbinde mit Server...</div>;
  }

  return (
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
        <header className="docs-modal-header">
          <h2 className="docs-modal-title">{title || 'Dokument bearbeiten'}</h2>
          <button className="docs-modal-close" onClick={handleClose} aria-label="Schließen">
            <IoCloseOutline size={20} />
          </button>
        </header>
        <div className="docs-modal-body">
          <DocsProvider adapter={webAppDocsAdapter}>
            <MantineProvider>
              <EditorWithCollaboration documentId={documentId} initialContent={initialContent} />
            </MantineProvider>
          </DocsProvider>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default DocsEditorModal;
