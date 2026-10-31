// SPDX-License-Identifier: MPL-2.0
/**
 * RichTextField — der Text-Editor für Sharepic-Felder mit Auszeichnung.
 *
 * Fett, Kursiv, Unterstrichen, Aufzählung und Nummerierung; gespeichert wird
 * NICHT das tiptap-Dokument, sondern Markdown-lite im vorhandenen String-Feld
 * (`**fett**`, `_kursiv_`, `<u>…</u>`, `• Punkt`, `1. Punkt`). Die Brücke ist
 * `markdownLiteToRichText`/`richTextToMarkdownLite` aus `@ggraphic/schema`
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
  type CanvasRichTextDoc,
} from '@ggraphic/schema';
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

import { Accent } from '@ggraphic/editor/components/accentMark';
import { messages } from '@ggraphic/editor/i18n/messages';
import { keepsEditing } from '@ggraphic/editor/utils/keyboardOwnership';

import { Marker } from './markerMark.js';
import { formatToolbarOf, TextFormatControls, type OfferedMarks } from './TextFormatControls.js';

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
  marks?: OfferedMarks;
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
  /** Escape — der Aufrufer schließt ab. */
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
 * Schriftschnitt und ist deshalb auf jedem Feld aktiv. Der Akzent steht
 * immer im Schema; angeboten wird er nur, wo der Text einen Akzentstil trägt.
 */
const ALWAYS_MARK_EXTENSIONS = [Underline, Accent, Marker];

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

const isPlainTab = (event: KeyboardEvent) =>
  event.key === 'Tab' && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey;

/**
 * Tab aus dem Text: in die Werkzeugleiste dieses Editors, auf ihren einen
 * Tab-Halt. In einer Liste rückt Tab weiter ein, solange das geht.
 */
function focusFormatToolbar(editor: Editor | null): boolean {
  if (!editor || editor.can().sinkListItem('listItem')) return false;
  const toolbar = formatToolbarOf(editor);
  const stop =
    toolbar?.querySelector<HTMLElement>('button[tabindex="0"]') ??
    toolbar?.querySelector<HTMLElement>('button:not(:disabled)') ??
    null;
  if (!stop) return false;
  stop.focus();
  return true;
}

const ALL_MARKS_SUPPORTED: OfferedMarks = {
  bold: true,
  italic: true,
  accent: false,
  marker: false,
};

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
  // `handleKeyDown` steht in der Konfiguration, bevor es den Editor gibt.
  const editorRef = useRef<Editor | null>(null);

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
      attributes: {
        class: 'canvas-rte__content',
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': messages().common.editText,
      },
      handleKeyDown: (_view, event) => {
        if (event.key === 'Escape') {
          callbacks.current.onEscape?.();
          return true;
        }
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
          callbacks.current.onSubmit?.();
          return true;
        }
        if (isPlainTab(event)) return focusFormatToolbar(editorRef.current);
        return false;
      },
    },
    onUpdate: ({ editor: e }) => {
      const next = richTextToMarkdownLite(e.getJSON() as CanvasRichTextDoc);
      if (next === lastEmitted.current) return;
      lastEmitted.current = next;
      callbacks.current.onChange(next);
    },
    // Ein Fokuswechsel in ein Bedienelement der Werkzeugleiste (das Farbfeld)
    // ist kein Verlassen des Textes.
    onBlur: ({ event }) => {
      if (keepsEditing(event.relatedTarget)) return;
      callbacks.current.onBlur?.();
    },
  });

  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  // In der Leiste hält der Fokus den Editor offen (`keepsEditing`). Von dort
  // schliesst Escape ab wie im Text, und wer die Leiste anderswohin verlässt
  // als zurück in den Text, beendet die Bearbeitung wie mit einem Blur.
  // Escape läuft in der Capture-Phase, damit die Tastatur der Seite es nicht
  // zusätzlich als „Auswahl aufheben" liest.
  useEffect(() => {
    if (!editor) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !keepsEditing(event.target)) return;
      // Im Farbwähler gehört Escape dem Dialog.
      if (event.target instanceof Element && event.target.closest('[role="dialog"]')) return;
      event.preventDefault();
      event.stopPropagation();
      callbacks.current.onEscape?.();
    };
    const onFocusOut = (event: FocusEvent) => {
      if (!keepsEditing(event.target) || keepsEditing(event.relatedTarget)) return;
      if (event.relatedTarget instanceof Node && editor.view.dom.contains(event.relatedTarget)) {
        return;
      }
      callbacks.current.onBlur?.();
    };
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('focusout', onFocusOut);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('focusout', onFocusOut);
    };
  }, [editor]);

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
    // Die Karte steht über dem Text (absolut), im DOM aber dahinter: Umschalt+Tab
    // aus der Leiste führt so zurück in den Text.
    <div className="canvas-rte">
      <EditorContent editor={editor} style={contentStyle} />
      {showToolbar && (
        <div className="canvas-rte__floating-toolbar">
          <TextFormatControls editor={editor} marks={marks} variant="floating" />
        </div>
      )}
    </div>
  );
}
