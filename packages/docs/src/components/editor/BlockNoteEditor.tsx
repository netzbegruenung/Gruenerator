import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
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
  const wrapperRef = useRef<HTMLDivElement>(null);

  const scrollSelectionIntoView = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    const vp = window.visualViewport;
    if (!vp) return;
    const toolbarHeight =
      wrapperRef.current?.querySelector('.bn-formatting-toolbar')?.getBoundingClientRect().height ||
      44;
    const visibleBottom = vp.offsetTop + vp.height - toolbarHeight;
    if (rect.bottom > visibleBottom) {
      window.scrollBy({ top: rect.bottom - visibleBottom + 16, behavior: 'smooth' });
    } else if (rect.top < vp.offsetTop) {
      window.scrollBy({ top: rect.top - vp.offsetTop - 16, behavior: 'smooth' });
    }
  }, []);

  useMobileKeyboardOffset(wrapperRef, { onOffsetChange: scrollSelectionIntoView });

  // Editor-specific: toggle selection class + scroll selection into view on text select
  useEffect(() => {
    if (!isTouchDevice) return;

    const updateSelectionClass = () => {
      const sel = window.getSelection();
      const hasSelection = !!sel && !sel.isCollapsed && sel.toString().length > 0;
      wrapperRef.current?.classList.toggle('has-selection', hasSelection);
    };

    let scrollTimer: ReturnType<typeof setTimeout>;

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
  }, [isTouchDevice, scrollSelectionIntoView]);

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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const extensions = useMemo((): any[] => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const exts: any[] = [
      AIExtension({
        transport: new DefaultChatTransport({
          api: aiApiUrl,
          credentials: 'include',
        }),
      }),
      {
        key: 'checkboxClickFix',
        mount({ dom, signal }: { dom: HTMLElement; signal: AbortSignal }) {
          for (const eventType of ['pointerdown', 'pointerup', 'mousedown', 'mouseup'] as const) {
            dom.addEventListener(
              eventType,
              (e: Event) => {
                const target = e.target as HTMLElement;
                if (target instanceof HTMLInputElement && target.type === 'checkbox') {
                  e.stopPropagation();
                }
              },
              { signal, capture: true }
            );
          }
        },
      },
    ];

    if (showComments && threadStore) {
      exts.push(
        CommentsExtension({
          threadStore,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
