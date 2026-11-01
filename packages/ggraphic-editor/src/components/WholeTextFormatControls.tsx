// SPDX-License-Identifier: MPL-2.0
/**
 * WholeTextFormatControls — dieselben Knöpfe wie im Editor (`TextFormatButtons`),
 * für einen Text, der nur ausgewählt ist. Es gibt keine Auswahl IM Text, also
 * gilt jeder Klick für den ganzen Text: ein Knopf steht, wenn der ganze Text die
 * Auszeichnung trägt, und der nächste Klick nimmt sie ihm wieder.
 *
 * Gelesen und geschrieben wird der gespeicherte Feldtext
 * (`@ggraphic/schema`, `wholeTextFormat.ts`); es braucht keinen Editor und kein
 * tiptap. Der Wirt schreibt das Ergebnis in einem Schritt zurück.
 */
import {
  setWholeTextList,
  setWholeTextMark,
  wholeTextCanOrderedList,
  wholeTextFormat,
  type WholeTextMark,
} from '@ggraphic/schema';
import { useMemo } from 'react';

import {
  TextFormatButtons,
  type OfferedMarks,
  type TextFormatCommands,
  type TextFormatVariant,
} from './TextFormatButtons.js';

export interface WholeTextFormatControlsProps {
  /** Der gespeicherte Text des Feldes. */
  text: string;
  marks: OfferedMarks;
  /** Nimmt den ganzen neuen Text; wird nicht gerufen, wenn der Klick nichts ändert. */
  onChange: (text: string) => void;
  variant?: TextFormatVariant;
}

export function WholeTextFormatControls({
  text,
  marks,
  onChange,
  variant = 'contextBar',
}: WholeTextFormatControlsProps) {
  const state = useMemo(() => wholeTextFormat(text), [text]);

  const commands = useMemo<TextFormatCommands>(() => {
    const write = (next: string) => {
      if (next !== text) onChange(next);
    };
    const toggle = (mark: WholeTextMark, on: boolean) => write(setWholeTextMark(text, mark, !on));
    return {
      toggleBold: () => toggle('bold', state.bold),
      toggleItalic: () => toggle('italic', state.italic),
      toggleUnderline: () => toggle('underline', state.underline),
      setAccent: (color) => write(setWholeTextMark(text, 'accent', true, color)),
      removeAccent: () => write(setWholeTextMark(text, 'accent', false)),
      setMarker: (color) => write(setWholeTextMark(text, 'marker', true, color)),
      removeMarker: () => write(setWholeTextMark(text, 'marker', false)),
      toggleBulletList: () => write(setWholeTextList(text, state.bulletList ? null : 'bullet')),
      toggleOrderedList: () => write(setWholeTextList(text, state.orderedList ? null : 'ordered')),
    };
  }, [text, state, onChange]);

  return (
    <TextFormatButtons
      state={state}
      commands={commands}
      marks={marks}
      variant={variant}
      orderedListDisabled={!state.orderedList && !wholeTextCanOrderedList(text)}
    />
  );
}
