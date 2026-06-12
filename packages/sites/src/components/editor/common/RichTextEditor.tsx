import { type RichTextDoc } from '@gruenerator/contracts';
import { cn } from '@gruenerator/shared/utils';
import { Bold } from '@tiptap/extension-bold';
import { Document } from '@tiptap/extension-document';
import { HardBreak } from '@tiptap/extension-hard-break';
import { Heading } from '@tiptap/extension-heading';
import { Italic } from '@tiptap/extension-italic';
import { BulletList, ListItem, ListKeymap, OrderedList } from '@tiptap/extension-list';
import { Paragraph } from '@tiptap/extension-paragraph';
import { Text } from '@tiptap/extension-text';
import { Underline } from '@tiptap/extension-underline';
import { CharacterCount, Placeholder, UndoRedo } from '@tiptap/extensions';
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react';
import { FiBold, FiItalic, FiList, FiUnderline } from 'react-icons/fi';
import { MdFormatListNumbered } from 'react-icons/md';

import '../../../styles/components/rich-text-editor.css';

// Must stay aligned with the richtext Zod whitelist in
// @gruenerator/contracts (schemas/richtext.ts) — anything the editor emits
// outside that schema is rejected by the API on save.
const siteRichTextExtensions = [
  Document,
  Paragraph,
  Text,
  HardBreak,
  Bold,
  Italic,
  Underline,
  Heading.configure({ levels: [2, 3] }),
  BulletList,
  OrderedList,
  ListItem,
];

export interface RichTextEditorProps {
  value: RichTextDoc;
  onChange: (doc: RichTextDoc) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  placeholder?: string;
  /** Plain-text character limit (CharacterCount semantics, matches server-side getRichTextLength). */
  maxLength: number;
  minHeight?: string;
}

interface ToolbarButtonProps {
  onClick: () => void;
  isActive: boolean;
  label: string;
  children: React.ReactNode;
}

function ToolbarButton({ onClick, isActive, label, children }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      // preventDefault keeps the editor selection/focus while clicking the toolbar
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      aria-label={label}
      aria-pressed={isActive}
      title={label}
      className={cn(
        'flex items-center justify-center w-7 h-7 border-none rounded-sm cursor-pointer bg-transparent text-grey-600 dark:text-grey-400 transition-colors hover:bg-grey-100 dark:hover:bg-grey-800 hover:text-foreground [&_svg]:w-4 [&_svg]:h-4',
        isActive && 'bg-primary-50 dark:bg-primary-950 text-primary-600 dark:text-primary-400'
      )}
    >
      {children}
    </button>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      bulletList: e.isActive('bulletList'),
      orderedList: e.isActive('orderedList'),
    }),
  });

  return (
    <div className="flex items-center gap-0.5 py-1 px-1.5 border-b border-grey-200 dark:border-grey-700">
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBold().run()}
        isActive={state.bold}
        label="Fett"
      >
        <FiBold />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleItalic().run()}
        isActive={state.italic}
        label="Kursiv"
      >
        <FiItalic />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        isActive={state.underline}
        label="Unterstrichen"
      >
        <FiUnderline />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        isActive={state.bulletList}
        label="Aufzählung"
      >
        <FiList />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        isActive={state.orderedList}
        label="Nummerierte Liste"
      >
        <MdFormatListNumbered />
      </ToolbarButton>
    </div>
  );
}

function CharCounter({ editor, maxLength }: { editor: Editor; maxLength: number }) {
  const characters = useEditorState({
    editor,
    selector: ({ editor: e }) => e.storage.characterCount.characters() as number,
  });

  return (
    <div
      className={cn(
        'text-xs text-grey-500 dark:text-grey-400 text-right py-1 px-2',
        characters > maxLength * 0.9 && 'text-yellow-600',
        characters >= maxLength && 'text-red-600'
      )}
    >
      {characters} / {maxLength} Zeichen
    </div>
  );
}

/**
 * Semi-controlled: `value` initializes the document on mount; later external
 * changes are ignored. Reset by remounting (SiteEditor is keyed by site.id).
 */
export default function RichTextEditor({
  value,
  onChange,
  onFocus,
  onBlur,
  placeholder,
  maxLength,
  minHeight,
}: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      ...siteRichTextExtensions,
      ListKeymap,
      UndoRedo,
      Placeholder.configure({ placeholder: placeholder ?? '' }),
      CharacterCount.configure({ limit: maxLength }),
    ],
    content: value,
    onUpdate: ({ editor: e }) => onChange(e.getJSON() as RichTextDoc),
    onFocus: () => onFocus?.(),
    onBlur: () => onBlur?.(),
  });

  if (!editor) return null;

  return (
    <div className="rich-text-editor border border-grey-300 dark:border-grey-700 rounded-md bg-background-pure overflow-hidden transition-colors focus-within:border-primary-500 focus-within:ring-[3px] focus-within:ring-primary-500/15">
      <Toolbar editor={editor} />
      <EditorContent
        editor={editor}
        style={{ '--rte-min-height': minHeight ?? '120px' } as React.CSSProperties}
      />
      <CharCounter editor={editor} maxLength={maxLength} />
    </div>
  );
}
