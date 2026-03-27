import { useDocumentStore, createDocsApiClient } from '@gruenerator/docs';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@gruenerator/ui';
import { XIcon } from 'lucide-react';
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
import { useDeferredTitle, awaitDeferredTitle } from '../../../hooks/useDeferredTitle';
import { useExportStore } from '../../../stores/core/exportStore';
import useGeneratedTextStore from '../../../stores/core/generatedTextStore';
import { canShare, shareContent } from '../../../utils/shareUtils';
import { webAppDocsAdapter } from '../../docs/docsAdapter';

import type { ContentMetadata } from '@/types/baseform';

import { cn } from '@/utils/cn';

const LazyInlineEditor = lazy(() => import('./InlineEditor'));

const extractFormattedText = extractFormattedTextJs as unknown as (
  content: unknown
) => Promise<string>;

interface ExtendedContent {
  content?: string;
  text?: string;
  social?: { content?: string };
  sharepic?: unknown;
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
}

const actionBtnClass =
  'flex flex-col items-center gap-1 px-3 py-2 rounded-lg transition-colors bg-transparent border-none cursor-pointer text-grey-500 dark:text-grey-400 hover:bg-grey-100 dark:hover:bg-grey-800 hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed';

const closeBtnClass =
  'flex items-center justify-center size-9 rounded-md transition-colors bg-transparent border-none cursor-pointer text-grey-500 hover:text-foreground hover:bg-grey-100 dark:hover:bg-grey-800';

const TextResultScreen: React.FC<TextResultScreenProps> = memo(
  ({ isOpen, onClose, componentName, title = 'Generierter Text', useMarkdown = true }) => {
    const scrollRef = useRef<HTMLElement>(null);
    const navigate = useNavigate();
    const [copyDone, setCopyDone] = useState(false);
    const [editorState, setEditorState] = useState<EditorState | null>(null);
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
    const isEditing = editorState !== null && !editLoading;

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
      if (editorState) return;
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
      } catch (error) {
        console.error('[TextResultScreen] Failed to create document:', error);
      } finally {
        setEditLoading(false);
      }
    }, [editorState, currentExportable, editLoading, getFreshTitle, createDocument, docsApiClient]);

    const handleExitEdit = useCallback(() => {
      setEditorState(null);
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
            setEditorState(null);
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
              <Suspense
                fallback={
                  <div className="flex items-center justify-center h-full text-grey-500 text-sm">
                    Lädt Editor...
                  </div>
                }
              >
                <LazyInlineEditor
                  editorState={editorState}
                  onBack={handleExitEdit}
                  docsApiClient={docsApiClient}
                />
              </Suspense>
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
