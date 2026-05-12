import {
  type ComponentProps,
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
import { filterSuggestionItems, ForkYDocExtension } from '@blocknote/core/extensions';
import { BlockNoteView, ShadCNDefaultComponents } from '@blocknote/shadcn';
import {
  AIExtension,
  AIMenuController,
  AIToolbarButton,
  aiDocumentFormats,
  getAISlashMenuItems,
} from '@blocknote/xl-ai';
import { de as aiDe } from '@blocknote/xl-ai/locales';
import { DefaultChatTransport } from 'ai';
import '@blocknote/core/fonts/inter.css';
import '@blocknote/shadcn/style.css';
import '@blocknote/xl-ai/style.css';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import * as Y from 'yjs';
import { HocuspocusProvider } from '@hocuspocus/provider';

import { useEditorStore } from '../../stores/editorStore';
import { useBlockNoteComments } from '../../hooks/useBlockNoteComments';
import { useResolveUsers } from '../../hooks/useResolveUsers';
import { useMentionUsers } from '../../hooks/useMentionUsers';
import { useDocsAdapter } from '../../context/DocsContext';
import { useIsTouchDevice, useMobileKeyboardOffset } from '@gruenerator/shared/hooks';
import { useEditorPreferencesStore } from '../../stores/editorPreferencesStore';
import { ErrorBoundary } from '../common/ErrorBoundary';
import { Mention } from './Mention';
import { EditorDictationButton } from './EditorDictationButton';
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

// BlockNote's shadcn Tooltip wraps each instance in its own TooltipProvider,
// creating triple-nested providers inside the Toolbar. This override removes
// the redundant inner provider — the Toolbar already provides one.
function ToolbarTooltip(props: ComponentProps<typeof TooltipPrimitive.Root>) {
  return <TooltipPrimitive.Root data-slot="tooltip" {...props} />;
}

const shadCNComponentOverrides = {
  Tooltip: { ...ShadCNDefaultComponents.Tooltip, Tooltip: ToolbarTooltip },
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
  const wrapperRef = useRef<HTMLDivElement>(null);

  const scrollSelectionIntoView = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;

    const anchorNode = sel.anchorNode;
    const anchorEl =
      anchorNode?.nodeType === Node.ELEMENT_NODE
        ? (anchorNode as Element)
        : (anchorNode?.parentElement ?? null);
    const blockEl = anchorEl?.closest('[data-id], .bn-block-content') ?? anchorEl;
    if (!blockEl) return;

    const rect = sel.getRangeAt(0).getBoundingClientRect();
    const vp = window.visualViewport;
    const toolbarHeight =
      wrapperRef.current?.querySelector('.bn-formatting-toolbar')?.getBoundingClientRect().height ||
      44;
    const visibleBottom = vp ? vp.offsetTop + vp.height - toolbarHeight : window.innerHeight;
    const visibleTop = vp?.offsetTop ?? 0;

    if (rect.bottom > visibleBottom || rect.top < visibleTop) {
      blockEl.scrollIntoView({ block: 'center', behavior: 'smooth' });
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
        // Markdown format avoids xl-ai's HTML rebase-tool throw on docs that
        // contain inline color/background spans — those don't round-trip
        // through blocksToHTMLLossy/tryParseHTMLToBlocks but they DO round-trip
        // through markdown (lossy by design, the offending spans drop out).
        // See `_experimental_markdown` in @blocknote/xl-ai for the format
        // definition; backend `aiController.ts` uses the matching system prompt.
        streamToolsProvider: aiDocumentFormats._experimental_markdown.getStreamToolsProvider(),
        documentStateBuilder: aiDocumentFormats._experimental_markdown.defaultDocumentStateBuilder,
      }),
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
  }, [showComments, threadStore, resolveUsers, aiApiUrl, collaborationOptions]);

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

    // Diagnostic: verify whether ForkYDocExtension is auto-registered by core
    // when `collaboration` is passed to useCreateBlockNote. xl-ai's
    // acceptChanges calls editor.getExtension(ForkYDocExtension)?.merge() —
    // if this logs `false` while collab is active, AI accept will silently
    // no-op and the suggestion diff won't render. Per the BlockNote expert
    // review, default-extension auto-registration is the expected source of
    // ForkYDoc; manual push only needed if this returns false.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const forkExt = (editor as any).getExtension?.(ForkYDocExtension);
    // eslint-disable-next-line no-console
    console.log(
      '[BlockNoteEditor] ForkYDoc present?',
      !!forkExt,
      '| collab active?',
      !!collaborationOptions,
      '| doc:',
      documentId
    );

    // Fix checkbox multi-click: intercept click on checkbox inputs and
    // toggle the block directly via editor API, bypassing ProseMirror's
    // slow event pipeline that drops native change events.
    const editorDom = editor.prosemirrorView?.dom;
    const handleCheckboxClick = (e: Event) => {
      const target = e.target as HTMLElement;
      if (!(target instanceof HTMLInputElement && target.type === 'checkbox')) return;
      const blockEl = target.closest('[data-id]');
      if (!blockEl) return;
      const blockId = blockEl.getAttribute('data-id');
      if (!blockId) return;
      const block = editor.getBlock(blockId);
      if (block && block.type === 'checkListItem') {
        e.preventDefault();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        editor.updateBlock(blockId, { props: { checked: !(block.props as any).checked } });
      }
    };
    editorDom?.addEventListener('click', handleCheckboxClick);

    const timeoutId = setTimeout(() => {
      if (onEditorReady) {
        onEditorReady(editor as unknown as BlockNoteEditorCore);
      }
    }, 0);

    return () => {
      editorDom?.removeEventListener('click', handleCheckboxClick);
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

  const toolbarItems = useMemo(() => getFormattingToolbarItems(), []);

  const formattingToolbar = useCallback(
    () => (
      <FormattingToolbar>
        {toolbarItems}
        <AIToolbarButton />
      </FormattingToolbar>
    ),
    [toolbarItems]
  );

  if (!editor) {
    return <div className="blocknote-loading">Lädt Editor...</div>;
  }

  return (
    <div
      ref={wrapperRef}
      className={`blocknote-wrapper relative${staticToolbar ? ' blocknote-static-toolbar' : ''}`}
    >
      <ErrorBoundary>
        {editable && <EditorDictationButton editor={editor} />}
        <BlockNoteView
          editor={editor}
          theme={theme}
          editable={editable}
          shadCNComponents={shadCNComponentOverrides}
          formattingToolbar={false}
          slashMenu={false}
          sideMenu={false}
          tableHandles={false}
        >
          <AIMenuController />
          {hideFormattingToolbar ? null : staticToolbar ? (
            <FormattingToolbar>
              {toolbarItems}
              {!isTouchDevice && <AIToolbarButton />}
            </FormattingToolbar>
          ) : (
            <FormattingToolbarController formattingToolbar={formattingToolbar} />
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
