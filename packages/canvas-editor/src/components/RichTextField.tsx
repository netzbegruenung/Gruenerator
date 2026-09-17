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
 * Der Editor schwebt als Portal über dem Leinwand-Text und erbt dessen
 * Schrift und Farbe. Die Werkzeugleiste trägt er nur, wo es keine Kopfleiste
 * gibt (`StandaloneCanvas`); im Editor übernimmt sie die Kontextleiste der
 * Kopfleiste — siehe `CanvasTextOverlay`. Die Knöpfe selbst stehen in beiden
 * Fällen in `TextFormatControls`.
 *
 * Eine zweite Erscheinung für die Seitenleiste gibt es bewusst nicht: keine
 * Vorlage reicht ihre Textfelder dorthin durch, bearbeitet wird per
 * Doppelklick auf der Leinwand.
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
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import { useEffect, useRef, type CSSProperties } from 'react';

import { type FontMarkSupport } from '../utils/fontMarkSupport';

import { TextFormatControls } from './TextFormatControls';

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
  /**
   * Ob das Feld seine eigene Werkzeugleiste trägt. `false`, wenn ein Wirt sie
   * zeigt — sonst stünden dieselben Knöpfe an zwei Stellen.
   */
  showToolbar?: boolean;
  /**
   * Reicht den lebenden Editor nach oben, damit ein Wirt (die Kontextleiste)
   * ihn bedienen kann. Beim Abräumen mit `null`.
   */
  onEditorReady?: (editor: Editor | null) => void;
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

export function RichTextField({
  value,
  onChange,
  placeholder,
  marks = ALL_MARKS_SUPPORTED,
  autoFocus = false,
  showToolbar = true,
  onEditorReady,
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

  // Der Wirt bekommt den Editor erst, wenn er wirklich steht, und beim
  // Abräumen ein `null` — sonst bediente die Kontextleiste eine Leiche.
  const readyRef = useRef(onEditorReady);
  readyRef.current = onEditorReady;
  useEffect(() => {
    if (!editor) return;
    readyRef.current?.(editor);
    return () => readyRef.current?.(null);
  }, [editor]);

  if (!editor) return null;

  return (
    <div className="canvas-rte">
      {showToolbar && (
        <div className="canvas-rte__floating-toolbar">
          <TextFormatControls editor={editor} marks={marks} variant="floating" />
        </div>
      )}
      <EditorContent editor={editor} style={contentStyle} />
    </div>
  );
}
