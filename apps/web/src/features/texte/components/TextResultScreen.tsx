import {
  DocsProvider,
  useCollaboration,
  useDocumentStore,
  createDocsApiClient,
} from '@gruenerator/docs';
import { EditorTopBar } from '@gruenerator/shared/components/EditorTopBar';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@gruenerator/ui';
import { MantineProvider } from '@mantine/core';
import { XIcon } from 'lucide-react';
import { marked } from 'marked';
import { motion, AnimatePresence } from 'motion/react';
import React, {
  lazy,
  memo,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { FaFileWord, FaFilePdf } from 'react-icons/fa6';
import { FiDownload, FiExternalLink } from 'react-icons/fi';
import { HiOutlinePencil } from 'react-icons/hi';
import {
  IoDownloadOutline,
  IoCopyOutline,
  IoCheckmarkOutline,
  IoArrowUndoOutline,
  IoArrowRedoOutline,
  IoShareSocialSharp,
  IoChatbubbleOutline,
} from 'react-icons/io5';
import { useNavigate } from 'react-router-dom';

import AutoSaveIndicator from '../../../components/common/AutoSaveIndicator';
import ContentRenderer from '../../../components/common/ContentDisplay/ContentRenderer';
import EnrichmentSourcesDisplay from '../../../components/common/EnrichmentSourcesDisplay';
import { copyFormattedContent } from '../../../components/utils/commonFunctions';
import { extractFormattedText as extractFormattedTextJs } from '../../../components/utils/contentExtractor';
import { useLazyAuth } from '../../../hooks/useAuth';
import { useDeferredTitle, awaitDeferredTitle } from '../../../hooks/useDeferredTitle';
import { useExportStore } from '../../../stores/core/exportStore';
import useGeneratedTextStore from '../../../stores/core/generatedTextStore';
import { canShare, shareContent } from '../../../utils/shareUtils';
import { webAppDocsAdapter } from '../../docs/docsAdapter';

import type { ContentMetadata } from '@/types/baseform';
import type { BlockNoteEditor as BlockNoteEditorCore } from '@blocknote/core';

import { cn } from '@/utils/cn';

import '@mantine/core/styles.css';

const BlockNoteEditor = lazy(() =>
  import('@gruenerator/docs').then((m) => ({ default: m.BlockNoteEditor }))
);

const extractFormattedText = extractFormattedTextJs as unknown as (
  content: unknown
) => Promise<string>;

interface ExtendedContent {
  content?: string;
  text?: string;
  social?: { content?: string };
  sharepic?: unknown;
  metadata?: Record<string, unknown>;
}

interface EditorState {
  documentId: string;
  initialContent: string;
  title: string;
}

interface TextResultScreenProps {
  isOpen: boolean;
  onClose: () => void;
  componentName: string;
  title?: string;
  useMarkdown?: boolean | null;
  onRegenerate?: () => void | Promise<void>;
}

const actionBtnClass =
  'flex flex-col items-center gap-1 px-3 py-2 rounded-lg transition-colors bg-transparent border-none cursor-pointer text-grey-500 dark:text-grey-400 hover:bg-grey-100 dark:hover:bg-grey-800 hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed';

const closeBtnClass =
  'flex items-center justify-center size-9 rounded-md transition-colors bg-transparent border-none cursor-pointer text-grey-500 hover:text-foreground hover:bg-grey-100 dark:hover:bg-grey-800';

const SYNC_TIMEOUT_MS = 8000;

const InlineEditor = memo(
  ({ editorState, onBack }: { editorState: EditorState; onBack: () => void }) => {
    const { user } = useLazyAuth();
    const [syncTimedOut, setSyncTimedOut] = useState(false);
    const [editor, setEditor] = useState<BlockNoteEditorCore | null>(null);
    const [showExportMenu, setShowExportMenu] = useState(false);
    const exportMenuRef = useRef<HTMLDivElement>(null);
    const { updateDocument } = useDocumentStore();
    const docsApi = useMemo(() => createDocsApiClient(webAppDocsAdapter), []);

    const collabUser = useMemo(
      () => (user ? { id: user.id, display_name: user.display_name, email: user.email } : null),
      [user]
    );

    const { ydoc, provider, isConnected, isSynced } = useCollaboration({
      documentId: editorState.documentId,
      user: collabUser,
    });

    useEffect(() => {
      if (!provider || isSynced || syncTimedOut) return;
      const timer = setTimeout(() => setSyncTimedOut(true), SYNC_TIMEOUT_MS);
      return () => clearTimeout(timer);
    }, [provider, isSynced, syncTimedOut]);

    useEffect(() => {
      if (!showExportMenu) return;
      const handleClickOutside = (e: MouseEvent) => {
        if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
          setShowExportMenu(false);
        }
      };
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showExportMenu]);

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
        void updateDocument(docsApi, editorState.documentId, { title: newTitle });
      },
      [updateDocument, docsApi, editorState.documentId]
    );

    const handleEditorReady = useCallback((editorInstance: BlockNoteEditorCore) => {
      setEditor(editorInstance);
    }, []);

    const handleExportDOCX = useCallback(async () => {
      if (!editor) return;
      try {
        const { DOCXExporter, docxDefaultSchemaMappings } =
          await import('@blocknote/xl-docx-exporter');
        const exporter = new DOCXExporter(editor.schema, docxDefaultSchemaMappings);
        const blob = await exporter.toBlob(editor.document);
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${editorState.title || 'Dokument'}.docx`;
        link.click();
        window.URL.revokeObjectURL(url);
        setShowExportMenu(false);
      } catch (error) {
        console.error('[InlineEditor] DOCX export failed:', error);
      }
    }, [editor, editorState.title]);

    const docsUrl = `https://docs.gruenerator.eu/document/${editorState.documentId}`;

    const isReady = provider && (isSynced || syncTimedOut);

    const rightActions = (
      <>
        <div ref={exportMenuRef} className="dropdown-container">
          <button
            className="glass-btn"
            onClick={() => setShowExportMenu(!showExportMenu)}
            aria-label="Exportieren"
          >
            <FiDownload />
          </button>
          {showExportMenu && (
            <div className="dropdown-menu">
              <button className="dropdown-item" onClick={() => void handleExportDOCX()}>
                <FiDownload />
                Als Word (.docx)
              </button>
            </div>
          )}
        </div>
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
  }
);
InlineEditor.displayName = 'InlineEditor';

const TextResultScreen: React.FC<TextResultScreenProps> = memo(
  ({
    isOpen,
    onClose,
    componentName,
    title = 'Generierter Text',
    useMarkdown = true,
    onRegenerate: _onRegenerate,
  }) => {
    const scrollRef = useRef<HTMLElement>(null);
    const navigate = useNavigate();
    const [copyDone, setCopyDone] = useState(false);
    const [editorState, setEditorState] = useState<EditorState | null>(null);
    const [showEditor, setShowEditor] = useState(false);
    const [editLoading, setEditLoading] = useState(false);

    const storeContent = useGeneratedTextStore(
      (state) => state.generatedTexts[componentName] || ''
    );
    const metadata = useGeneratedTextStore((state) =>
      state.getGeneratedTextMetadata(componentName)
    ) as ContentMetadata | null;
    const isStreaming = useGeneratedTextStore((state) => state.isStreaming);
    const undo = useGeneratedTextStore((state) => state.undo);
    const redo = useGeneratedTextStore((state) => state.redo);
    const canUndo = useGeneratedTextStore((state) => {
      const h = state.history[componentName];
      const idx = state.historyIndex[componentName] ?? 0;
      return !!(h && h.length > 1 && idx > 0);
    });
    const canRedo = useGeneratedTextStore((state) => {
      const h = state.history[componentName];
      const idx = state.historyIndex[componentName] ?? 0;
      return !!(h && h.length > 1 && idx < h.length - 1);
    });

    const { generateDOCX, generatePDF, isGenerating } = useExportStore();
    const createDocument = useDocumentStore((state) => state.createDocument);
    const docsApiClient = useMemo(() => createDocsApiClient(webAppDocsAdapter), []);

    useDeferredTitle(componentName, getExportableString(storeContent), metadata, isStreaming);

    const currentExportable = getExportableString(storeContent);
    const showNativeShare = useMemo(() => canShare(), []);
    const isEditing = showEditor && editorState !== null;

    const getFreshTitle = useCallback(async (): Promise<string> => {
      await awaitDeferredTitle(componentName);
      const meta = useGeneratedTextStore
        .getState()
        .getGeneratedTextMetadata(componentName) as ContentMetadata | null;
      return meta?.title || title || 'Generierter Text';
    }, [componentName, title]);

    const handleCopy = useCallback(async () => {
      await copyFormattedContent(
        currentExportable,
        () => {
          setCopyDone(true);
          setTimeout(() => setCopyDone(false), 2000);
        },
        () => {}
      );
    }, [currentExportable]);

    const handleShare = useCallback(async () => {
      const freshTitle = await getFreshTitle();
      await shareContent({ title: freshTitle, text: currentExportable });
    }, [currentExportable, getFreshTitle]);

    const handleDOCX = useCallback(async () => {
      const freshTitle = await getFreshTitle();
      const formatted = await extractFormattedText(currentExportable);
      await generateDOCX(formatted, freshTitle);
    }, [currentExportable, getFreshTitle, generateDOCX]);

    const handlePDF = useCallback(async () => {
      const freshTitle = await getFreshTitle();
      const formatted = await extractFormattedText(currentExportable);
      await generatePDF(formatted, freshTitle);
    }, [currentExportable, getFreshTitle, generatePDF]);

    const handleEdit = useCallback(async () => {
      if (editorState) {
        setShowEditor(true);
        return;
      }
      if (!currentExportable || editLoading) return;
      setEditLoading(true);
      try {
        const docTitle = await getFreshTitle();
        const doc = await createDocument(docsApiClient, docTitle);
        setEditorState({
          documentId: doc.id,
          initialContent: currentExportable,
          title: docTitle,
        });
        setShowEditor(true);
      } catch (error) {
        console.error('[TextResultScreen] Failed to create document:', error);
      } finally {
        setEditLoading(false);
      }
    }, [editorState, currentExportable, editLoading, getFreshTitle, createDocument, docsApiClient]);

    const handleExitEdit = useCallback(() => {
      setShowEditor(false);
    }, []);

    const handleDiscussInChat = useCallback(async () => {
      if (!currentExportable?.trim()) return;
      const freshTitle = await getFreshTitle();
      const titleLine = freshTitle ? `**${freshTitle}**\n\n` : '';
      const reviewMessage = `Bitte überprüfe den folgenden Text und gib mir konstruktives Feedback:\n\n${titleLine}---\n${currentExportable}\n---`;
      const { useAgentStore } = await import('@gruenerator/chat');
      useAgentStore.getState().setPendingMessage(reviewMessage);
      navigate('/chat');
    }, [currentExportable, getFreshTitle, navigate]);

    const handleUndo = useCallback(() => undo(componentName), [undo, componentName]);
    const handleRedo = useCallback(() => redo(componentName), [redo, componentName]);

    useEffect(() => {
      if (!isOpen) return;
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          if (isEditing) {
            setShowEditor(false);
          } else {
            onClose();
          }
        }
        if (!isEditing) {
          if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'z') {
            e.preventDefault();
            if (canUndo) undo(componentName);
          }
          if (
            ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'Z') ||
            ((e.ctrlKey || e.metaKey) && e.key === 'y')
          ) {
            e.preventDefault();
            if (canRedo) redo(componentName);
          }
        }
      };
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose, isEditing, canUndo, canRedo, undo, redo, componentName]);

    useEffect(() => {
      if (isOpen && isStreaming && scrollRef.current) {
        scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
      }
    }, [isOpen, isStreaming, storeContent]);

    useEffect(() => {
      if (isOpen) {
        document.body.style.overflow = 'hidden';
        return () => {
          document.body.style.overflow = '';
        };
      }
    }, [isOpen]);

    return (
      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="fixed inset-0 z-50 bg-background-pure flex flex-col"
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
          >
            {isEditing ? (
              <DocsProvider adapter={webAppDocsAdapter}>
                <MantineProvider>
                  <InlineEditor editorState={editorState} onBack={handleExitEdit} />
                </MantineProvider>
              </DocsProvider>
            ) : (
              <>
                <header className="shrink-0 border-b border-grey-200 dark:border-grey-700 bg-background-pure relative">
                  <button
                    type="button"
                    onClick={onClose}
                    className={cn(closeBtnClass, 'absolute top-3 right-4')}
                    aria-label="Schließen"
                  >
                    <XIcon className="size-5" />
                  </button>

                  <div className="flex items-center justify-center gap-1 px-lg py-sm">
                    <button type="button" onClick={handleCopy} className={actionBtnClass}>
                      {copyDone ? <IoCheckmarkOutline size={22} /> : <IoCopyOutline size={22} />}
                      <span className="text-[11px] leading-none">Kopieren</span>
                    </button>

                    {showNativeShare && (
                      <button type="button" onClick={handleShare} className={actionBtnClass}>
                        <IoShareSocialSharp size={22} />
                        <span className="text-[11px] leading-none">Teilen</span>
                      </button>
                    )}

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button type="button" disabled={isGenerating} className={actionBtnClass}>
                          <IoDownloadOutline size={22} />
                          <span className="text-[11px] leading-none">Download</span>
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="center" sideOffset={8}>
                        <DropdownMenuItem onSelect={handleDOCX} disabled={isGenerating}>
                          <FaFileWord className="size-4" />
                          Word (.docx)
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={handlePDF} disabled={isGenerating}>
                          <FaFilePdf className="size-4" />
                          PDF (.pdf)
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>

                    <button
                      type="button"
                      onClick={handleEdit}
                      disabled={editLoading || isStreaming}
                      className={actionBtnClass}
                    >
                      <HiOutlinePencil size={22} />
                      <span className="text-[11px] leading-none">
                        {editLoading ? 'Lädt...' : 'Bearbeiten'}
                      </span>
                    </button>

                    <button type="button" onClick={handleDiscussInChat} className={actionBtnClass}>
                      <IoChatbubbleOutline size={22} />
                      <span className="text-[11px] leading-none">Chat</span>
                    </button>

                    {canUndo && (
                      <button type="button" onClick={handleUndo} className={actionBtnClass}>
                        <IoArrowUndoOutline size={22} />
                        <span className="text-[11px] leading-none">Zurück</span>
                      </button>
                    )}

                    {canRedo && (
                      <button type="button" onClick={handleRedo} className={actionBtnClass}>
                        <IoArrowRedoOutline size={22} />
                        <span className="text-[11px] leading-none">Vor</span>
                      </button>
                    )}

                    <AutoSaveIndicator componentName={componentName} />
                  </div>
                </header>

                <main ref={scrollRef} className="flex-1 overflow-y-auto">
                  <article
                    className={cn(
                      'max-w-[680px] mx-auto w-full px-lg py-2xl',
                      'text-lg leading-relaxed text-foreground',
                      '[&_.markdown-content]:text-lg [&_.markdown-content]:leading-relaxed',
                      '[&_h1]:text-3xl [&_h1]:font-bold [&_h1]:mb-md [&_h1]:mt-xl',
                      '[&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:mb-md [&_h2]:mt-lg',
                      '[&_h3]:text-xl [&_h3]:font-semibold [&_h3]:mb-sm [&_h3]:mt-md',
                      '[&_p]:mb-md [&_p]:leading-relaxed',
                      '[&_ul]:mb-md [&_ol]:mb-md',
                      '[&_li]:mb-xs [&_li]:leading-relaxed',
                      '[&_blockquote]:border-l-4 [&_blockquote]:border-primary-300 [&_blockquote]:pl-md [&_blockquote]:italic [&_blockquote]:text-grey-600 [&_blockquote]:dark:text-grey-400',
                      isStreaming && 'animate-pulse-subtle'
                    )}
                  >
                    <ContentRenderer
                      value={storeContent}
                      generatedContent={storeContent}
                      useMarkdown={useMarkdown}
                      componentName={componentName}
                    />
                  </article>

                  {metadata?.enrichmentSummary && (
                    <div className="max-w-[680px] mx-auto px-lg pb-2xl">
                      <EnrichmentSourcesDisplay enrichmentSummary={metadata.enrichmentSummary} />
                    </div>
                  )}
                </main>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    );
  }
);

function getExportableString(content: unknown): string {
  if (typeof content === 'string') return content;
  if (typeof content === 'object' && content !== null) {
    const ext = content as ExtendedContent;
    return ext.social?.content || ext.content || '';
  }
  return '';
}

TextResultScreen.displayName = 'TextResultScreen';

export default TextResultScreen;
