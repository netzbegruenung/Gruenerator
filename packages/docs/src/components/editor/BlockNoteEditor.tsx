import { useEffect, useMemo, useRef, useState, useCallback, memo } from 'react';
import { createPortal } from 'react-dom';
import {
  BlockNoteEditor as BlockNoteEditorCore,
  BlockNoteSchema,
  defaultBlockSpecs,
  defaultInlineContentSpecs,
  defaultStyleSpecs,
} from '@blocknote/core';
import { CommentsExtension } from '@blocknote/core/comments';
import { de } from '@blocknote/core/locales';
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
import { filterSuggestionItems } from '@blocknote/core/extensions';
import { BlockNoteView } from '@blocknote/mantine';
import {
  AIExtension,
  AIMenuController,
  AIToolbarButton,
  getAISlashMenuItems,
} from '@blocknote/xl-ai';
import { de as aiDe } from '@blocknote/xl-ai/locales';
import { DefaultChatTransport } from 'ai';
import '@blocknote/core/fonts/inter.css';
import '@blocknote/mantine/style.css';
import '@blocknote/xl-ai/style.css';
import * as Y from 'yjs';
import { HocuspocusProvider } from '@hocuspocus/provider';

import { useEditorStore } from '../../stores/editorStore';
import { defaultDocumentContent } from '../../lib/defaultContent';
import { getTemplateContent } from '../../lib/templates';
import { isEditorEmpty } from '../../lib/blockNoteUtils';
import { useBlockNoteComments } from '../../hooks/useBlockNoteComments';
import { useResolveUsers } from '../../hooks/useResolveUsers';
import { useDocsAdapter } from '../../context/DocsContext';
import { ErrorBoundary } from '../common/ErrorBoundary';
import './BlockNoteEditor.css';

export interface BlockNoteEditorProps {
  documentId: string;
  initialContent?: string;
  documentSubtype?: string;
  editable?: boolean;
  showComments?: boolean;
  commentsPortalTarget?: HTMLElement | null;
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

const EDITOR_DOM_ATTRIBUTES = {
  editor: { class: 'blocknote-editor-content' },
} as const;

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

    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement;
      const inside = isInsideFloatingComposer(target);
      if (inside) {
        if (target.closest('button')) {
          e.stopPropagation();
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        const focusTarget =
          target.closest('[contenteditable="true"]') || target.closest('input, textarea');
        if (focusTarget instanceof HTMLElement) {
          focusTarget.focus();
        }
      }
    };

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
  commentsPortalTarget,
  ydoc,
  provider,
  isSynced = false,
  onEditorReady,
}: BlockNoteEditorProps) => {
  const { setEditor: setEditorInStore, removeEditor } = useEditorStore();
  const adapter = useDocsAdapter();
  const hasInitialized = useRef(false);
  const [isReady, setIsReady] = useState(false);

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

  const aiApiUrl = `${adapter.getApiBaseUrl()}/docs/ai`;

  const extensions = useMemo((): any[] => {
    const exts: any[] = [
      AIExtension({
        transport: new DefaultChatTransport({
          api: aiApiUrl,
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
  }, [showComments, threadStore, resolveUsers, aiApiUrl]);

  const editor = useCreateBlockNote(
    {
      schema,
      dictionary: {
        ...de,
        ai: aiDe,
      } as any,
      extensions,
      collaboration: collaborationOptions,
      domAttributes: EDITOR_DOM_ATTRIBUTES,
    },
    [collaborationOptions]
  );

  useEffect(() => {
    if (!editor) return;

    editor.isEditable = editable;
  }, [editor, editable]);

  useEffect(() => {
    if (!editor) return;

    setEditorInStore(documentId, editor);
    setIsReady(true);

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

  useEffect(() => {
    if (!editor || hasInitialized.current) return;

    if (ydoc) {
      if (!provider || !isSynced) return;
    }

    if (ydoc && fragment) {
      if (!isEditorEmpty(editor)) {
        hasInitialized.current = true;
        return;
      }
    }

    const templateContent = getTemplateContent(documentSubtype);
    const contentToUse = initialContent?.trim()
      ? initialContent
      : templateContent || defaultDocumentContent;

    const initializeWithContent = async () => {
      try {
        const blocks = await editor.tryParseHTMLToBlocks(contentToUse);
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
  }, [editor, initialContent, documentSubtype, isSynced, ydoc, fragment, provider]);

  const handleUploadFile = useCallback(async (file: File) => {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return '/images/tiptap-ui-placeholder-image.jpg';
  }, []);

  if (!editor) {
    return <div className="blocknote-loading">Lädt Editor...</div>;
  }

  return (
    <div className="blocknote-wrapper">
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
          {commentsPortalTarget && showComments && threadStore &&
            createPortal(<ThreadsSidebar filter="all" />, commentsPortalTarget)}
        </BlockNoteView>
      </ErrorBoundary>
    </div>
  );
};

export const BlockNoteEditor = memo(BlockNoteEditorInner);
