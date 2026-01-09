import { useEffect, useRef, useState } from 'react';
import { EditorContent, EditorContext, useEditor } from '@tiptap/react';
import * as Y from 'yjs';
import { HocuspocusProvider } from '@hocuspocus/provider';

// --- Tiptap Core Extensions ---
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import TextAlign from '@tiptap/extension-text-align';
import Typography from '@tiptap/extension-typography';
import Highlight from '@tiptap/extension-highlight';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCursor from '@tiptap/extension-collaboration-cursor';
import Placeholder from '@tiptap/extension-placeholder';

// --- UI Primitives ---
import { Spacer } from '@/components/tiptap-ui-primitive/spacer';
import {
  Toolbar,
  ToolbarGroup,
  ToolbarSeparator,
} from '@/components/tiptap-ui-primitive/toolbar';

// --- Tiptap Node ---
import { ImageUploadNode } from '@/components/tiptap-node/image-upload-node/image-upload-node-extension';
import { HorizontalRule } from '@/components/tiptap-node/horizontal-rule-node/horizontal-rule-node-extension';
import '@/components/tiptap-node/blockquote-node/blockquote-node.scss';
import '@/components/tiptap-node/code-block-node/code-block-node.scss';
import '@/components/tiptap-node/horizontal-rule-node/horizontal-rule-node.scss';
import '@/components/tiptap-node/list-node/list-node.scss';
import '@/components/tiptap-node/image-node/image-node.scss';
import '@/components/tiptap-node/heading-node/heading-node.scss';
import '@/components/tiptap-node/paragraph-node/paragraph-node.scss';

// --- Tiptap UI ---
import { HeadingDropdownMenu } from '@/components/tiptap-ui/heading-dropdown-menu';
import { ImageUploadButton } from '@/components/tiptap-ui/image-upload-button';
import { ListDropdownMenu } from '@/components/tiptap-ui/list-dropdown-menu';
import { BlockquoteButton } from '@/components/tiptap-ui/blockquote-button';
import { CodeBlockButton } from '@/components/tiptap-ui/code-block-button';
import {
  LinkPopover,
  LinkContent,
  LinkButton,
} from '@/components/tiptap-ui/link-popover';
import { MarkButton } from '@/components/tiptap-ui/mark-button';
import { TextAlignButton } from '@/components/tiptap-ui/text-align-button';
import { UndoRedoButton } from '@/components/tiptap-ui/undo-redo-button';
import { AiEditorPopover } from '@/components/tiptap-ui/ai-editor-popover';
import { AiHistoryDropdown } from '@/components/tiptap-ui/ai-history-dropdown';

// --- Hooks ---
import { useIsBreakpoint } from '@/hooks/use-is-breakpoint';
import { useWindowSize } from '@/hooks/use-window-size';
import { useCursorVisibility } from '@/hooks/use-cursor-visibility';

// --- Stores ---
import { useEditorStore } from '@/stores/editorStore';

// --- Lib ---
import { handleImageUpload, MAX_FILE_SIZE } from '@/lib/tiptap-utils';

// --- Styles ---
import '@/components/tiptap-templates/simple/simple-editor.scss';
import './CollaborativeEditor.css';

interface CollaborativeEditorProps {
  documentId: string;
  initialContent?: string;
  onUpdate?: (content: string) => void;
  editable?: boolean;
  ydoc?: Y.Doc;
  provider?: HocuspocusProvider | null;
  onEditorReady?: (editor: any) => void;
}

const MainToolbarContent = ({
  documentId,
  onLinkClick,
  isMobile,
}: {
  documentId: string;
  onLinkClick: () => void;
  isMobile: boolean;
}) => {
  return (
    <>
      <Spacer />

      <ToolbarGroup>
        <UndoRedoButton action="undo" />
        <UndoRedoButton action="redo" />
      </ToolbarGroup>

      <ToolbarSeparator />

      {/* AI Editor Section */}
      <ToolbarGroup>
        <AiEditorPopover documentId={documentId} />
        <AiHistoryDropdown documentId={documentId} />
      </ToolbarGroup>

      <ToolbarSeparator />

      <ToolbarGroup>
        <HeadingDropdownMenu levels={[1, 2, 3, 4, 5, 6]} portal={isMobile} />
        <ListDropdownMenu
          types={['bulletList', 'orderedList', 'taskList']}
          portal={isMobile}
        />
        <BlockquoteButton />
        <CodeBlockButton />
      </ToolbarGroup>

      <ToolbarSeparator />

      <ToolbarGroup>
        <MarkButton type="bold" />
        <MarkButton type="italic" />
        <MarkButton type="strike" />
        <MarkButton type="code" />
        <MarkButton type="underline" />
        {!isMobile ? <LinkPopover /> : <LinkButton onClick={onLinkClick} />}
      </ToolbarGroup>

      <ToolbarSeparator />

      <ToolbarGroup>
        <MarkButton type="superscript" />
        <MarkButton type="subscript" />
      </ToolbarGroup>

      <ToolbarSeparator />

      <ToolbarGroup>
        <TextAlignButton align="left" />
        <TextAlignButton align="center" />
        <TextAlignButton align="right" />
        <TextAlignButton align="justify" />
      </ToolbarGroup>

      <ToolbarSeparator />

      <ToolbarGroup>
        <ImageUploadButton text="Bild" />
      </ToolbarGroup>

      <Spacer />
    </>
  );
};

const MobileToolbarContent = ({
  onBack,
}: {
  onBack: () => void;
}) => (
  <>
    <LinkContent />
  </>
);

export const CollaborativeEditor = ({
  documentId,
  initialContent = '',
  onUpdate,
  editable = true,
  ydoc,
  provider,
  onEditorReady,
}: CollaborativeEditorProps) => {
  const isMobile = useIsBreakpoint();
  const { height } = useWindowSize();
  const [mobileView, setMobileView] = useState<'main' | 'link'>('main');
  const toolbarRef = useRef<HTMLDivElement>(null);
  const { setEditor: setEditorInStore, removeEditor } = useEditorStore();

  const editor = useEditor({
    immediatelyRender: false,
    editorProps: {
      attributes: {
        autocomplete: 'off',
        autocorrect: 'off',
        autocapitalize: 'off',
        'aria-label': 'Hauptbereich, beginne zu tippen.',
        class: 'simple-editor',
      },
    },
    extensions: [
      StarterKit.configure({
        horizontalRule: false,
        history: ydoc ? false : undefined, // Disable history when using Y.js
      }),
      HorizontalRule,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Highlight.configure({ multicolor: true }),
      Image,
      Typography,
      Superscript,
      Subscript,
      Underline,
      Link.configure({
        openOnClick: false,
      }),
      Placeholder.configure({
        placeholder: 'Beginne zu schreiben...',
      }),
      ImageUploadNode.configure({
        accept: 'image/*',
        maxSize: MAX_FILE_SIZE,
        limit: 3,
        upload: handleImageUpload,
        onError: (error) => console.error('Upload failed:', error),
      }),
      // Add collaboration extensions only if ydoc is provided
      ...(ydoc
        ? [
            Collaboration.configure({
              document: ydoc,
            }),
            CollaborationCursor.configure({
              provider: provider || undefined,
              user: provider?.awareness?.getLocalState()?.user || {
                name: 'Anonymous',
                color: '#808080',
              },
            }),
          ]
        : []),
    ],
    content: ydoc ? undefined : initialContent,
    editable,
    onUpdate: ({ editor }) => {
      if (onUpdate && !ydoc) {
        onUpdate(editor.getHTML());
      }
    },
  }, [ydoc, provider]);

  const rect = useCursorVisibility({
    editor,
    overlayHeight: toolbarRef.current?.getBoundingClientRect().height ?? 0,
  });

  useEffect(() => {
    if (!isMobile && mobileView !== 'main') {
      setMobileView('main');
    }
  }, [isMobile, mobileView]);

  useEffect(() => {
    // Store editor in Zustand store
    if (editor) {
      setEditorInStore(documentId, editor);
      if (onEditorReady) {
        onEditorReady(editor);
      }
    }

    // Cleanup on unmount
    return () => {
      removeEditor(documentId);
    };
  }, [editor, onEditorReady, documentId, setEditorInStore, removeEditor]);

  // Initialize Y.js document with HTML content from export (only once on first load)
  const hasInitialized = useRef(false);
  useEffect(() => {
    if (
      editor &&
      ydoc &&
      initialContent &&
      !hasInitialized.current &&
      provider?.isSynced
    ) {
      // Check if Y.js document is empty
      const fragment = ydoc.getXmlFragment('default');
      const isEmpty = fragment.length === 0;

      if (isEmpty) {
        // Initialize editor with HTML content
        editor.commands.setContent(initialContent);
        hasInitialized.current = true;
        console.log('[CollaborativeEditor] Initialized Y.js document with HTML content');
      }
    }
  }, [editor, ydoc, initialContent, provider?.isSynced]);

  return (
    <div className="simple-editor-wrapper">
      <EditorContext.Provider value={{ editor }}>
        <Toolbar
          ref={toolbarRef}
          style={{
            ...(isMobile
              ? {
                  bottom: `calc(100% - ${height - rect.y}px)`,
                }
              : {}),
          }}
        >
          {mobileView === 'main' ? (
            <MainToolbarContent
              documentId={documentId}
              onLinkClick={() => setMobileView('link')}
              isMobile={isMobile}
            />
          ) : (
            <MobileToolbarContent
              onBack={() => setMobileView('main')}
            />
          )}
        </Toolbar>

        <EditorContent
          editor={editor}
          role="presentation"
          className="simple-editor-content"
        />
      </EditorContext.Provider>
    </div>
  );
};
