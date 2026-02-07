import { useEffect, useMemo, useRef, useState, useCallback, memo } from 'react';
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

import { useEditorStore } from '@/stores/editorStore';
import { defaultDocumentContent } from '@/lib/defaultContent';
import { useBlockNoteComments } from '@/hooks/useBlockNoteComments';
import { useResolveUsers } from '@/hooks/useResolveUsers';
import './BlockNoteEditor.css';

interface BlockNoteEditorProps {
  documentId: string;
  initialContent?: string;
  editable?: boolean;
  showComments?: boolean;
  showCommentsSidebar?: boolean;
  ydoc?: Y.Doc;
  provider?: HocuspocusProvider | null;
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

const BlockNoteEditorInner = ({
  documentId,
  initialContent = '',
  editable = true,
  showComments = true,
  showCommentsSidebar = false,
  ydoc,
  provider,
  onEditorReady,
}: BlockNoteEditorProps) => {
  const renderCount = useRef(0);
  renderCount.current++;

  const prevPropsRef = useRef({ documentId, ydoc, provider, onEditorReady });
  const changedProps: string[] = [];
  if (prevPropsRef.current.documentId !== documentId) changedProps.push('documentId');
  if (prevPropsRef.current.ydoc !== ydoc) changedProps.push('ydoc');
  if (prevPropsRef.current.provider !== provider) changedProps.push('provider');
  if (prevPropsRef.current.onEditorReady !== onEditorReady) changedProps.push('onEditorReady');
  prevPropsRef.current = { documentId, ydoc, provider, onEditorReady };

  console.log('[BlockNoteEditor] RENDER #', renderCount.current, changedProps.length > 0 ? 'Changed props:' : '', changedProps);

  const { setEditor: setEditorInStore, removeEditor } = useEditorStore();
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
        ...aiDe,
      } as any,
      extensions,
      collaboration: collaborationOptions,
      domAttributes: {
        editor: {
          class: 'blocknote-editor-content',
        },
      },
    },
    [collaborationOptions, extensions]
  );

  useEffect(() => {
    if (!editor) return;

    editor.isEditable = editable;
  }, [editor, editable]);

  useEffect(() => {
    if (!editor) return;

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

  useEffect(() => {
    if (!editor || hasInitialized.current) return;

    if (provider && !provider.isSynced) return;

    // Check if collaboration document already has content
    if (ydoc && fragment) {
      const isEmpty = fragment.length === 0;

      if (!isEmpty) {
        hasInitialized.current = true;
        return;
      }
    }

    // Use initialContent if provided, otherwise use default content for new docs
    const contentToUse = initialContent?.trim() ? initialContent : defaultDocumentContent;

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
  }, [editor, initialContent, provider?.isSynced, ydoc, fragment, provider]);

  const handleUploadFile = useCallback(async (file: File) => {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return '/images/tiptap-ui-placeholder-image.jpg';
  }, []);

  if (!editor) {
    return (
      <div className="blocknote-loading">
        Lädt Editor...
      </div>
    );
  }

  return (
    <div className={`blocknote-wrapper ${showCommentsSidebar ? 'with-sidebar' : ''}`}>
      <BlockNoteView
        editor={editor}
        theme="light"
        formattingToolbar={false}
        slashMenu={false}
      >
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
              [
                ...getDefaultReactSlashMenuItems(editor),
                ...getAISlashMenuItems(editor),
              ],
              query
            )
          }
        />
        {showComments && threadStore && <FloatingComposerController />}
      </BlockNoteView>
      {showCommentsSidebar && showComments && threadStore && (
        <div className="comments-sidebar">
          <div className="comments-sidebar-header">
            <h3>Kommentare</h3>
          </div>
          <ThreadsSidebar />
        </div>
      )}
    </div>
  );
};

// Memoize to prevent re-renders when parent connection status changes
export const BlockNoteEditor = memo(BlockNoteEditorInner);

export type { BlockNoteEditorProps };
