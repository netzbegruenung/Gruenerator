/**
 * TextFormatControls — Fett, Kursiv, Unterstrichen, Aufzählung, Nummerierung.
 *
 * EINE Definition, zwei Wirte: die schwebende Karte über dem Text (dort, wo es
 * keine Kopfleiste gibt — `StandaloneCanvas`) und die Kontextleiste der
 * Kopfleiste, wo die Knöpfe neben Farbe, Schriftgröße und Ausrichtung stehen.
 * `variant` wählt nur das Aussehen; welche Knöpfe erscheinen und was sie tun,
 * steht genau einmal hier.
 */
import { useEditorState, type Editor } from '@tiptap/react';
import clsx from 'clsx';
import { type ReactNode } from 'react';
import { FiBold, FiItalic, FiList, FiUnderline } from 'react-icons/fi';
import { MdFormatListNumbered } from 'react-icons/md';

import { type FontMarkSupport } from '../utils/fontMarkSupport';

export type TextFormatVariant = 'floating' | 'contextBar';

export interface TextFormatControlsProps {
  editor: Editor;
  /**
   * Welche Schnitt-Auszeichnung die Schrift des Feldes wirklich tragen kann.
   * Unterstreichung und Listen stehen nicht darin: die brauchen keinen
   * Schnitt und gelten überall.
   */
  marks: FontMarkSupport;
  variant?: TextFormatVariant;
}

// Die Kontextleiste übernimmt die Maße ihrer Nachbarn (`ICON_BTN` in
// ContextControls), damit die Gruppe nicht aus der Reihe fällt.
const BUTTON_CLASS: Record<TextFormatVariant, string> = {
  floating:
    'flex h-7 w-7 cursor-pointer items-center justify-center rounded-sm border-none bg-transparent text-[var(--editor-text-secondary)] transition-colors hover:bg-[var(--editor-surface-hover)] hover:text-[var(--editor-text)] [&_svg]:h-4 [&_svg]:w-4',
  contextBar:
    'inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md border-none bg-transparent text-[var(--editor-text)] transition-colors duration-150 hover:bg-[var(--editor-surface-hover)] hover:text-[var(--editor-active-fg)] [&_svg]:h-4 [&_svg]:w-4',
};

const GROUP_CLASS: Record<TextFormatVariant, string> = {
  floating: 'flex items-center gap-0.5 px-1 py-0.5',
  contextBar: 'flex items-center gap-0.5',
};

interface ToolbarButtonProps {
  onClick: () => void;
  isActive: boolean;
  label: string;
  variant: TextFormatVariant;
  children: ReactNode;
}

function ToolbarButton({ onClick, isActive, label, variant, children }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      // preventDefault hält Auswahl und Fokus im Editor, während man klickt —
      // sonst schlösse ein Blur den Editor, bevor der Klick ankommt. In der
      // Kopfleiste wiegt das schwerer als in der schwebenden Karte: sie liegt
      // weit vom Text entfernt, der Weg dorthin führt über die Leinwand.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      aria-label={label}
      aria-pressed={isActive}
      title={label}
      className={clsx(
        BUTTON_CLASS[variant],
        isActive && 'bg-[var(--editor-active-bg)] text-[var(--editor-active-fg)]'
      )}
    >
      {children}
    </button>
  );
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
      bulletList: e.isActive('bulletList'),
      orderedList: e.isActive('orderedList'),
    }),
  });

  return (
    <div role="toolbar" aria-label="Textformatierung" className={GROUP_CLASS[variant]}>
      {marks.bold && (
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBold().run()}
          isActive={state.bold}
          label="Fett (⌘B)"
          variant={variant}
        >
          <FiBold />
        </ToolbarButton>
      )}
      {marks.italic && (
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleItalic().run()}
          isActive={state.italic}
          label="Kursiv (⌘I)"
          variant={variant}
        >
          <FiItalic />
        </ToolbarButton>
      )}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        isActive={state.underline}
        label="Unterstrichen (⌘U)"
        variant={variant}
      >
        <FiUnderline />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        isActive={state.bulletList}
        label="Aufzählung"
        variant={variant}
      >
        <FiList />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        isActive={state.orderedList}
        label="Nummerierte Liste"
        variant={variant}
      >
        <MdFormatListNumbered />
      </ToolbarButton>
    </div>
  );
}
