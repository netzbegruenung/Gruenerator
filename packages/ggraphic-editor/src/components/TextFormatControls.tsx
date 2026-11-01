// SPDX-License-Identifier: MPL-2.0
/**
 * TextFormatControls — die Knöpfe für Fett, Kursiv, Unterstrichen, Akzent,
 * Textmarker und Listen, solange ein Text im Editor bearbeitet wird: sie
 * bedienen den tiptap-Editor der Sitzung. Aussehen und Knöpfe stehen in
 * `TextFormatButtons`; ein nur ausgewählter Text hat denselben Satz Knöpfe
 * für seinen ganzen Text (`WholeTextFormatControls`).
 *
 * EINE Definition, zwei Wirte: die schwebende Karte über dem Text (dort, wo es
 * keine Kopfleiste gibt — `StandaloneCanvas`) und die Kontextleiste der
 * Kopfleiste, wo die Knöpfe neben Farbe, Schriftgröße und Ausrichtung stehen.
 */
import { useEditorState, type Editor } from '@tiptap/react';
import { useEffect, useMemo, useRef, type FocusEvent } from 'react';

import { keepsEditing } from '@ggraphic/editor/utils/keyboardOwnership';

import {
  TextFormatButtons,
  type OfferedMarks,
  type TextFormatCommands,
  type TextFormatVariant,
} from './TextFormatButtons.js';

export type { OfferedMarks, TextFormatVariant } from './TextFormatButtons.js';

/**
 * Die Leiste, die gerade diesen Editor bedient — die schwebende Karte oder die
 * eines Wirts. `RichTextField` schickt Tab dorthin; sonst läge sie bei der
 * Kontextleiste weit weg in der Tab-Reihenfolge und wäre ohne Maus unerreichbar.
 */
const toolbarsByEditor = new WeakMap<Editor, HTMLElement>();
export const formatToolbarOf = (editor: Editor): HTMLElement | null =>
  toolbarsByEditor.get(editor) ?? null;

export interface TextFormatControlsProps {
  editor: Editor;
  /**
   * Welche Schnitt-Auszeichnung die Schrift des Feldes wirklich tragen kann.
   * Unterstreichung und Listen stehen nicht darin: die brauchen keinen
   * Schnitt und gelten überall.
   */
  marks: OfferedMarks;
  variant?: TextFormatVariant;
}

export function TextFormatControls({
  editor,
  marks,
  variant = 'floating',
}: TextFormatControlsProps) {
  // Der Wirt muss nichts von tiptap wissen: die Knöpfe hören selbst auf den
  // Editor. Deshalb reist kein Zustand je Tastendruck durch den Baum nach oben.
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      accent: e.isActive('accent'),
      accentColor: (e.getAttributes('accent')['color'] as string | null | undefined) ?? null,
      marker: e.isActive('marker'),
      markerColor: (e.getAttributes('marker')['color'] as string | null | undefined) ?? null,
      bulletList: e.isActive('bulletList'),
      orderedList: e.isActive('orderedList'),
    }),
  });

  const toolbarRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const toolbar = toolbarRef.current;
    if (!toolbar) return;
    toolbarsByEditor.set(editor, toolbar);
    return () => {
      if (toolbarsByEditor.get(editor) === toolbar) toolbarsByEditor.delete(editor);
    };
  }, [editor]);

  const commands = useMemo<TextFormatCommands>(
    () => ({
      toggleBold: () => editor.chain().focus().toggleBold().run(),
      toggleItalic: () => editor.chain().focus().toggleItalic().run(),
      toggleUnderline: () => editor.chain().focus().toggleUnderline().run(),
      setAccent: (color) => editor.chain().focus().setAccent(color).run(),
      previewAccent: (color) => editor.chain().setAccent(color).run(),
      removeAccent: () => editor.chain().focus().unsetAccent().run(),
      setMarker: (color) => editor.chain().focus().setMarker(color).run(),
      previewMarker: (color) => editor.chain().setMarker(color).run(),
      removeMarker: () => editor.chain().focus().unsetMarker().run(),
      toggleBulletList: () => editor.chain().focus().toggleBulletList().run(),
      toggleOrderedList: () => editor.chain().focus().toggleOrderedList().run(),
    }),
    [editor]
  );

  // Zurück in den Text — oder, wer woanders hinklickt, beendet ihn.
  const leaveColorField = (e: FocusEvent<HTMLInputElement>) => {
    if (keepsEditing(e.relatedTarget) || editor.view.dom.contains(e.relatedTarget as Node)) return;
    editor.chain().focus().blur().run();
  };

  return (
    <TextFormatButtons
      state={state}
      commands={commands}
      marks={marks}
      variant={variant}
      toolbarRef={toolbarRef}
      onColorFieldBlur={leaveColorField}
    />
  );
}
