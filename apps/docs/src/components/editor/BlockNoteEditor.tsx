import { useEffect, useMemo, useRef, useState, useCallback, memo } from 'react';
import {
  type BlockNoteEditor as BlockNoteEditorCore,
  BlockNoteSchema,
  defaultBlockSpecs,
  defaultInlineContentSpecs,
  defaultStyleSpecs,
} from '@blocknote/core';
import { CommentsExtension } from '@blocknote/core/comments';
import { filterSuggestionItems } from '@blocknote/core/extensions';
import { de } from '@blocknote/core/locales';
import { BlockNoteView } from '@blocknote/mantine';
import {
  useCreateBlockNote,
  FormattingToolbar,
  FormattingToolbarController,
  SuggestionMenuController,
  getDefaultReactSlashMenuItems,
  getFormattingToolbarItems,
  FloatingComposerController,
  ThreadsSidebar,
} from '@blocknote/react';
import {
  AIExtension,
  AIMenuController,
  AIToolbarButton,
  getAISlashMenuItems,
} from '@blocknote/xl-ai';
import { de as aiDe } from '@blocknote/xl-ai/locales';
import '@blocknote/core/fonts/inter.css';
import '@blocknote/mantine/style.css';
import '@blocknote/xl-ai/style.css';
import { type HocuspocusProvider } from '@hocuspocus/provider';
import { DefaultChatTransport } from 'ai';

import type * as Y from 'yjs';

import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { useBlockNoteComments } from '@/hooks/useBlockNoteComments';
import { useResolveUsers } from '@/hooks/useResolveUsers';
import { isEditorEmpty } from '@/lib/blockNoteUtils';
import { defaultDocumentContent } from '@/lib/defaultContent';
import { getTemplateContent } from '@/lib/templates';
import { useEditorStore } from '@/stores/editorStore';
import './BlockNoteEditor.css';

interface BlockNoteEditorProps {
  documentId: string;
  initialContent?: string;
  documentSubtype?: string;
  editable?: boolean;
  showComments?: boolean;
  showCommentsSidebar?: boolean;
  ydoc?: Y.Doc;
  provider?: HocuspocusProvider | null;
  isSynced?: boolean;
  onEditorReady?: (editor: BlockNoteEditorCore) => void;
}

interface CollaborationUser {
  id: string;
  name: string;
  color: string;
}

const schema = BlockNoteSchema.create({
  blockSpecs: defaultBlockSpecs,
  inlineContentSpecs: defaultInlineContentSpecs,
  styleSpecs: defaultStyleSpecs,
});

const StableFloatingComposer = () => {
  useEffect(() => {
    const isInsideFloatingComposer = (target: HTMLElement) => {
      const thread = target.closest('.bn-thread');
      if (!thread) return false;
      if (thread.closest('.comments-sidebar') || thread.closest('.bn-threads-sidebar'))
        return false;
      return true;
    };

    // --- Capture-phase pointerdown: must fire BEFORE Floating UI's useDismiss ---
    // useDismiss registers a bubble-phase 'pointerdown' on document.
    // stopPropagation() in capture prevents it from ever reaching bubble phase.
    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement;
      const inside = isInsideFloatingComposer(target);
      if (inside) {
        if (target.closest('button')) {
          // stopPropagation blocks useDismiss, but NO preventDefault so click fires normally
          e.stopPropagation();
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        // Manually focus the clicked element since we prevented default
        const focusTarget =
          target.closest('[contenteditable="true"]') || target.closest('input, textarea');
        if (focusTarget instanceof HTMLElement) {
          focusTarget.focus();
        }
      }
    };

    // Capture-phase mousedown as backup
    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!isInsideFloatingComposer(target)) return;
      if (target.closest('button')) {
        e.stopPropagation();
        return;
      }
      e.preventDefault();
      e.stopPropagation();
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('mousedown', handleMouseDown, true);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('mousedown', handleMouseDown, true);
    };
  }, []);

  return <FloatingComposerController />;
};

const BlockNoteEditorInner = ({
  documentId,
  initialContent = '',
  documentSubtype = 'blank',
  editable = true,
  showComments = true,
  showCommentsSidebar = false,
  ydoc,
  provider,
  isSynced = false,
  onEditorReady,
}: BlockNoteEditorProps) => {
  const { setEditor: setEditorInStore, removeEditor } = useEditorStore();
  const hasInitialized = useRef(false);
  const [isReady, setIsReady] = useState(false);
  const [syncTimedOut, setSyncTimedOut] = useState(false);

  const collaborationUser = useMemo(() => {
    if (!provider?.awareness) return null;

    const localState = provider.awareness.getLocalState();
    return (localState?.user as CollaborationUser) || null;
  }, [provider?.awareness]);

  const fragment = useMemo(() => {
    if (!ydoc) return undefined;
    return ydoc.getXmlFragment('document-store');
  }, [ydoc]);

  const collaborationOptions = useMemo(() => {
    if (!provider || !fragment || !collaborationUser) return undefined;

    const awareness = provider.awareness;
    if (!awareness) return undefined;

    return {
      provider: provider as any,
      fragment,
      user: {
        name: collaborationUser.name,
        color: collaborationUser.color,
      },
      showCursorLabels: 'activity' as const,
    };
  }, [provider, fragment, collaborationUser]);

  const resolveUsers = useResolveUsers();

  const { threadStore } = useBlockNoteComments({
    ydoc: ydoc || null,
    user: collaborationUser,
    canEdit: editable,
  });

  const extensions = useMemo((): any[] => {
    const exts: any[] = [
      AIExtension({
        transport: new DefaultChatTransport({
          api: '/api/docs/ai',
        }),
      }),
    ];

    if (showComments && threadStore) {
      exts.push(
        CommentsExtension({
          threadStore,
          resolveUsers: resolveUsers as any,
        })
      );
    }

    return exts;
  }, [showComments, threadStore, resolveUsers]);

  const editor = useCreateBlockNote(
    {
      schema,
      dictionary: {
        ...de,
        ai: aiDe,
      } as any,
      extensions,
      collaboration: collaborationOptions,
      domAttributes: {
        editor: {
          class: 'blocknote-editor-content',
        },
      },
    },
    [collaborationOptions]
  );

  useEffect(() => {
    if (!editor) return;

    editor.isEditable = editable;
  }, [editor, editable]);

  useEffect(() => {
    if (!editor) return;
    const tiptap = (editor as any)._tiptapEditor;
    if (!tiptap) return;

    const onSelectionUpdate = () => {};
    tiptap.on('selectionUpdate', onSelectionUpdate);

    // Track focus/blur on editor DOM
    const editorDOM = tiptap.view?.dom as HTMLElement | undefined;
    const onFocusOut = (e: FocusEvent) => {};
    const onFocusIn = (e: FocusEvent) => {};
    editorDOM?.addEventListener('focusout', onFocusOut);
    editorDOM?.addEventListener('focusin', onFocusIn);

    return () => {
      tiptap.off('selectionUpdate', onSelectionUpdate);
      editorDOM?.removeEventListener('focusout', onFocusOut);
      editorDOM?.removeEventListener('focusin', onFocusIn);
    };
  }, [editor]);

  useEffect(() => {
    if (!editor) return;

    hasInitialized.current = false;
    setEditorInStore(documentId, editor);
    setIsReady(true);

    // Defer onEditorReady to avoid setState during render
    const timeoutId = setTimeout(() => {
      if (onEditorReady) {
        onEditorReady(editor);
      }
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      removeEditor(documentId);
    };
  }, [editor, documentId, setEditorInStore, removeEditor, onEditorReady]);

  // Timeout fallback: if collaboration sync takes too long, allow init with local content
  useEffect(() => {
    if (!ydoc || !provider || isSynced || syncTimedOut) return;
    const timer = setTimeout(() => setSyncTimedOut(true), 8000);
    return () => clearTimeout(timer);
  }, [ydoc, provider, isSynced, syncTimedOut]);

  useEffect(() => {
    if (!editor || hasInitialized.current) return;

    // When collaboration is expected, wait for provider + sync (or timeout)
    if (ydoc) {
      if (!provider || (!isSynced && !syncTimedOut)) return;
    }

    // Check if collaboration document already has real content
    if (ydoc && fragment) {
      if (!isEditorEmpty(editor)) {
        hasInitialized.current = true;
        return;
      }
    }

    // Use initialContent if provided, then template content for subtype, then default
    const templateContent = getTemplateContent(documentSubtype);
    const contentToUse = initialContent?.trim()
      ? initialContent
      : templateContent || defaultDocumentContent;

    const initializeWithContent = async () => {
      try {
        const blocks = editor.tryParseHTMLToBlocks(contentToUse);
        if (blocks && blocks.length > 0) {
          editor.replaceBlocks(editor.document, blocks);
        }
        hasInitialized.current = true;
      } catch (error) {
        console.error('[BlockNoteEditor] Failed to parse initial content:', error);
        hasInitialized.current = true;
      }
    };

    initializeWithContent();
  }, [editor, initialContent, documentSubtype, isSynced, syncTimedOut, ydoc, fragment, provider]);

  const handleUploadFile = useCallback(async (file: File) => {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return '/images/tiptap-ui-placeholder-image.jpg';
  }, []);

  if (!editor) {
    return <div className="blocknote-loading">Lädt Editor...</div>;
  }

  return (
    <div className={`blocknote-wrapper ${showCommentsSidebar ? 'with-sidebar' : ''}`}>
      <ErrorBoundary>
        <BlockNoteView editor={editor} theme="light" formattingToolbar={false} slashMenu={false}>
          <AIMenuController />
          <FormattingToolbarController
            formattingToolbar={() => (
              <FormattingToolbar>
                {getFormattingToolbarItems()}
                <AIToolbarButton />
              </FormattingToolbar>
            )}
          />
          <SuggestionMenuController
            triggerCharacter="/"
            getItems={async (query) =>
              filterSuggestionItems(
                [...getDefaultReactSlashMenuItems(editor), ...getAISlashMenuItems(editor)],
                query
              )
            }
          />
          {showComments && threadStore && <StableFloatingComposer />}
          {showCommentsSidebar && showComments && threadStore && (
            <div className="comments-sidebar">
              <div className="comments-sidebar-header">
                <h3>Kommentare</h3>
              </div>
              <ThreadsSidebar filter="all" />
            </div>
          )}
        </BlockNoteView>
      </ErrorBoundary>
    </div>
  );
};

// Memoize to prevent re-renders when parent connection status changes
export const BlockNoteEditor = memo(BlockNoteEditorInner);

export type { BlockNoteEditorProps };
