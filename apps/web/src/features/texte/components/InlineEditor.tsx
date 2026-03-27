import { useCollaboration } from '@gruenerator/collab';
import { DocsProvider, useDocumentStore, type createDocsApiClient } from '@gruenerator/docs';
import { EditorTopBar } from '@gruenerator/shared/components/EditorTopBar';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@gruenerator/ui';
import { marked } from 'marked';
import React, { lazy, memo, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { FaFileWord } from 'react-icons/fa6';
import { FiDownload, FiExternalLink } from 'react-icons/fi';

import { useLazyAuth } from '../../../hooks/useAuth';
import { useCollaborationConfig } from '../../../hooks/useCollaborationConfig';
import { webAppDocsAdapter } from '../../docs/docsAdapter';

import type { BlockNoteEditor as BlockNoteEditorCore } from '@blocknote/core';

const BlockNoteEditor = lazy(() =>
  import('@gruenerator/docs').then((m) => ({ default: m.BlockNoteEditor }))
);

const SYNC_TIMEOUT_MS = 8000;

interface EditorState {
  documentId: string;
  initialContent: string;
  title: string;
}

interface InlineEditorProps {
  editorState: EditorState;
  onBack: () => void;
  docsApiClient: ReturnType<typeof createDocsApiClient>;
}

const InlineEditorContent = memo(({ editorState, onBack, docsApiClient }: InlineEditorProps) => {
  const { user } = useLazyAuth();
  const [syncTimedOut, setSyncTimedOut] = useState(false);
  const [editor, setEditor] = useState<BlockNoteEditorCore | null>(null);
  const { updateDocument } = useDocumentStore();

  const collabUser = useMemo(
    () => (user ? { id: user.id, display_name: user.display_name, email: user.email } : null),
    [user]
  );

  const collabConfig = useCollaborationConfig();
  const { ydoc, provider, isConnected, isSynced } = useCollaboration({
    documentId: editorState.documentId,
    user: collabUser,
    config: collabConfig,
  });

  useEffect(() => {
    if (!provider || isSynced || syncTimedOut) return;
    const timer = setTimeout(() => setSyncTimedOut(true), SYNC_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [provider, isSynced, syncTimedOut]);

  const htmlContent = useMemo(() => {
    if (!editorState.initialContent) return undefined;
    if (editorState.initialContent.trim().startsWith('<')) return editorState.initialContent;
    return marked.parse(editorState.initialContent, { async: false }) as string;
  }, [editorState.initialContent]);

  const connectionStatus: 'connected' | 'syncing' | 'disconnected' = !isConnected
    ? 'disconnected'
    : isSynced
      ? 'connected'
      : 'syncing';

  const handleTitleChange = useCallback(
    (newTitle: string) => {
      void updateDocument(docsApiClient, editorState.documentId, { title: newTitle });
    },
    [updateDocument, docsApiClient, editorState.documentId]
  );

  const handleEditorReady = useCallback((editorInstance: BlockNoteEditorCore) => {
    setEditor(editorInstance);
  }, []);

  const handleExportDOCX = useCallback(async () => {
    if (!editor) return;
    const { DOCXExporter, docxDefaultSchemaMappings } = await import('@blocknote/xl-docx-exporter');
    const exporter = new DOCXExporter(editor.schema, docxDefaultSchemaMappings);
    const blob = await exporter.toBlob(editor.document);
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${editorState.title || 'Dokument'}.docx`;
    link.click();
    window.URL.revokeObjectURL(url);
  }, [editor, editorState.title]);

  const docsUrl = `https://docs.gruenerator.eu/document/${editorState.documentId}`;
  const isReady = provider && (isSynced || syncTimedOut);

  const rightActions = (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="glass-btn" aria-label="Exportieren">
            <FiDownload />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" sideOffset={8}>
          <DropdownMenuItem onSelect={() => void handleExportDOCX()}>
            <FaFileWord className="size-4" />
            Als Word (.docx)
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <span className="glass-divider" />
      <a
        href={docsUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="glass-btn"
        aria-label="In Docs öffnen"
      >
        <FiExternalLink />
      </a>
    </>
  );

  return (
    <div className="flex flex-col h-full">
      <EditorTopBar
        title={editorState.title}
        connectionStatus={connectionStatus}
        onBack={onBack}
        onTitleChange={handleTitleChange}
        editable
        rightActions={rightActions}
      />
      <div className="flex-1 overflow-y-auto px-md py-lg bg-grey-50 dark:bg-grey-900">
        <div className="max-w-[780px] mx-auto w-full">
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
                documentId={editorState.documentId}
                initialContent={htmlContent}
                ydoc={ydoc}
                provider={provider}
                isSynced={isSynced || syncTimedOut}
                showComments={false}
                onEditorReady={handleEditorReady}
              />
            </Suspense>
          )}
        </div>
      </div>
    </div>
  );
});
InlineEditorContent.displayName = 'InlineEditorContent';

const InlineEditor = memo((props: InlineEditorProps) => (
  <DocsProvider adapter={webAppDocsAdapter}>
    <InlineEditorContent {...props} />
  </DocsProvider>
));
InlineEditor.displayName = 'InlineEditor';

export default InlineEditor;
