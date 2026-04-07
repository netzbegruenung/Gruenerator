import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
  useSyncExternalStore,
  memo,
} from 'react';
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
import { BlockNoteView } from '@blocknote/shadcn';
import {
  AIExtension,
  AIMenuController,
  AIToolbarButton,
  getAISlashMenuItems,
} from '@blocknote/xl-ai';
import { de as aiDe } from '@blocknote/xl-ai/locales';
import { DefaultChatTransport } from 'ai';
import '@blocknote/core/fonts/inter.css';
import '@blocknote/shadcn/style.css';
import '@blocknote/xl-ai/style.css';
import * as Y from 'yjs';
import { HocuspocusProvider } from '@hocuspocus/provider';

import { useEditorStore } from '../../stores/editorStore';
import { useBlockNoteComments } from '../../hooks/useBlockNoteComments';
import { useResolveUsers } from '../../hooks/useResolveUsers';
import { useMentionUsers } from '../../hooks/useMentionUsers';
import { useDocsAdapter } from '../../context/DocsContext';
import { useIsTouchDevice } from '../../hooks/useIsTouchDevice';
import { useMobileKeyboardOffset } from '../../hooks/useMobileKeyboardOffset';
import { useEditorPreferencesStore } from '../../stores/editorPreferencesStore';
import { ErrorBoundary } from '../common/ErrorBoundary';
import { Mention } from './Mention';
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
  useStaticFormattingToolbar?: boolean;
  hideFormattingToolbar?: boolean;
}

interface CollaborationUser {
  id: string;
  name: string;
  color: string;
}

function subscribeToTheme(callback: () => void) {
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => observer.disconnect();
}

function getThemeSnapshot(): 'light' | 'dark' {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

function useDocumentTheme(): 'light' | 'dark' {
  return useSyncExternalStore(subscribeToTheme, getThemeSnapshot);
}

const EDITOR_DOM_ATTRIBUTES = {
  editor: { class: 'blocknote-editor-content' },
} as const;

const schema = BlockNoteSchema.create({
  blockSpecs: defaultBlockSpecs,
  inlineContentSpecs: {
    ...defaultInlineContentSpecs,
    mention: Mention,
  },
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
  useStaticFormattingToolbar = false,
  hideFormattingToolbar = false,
}: BlockNoteEditorProps) => {
  const { setEditor: setEditorInStore, removeEditor } = useEditorStore();
  const adapter = useDocsAdapter();
  const isTouchDevice = useIsTouchDevice();
  const toolbarMode = useEditorPreferencesStore((s) => s.toolbarMode);
  const theme = useDocumentTheme();
  const staticToolbar = useStaticFormattingToolbar || isTouchDevice || toolbarMode === 'fixed';
  const getMentionMenuItems = useMentionUsers(provider ?? null);
  const hasInitialized = useRef(false);
  const [isReady, setIsReady] = useState(false);
  const wrapperRef = useMobileKeyboardOffset<HTMLDivElement>();

  // Editor-specific: toggle selection class + scroll selection into view
  useEffect(() => {
    if (!isTouchDevice) return;

    const updateSelectionClass = () => {
      const sel = window.getSelection();
      const hasSelection = !!sel && !sel.isCollapsed && sel.toString().length > 0;
      wrapperRef.current?.classList.toggle('has-selection', hasSelection);
    };

    let scrollTimer: ReturnType<typeof setTimeout>;

    const scrollSelectionIntoView = () => {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      const vp = window.visualViewport;
      if (!vp) return;
      const toolbarHeight =
        wrapperRef.current?.querySelector('.bn-formatting-toolbar')?.getBoundingClientRect()
          .height || 44;
      const visibleBottom = vp.offsetTop + vp.height - toolbarHeight;
      if (rect.bottom > visibleBottom) {
        window.scrollBy({ top: rect.bottom - visibleBottom + 16, behavior: 'smooth' });
      } else if (rect.top < vp.offsetTop) {
        window.scrollBy({ top: rect.top - vp.offsetTop - 16, behavior: 'smooth' });
      }
    };

    const onSelectionChange = () => {
      updateSelectionClass();
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(scrollSelectionIntoView, 100);
    };

    document.addEventListener('selectionchange', onSelectionChange);
    return () => {
      document.removeEventListener('selectionchange', onSelectionChange);
      clearTimeout(scrollTimer);
    };
  }, [isTouchDevice, wrapperRef]);

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
      tables: {
        splitCells: true,
        cellBackgroundColor: true,
        cellTextColor: true,
        headers: true,
      },
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

    setEditorInStore(documentId, editor);
    setIsReady(true);

    const timeoutId = setTimeout(() => {
      if (onEditorReady) {
        onEditorReady(editor as unknown as BlockNoteEditorCore);
      }
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      removeEditor(documentId);
    };
  }, [editor, documentId, setEditorInStore, removeEditor, onEditorReady]);

  useEffect(() => {
    if (!editor || hasInitialized.current) return;

    // Collaborative mode: Yjs is the sole source of truth.
    // Templates are injected server-side in Hocuspocus onLoadDocument.
    if (ydoc) {
      hasInitialized.current = true;
      return;
    }

    // Non-collaborative (standalone) editor: use initialContent if provided
    if (!initialContent?.trim()) {
      hasInitialized.current = true;
      return;
    }

    let aborted = false;
    (async () => {
      try {
        const blocks = await editor.tryParseHTMLToBlocks(initialContent);
        if (!aborted && blocks && blocks.length > 0) {
          editor.replaceBlocks(editor.document, blocks);
        }
      } catch (error) {
        console.error('[BlockNoteEditor] Failed to parse initial content:', error);
      }
      hasInitialized.current = true;
    })();

    return () => {
      aborted = true;
    };
  }, [editor, initialContent, ydoc]);

  const handleUploadFile = useCallback(async (file: File) => {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return '/images/tiptap-ui-placeholder-image.jpg';
  }, []);

  if (!editor) {
    return <div className="blocknote-loading">Lädt Editor...</div>;
  }

  return (
    <div
      ref={wrapperRef}
      className={`blocknote-wrapper${staticToolbar ? ' blocknote-static-toolbar' : ''}`}
    >
      <ErrorBoundary>
        <BlockNoteView
          editor={editor}
          theme={theme}
          editable={editable}
          formattingToolbar={false}
          slashMenu={false}
        >
          <AIMenuController />
          {hideFormattingToolbar ? null : staticToolbar ? (
            <FormattingToolbar>
              {getFormattingToolbarItems()}
              {!isTouchDevice && <AIToolbarButton />}
            </FormattingToolbar>
          ) : (
            <FormattingToolbarController
              formattingToolbar={() => (
                <FormattingToolbar>
                  {getFormattingToolbarItems()}
                  <AIToolbarButton />
                </FormattingToolbar>
              )}
            />
          )}
          <SuggestionMenuController
            triggerCharacter="/"
            getItems={async (query) =>
              filterSuggestionItems(
                [...getDefaultReactSlashMenuItems(editor), ...getAISlashMenuItems(editor)],
                query
              )
            }
          />
          <SuggestionMenuController
            triggerCharacter="@"
            getItems={async (query) => getMentionMenuItems(editor, query)}
          />
          {showComments && threadStore && <StableFloatingComposer />}
          {commentsPortalTarget &&
            showComments &&
            threadStore &&
            createPortal(<ThreadsSidebar filter="all" />, commentsPortalTarget)}
        </BlockNoteView>
      </ErrorBoundary>
    </div>
  );
};

export const BlockNoteEditor = memo(BlockNoteEditorInner);
