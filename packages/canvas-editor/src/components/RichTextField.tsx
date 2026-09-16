/**
 * RichTextField — der Text-Editor für Sharepic-Felder mit Auszeichnung.
 *
 * Fett, Kursiv, Unterstrichen, Aufzählung und Nummerierung; gespeichert wird
 * NICHT das tiptap-Dokument, sondern Markdown-lite im vorhandenen String-Feld
 * (`**fett**`, `_kursiv_`, `<u>…</u>`, `• Punkt`, `1. Punkt`). Die Brücke ist
 * `markdownLiteToRichText`/`richTextToMarkdownLite` aus `@gruenerator/contracts`
 * — so bleibt der Zustand ein flacher String, den Server-Renderer, KI und
 * Chat unverändert lesen.
 *
 * Kontrolliert, nicht semi-kontrolliert (anders als der Sites-Editor):
 * KI-Vorschläge, Chat-Edits und Undo schreiben den Zustand von außen. Der
 * Editor merkt sich, was er zuletzt selbst serialisiert hat; weicht `value`
 * davon ab, kam die Änderung von außen und das Dokument wird neu gesetzt.
 *
 * Der Editor schwebt als Portal über dem Leinwand-Text, erbt dessen Schrift
 * und Farbe und trägt seine Werkzeugleiste darüber. Eine zweite Erscheinung
 * für die Seitenleiste gibt es bewusst nicht: keine Vorlage reicht ihre
 * Textfelder dorthin durch, bearbeitet wird per Doppelklick auf der Leinwand.
 */
import {
  markdownLiteToRichText,
  richTextToMarkdownLite,
  type RichTextDoc,
} from '@gruenerator/contracts';
import { Bold } from '@tiptap/extension-bold';
import { Document } from '@tiptap/extension-document';
import { HardBreak } from '@tiptap/extension-hard-break';
import { Italic } from '@tiptap/extension-italic';
import { BulletList, ListItem, ListKeymap, OrderedList } from '@tiptap/extension-list';
import { Paragraph } from '@tiptap/extension-paragraph';
import { Text } from '@tiptap/extension-text';
import { Underline } from '@tiptap/extension-underline';
import { Placeholder, UndoRedo } from '@tiptap/extensions';
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react';
import clsx from 'clsx';
import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { FiBold, FiItalic, FiList, FiUnderline } from 'react-icons/fi';
import { MdFormatListNumbered } from 'react-icons/md';

import { type FontMarkSupport } from '../utils/fontMarkSupport';

export interface RichTextFieldProps {
  /** Markdown-lite, wie es im Zustand steht. */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /**
   * Welche Schnitt-Auszeichnung diese Schrift wirklich tragen kann — aus
   * `fontMarkSupport`, nicht je Vorlage gepflegt. Unterstreichung und Listen
   * stehen nicht darin: die brauchen keinen Schnitt und gelten überall.
   */
  marks?: FontMarkSupport;
  autoFocus?: boolean;
  /** Schrift und Farbe des Leinwand-Textes, damit der Editor an seiner Stelle sitzt. */
  contentStyle?: CSSProperties;
  onBlur?: () => void;
  /** Escape — der Aufrufer verwirft. */
  onEscape?: () => void;
  /** Cmd/Ctrl+Enter — der Aufrufer schließt ab. */
  onSubmit?: () => void;
}

const BASE_EXTENSIONS = [
  Document,
  Paragraph,
  Text,
  HardBreak,
  BulletList,
  OrderedList,
  ListItem,
  ListKeymap,
  UndoRedo,
];

/**
 * Unterstreichung wird gezeichnet, nicht gesetzt — sie braucht keinen
 * Schriftschnitt und ist deshalb auf jedem Feld aktiv.
 */
const ALWAYS_MARK_EXTENSIONS = [Underline];

/**
 * Fett und Kursiv müssen IM SCHEMA stehen, auch wo die Schrift sie nicht
 * tragen kann. Ein Dokument mit einem Mark, den das Schema nicht kennt, lässt
 * ProseMirror werfen, tiptap setzt daraufhin ein leeres Dokument — der Editor
 * stünde leer über einem Text, der Auszeichnung trägt, und der erste
 * Tastendruck überschriebe das Feld. Ohne echten Schnitt kommen sie deshalb
 * nur ohne Tastenkürzel herein, und die Werkzeugleiste zeigt sie nicht.
 */
function markExtension(mark: typeof Bold | typeof Italic, offered: boolean) {
  return offered ? mark : mark.extend({ addKeyboardShortcuts: () => ({}) });
}

const ALL_MARKS_SUPPORTED: FontMarkSupport = { bold: true, italic: true };

interface ToolbarButtonProps {
  onClick: () => void;
  isActive: boolean;
  label: string;
  children: ReactNode;
}

function ToolbarButton({ onClick, isActive, label, children }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      // preventDefault hält Auswahl und Fokus im Editor, während man klickt —
      // sonst schlösse ein Blur den Overlay-Editor, bevor der Klick ankommt.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      aria-label={label}
      aria-pressed={isActive}
      title={label}
      className={clsx(
        'flex h-7 w-7 cursor-pointer items-center justify-center rounded-sm border-none bg-transparent text-[var(--editor-text-secondary)] transition-colors hover:bg-[var(--editor-surface-hover)] hover:text-[var(--editor-text)] [&_svg]:h-4 [&_svg]:w-4',
        isActive && 'bg-[var(--editor-active-bg)] text-[var(--editor-active-fg)]'
      )}
    >
      {children}
    </button>
  );
}

function Toolbar({ editor, marks }: { editor: Editor; marks: FontMarkSupport }) {
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
    <div
      role="toolbar"
      aria-label="Textformatierung"
      className="flex items-center gap-0.5 px-1 py-0.5"
    >
      {marks.bold && (
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBold().run()}
          isActive={state.bold}
          label="Fett (⌘B)"
        >
          <FiBold />
        </ToolbarButton>
      )}
      {marks.italic && (
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleItalic().run()}
          isActive={state.italic}
          label="Kursiv (⌘I)"
        >
          <FiItalic />
        </ToolbarButton>
      )}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        isActive={state.underline}
        label="Unterstrichen (⌘U)"
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

export function RichTextField({
  value,
  onChange,
  placeholder,
  marks = ALL_MARKS_SUPPORTED,
  autoFocus = false,
  contentStyle,
  onBlur,
  onEscape,
  onSubmit,
}: RichTextFieldProps) {
  // Was der Editor zuletzt selbst geschrieben hat — nur ein `value`, das
  // davon abweicht, kam von außen (KI, Chat, Undo) und wird hereingesetzt.
  const lastEmitted = useRef(value);
  const callbacks = useRef({ onChange, onBlur, onEscape, onSubmit });
  callbacks.current = { onChange, onBlur, onEscape, onSubmit };

  const editor = useEditor({
    extensions: [
      ...BASE_EXTENSIONS,
      ...ALWAYS_MARK_EXTENSIONS,
      markExtension(Bold, marks.bold),
      markExtension(Italic, marks.italic),
      Placeholder.configure({ placeholder: placeholder ?? '' }),
    ],
    content: markdownLiteToRichText(value),
    // 'all', nicht 'end': die Textarea, die dieser Editor ersetzt, rief
    // `select()` — Doppelklick und lostippen ersetzte das Feld. Das ist der
    // einzige Bearbeiten-Weg, den es auf der Leinwand je gab, und die
    // eingeübte Bewegung.
    autofocus: autoFocus ? 'all' : false,
    // Die Toolbar liest ihren Zustand über `useEditorState`; die Komponente
    // selbst muss nicht bei jeder Transaktion neu rendern.
    shouldRerenderOnTransaction: false,
    editorProps: {
      attributes: { class: 'canvas-rte__content' },
      handleKeyDown: (_view, event) => {
        if (event.key === 'Escape') {
          callbacks.current.onEscape?.();
          return true;
        }
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
          callbacks.current.onSubmit?.();
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor: e }) => {
      const next = richTextToMarkdownLite(e.getJSON() as RichTextDoc);
      if (next === lastEmitted.current) return;
      lastEmitted.current = next;
      callbacks.current.onChange(next);
    },
    onBlur: () => callbacks.current.onBlur?.(),
  });

  useEffect(() => {
    if (!editor || value === lastEmitted.current) return;
    lastEmitted.current = value;
    editor.commands.setContent(markdownLiteToRichText(value), { emitUpdate: false });
  }, [editor, value]);

  if (!editor) return null;

  return (
    <div className="canvas-rte">
      <div className="canvas-rte__floating-toolbar">
        <Toolbar editor={editor} marks={marks} />
      </div>
      <EditorContent editor={editor} style={contentStyle} />
    </div>
  );
}
