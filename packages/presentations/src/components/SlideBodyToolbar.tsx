import { useEditorState, type Editor } from '@tiptap/react';
import { type ComponentType, type ReactNode } from 'react';
import { FiImage } from 'react-icons/fi';
import {
  TbColumnInsertLeft,
  TbColumnInsertRight,
  TbColumnRemove,
  TbLayoutNavbar,
  TbRowInsertBottom,
  TbRowInsertTop,
  TbRowRemove,
  TbTableOff,
  TbTablePlus,
} from 'react-icons/tb';

export interface SlideBodyToolbarProps {
  editor: Editor;
  /** Opens the image dialog; it inserts through `setImage` once confirmed. */
  onRequestImage: () => void;
}

const NEW_TABLE = { rows: 3, cols: 2, withHeaderRow: true } as const;

function ToolButton({
  icon: Icon,
  label,
  onClick,
  disabled,
  children,
}: {
  icon: ComponentType<{ size?: number }>;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="flex h-8 flex-none items-center gap-1.5 rounded-lg border border-[#D4DDD7] bg-white px-2 text-[12.5px] font-bold text-[#2F4238] hover:bg-[#F4F7F5] disabled:opacity-40 dark:border-grey-600 dark:bg-grey-800 dark:text-grey-200 dark:hover:bg-grey-700"
    >
      <Icon size={15} />
      {children}
    </button>
  );
}

function Divider() {
  return <span aria-hidden="true" className="h-5 w-px flex-none bg-[#D4DDD7] dark:bg-grey-600" />;
}

/**
 * Insert controls for the slide body, rendered in the editor chrome rather than
 * over the slide: the surface is a fixed 960×540 box scaled to fit, so a menu
 * drawn inside it would shrink along with the content.
 *
 * The table controls appear only with the caret inside a table — that is where
 * they mean anything, and eight permanently visible buttons would crowd out the
 * two that matter on an empty slide.
 */
export function SlideBodyToolbar({ editor, onRequestImage }: SlideBodyToolbarProps) {
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      inTable: e.isActive('table'),
      canInsertTable: e.can().insertTable(NEW_TABLE),
    }),
  });

  const run = (fn: (chain: ReturnType<Editor['chain']>) => { run: () => boolean }) =>
    fn(editor.chain().focus()).run();

  return (
    <div
      role="toolbar"
      aria-label="Inhalt einfügen"
      className="flex w-full max-w-[1400px] flex-none flex-wrap items-center gap-1.5 pb-2.5"
    >
      <ToolButton
        icon={TbTablePlus}
        label="Tabelle einfügen"
        disabled={!state.canInsertTable}
        onClick={() => run((c) => c.insertTable(NEW_TABLE))}
      >
        Tabelle
      </ToolButton>
      <ToolButton icon={FiImage} label="Bild einfügen" onClick={onRequestImage}>
        Bild
      </ToolButton>

      {state.inTable && (
        <>
          <Divider />
          <ToolButton
            icon={TbRowInsertTop}
            label="Zeile darüber einfügen"
            onClick={() => run((c) => c.addRowBefore())}
          />
          <ToolButton
            icon={TbRowInsertBottom}
            label="Zeile darunter einfügen"
            onClick={() => run((c) => c.addRowAfter())}
          />
          <ToolButton
            icon={TbRowRemove}
            label="Zeile löschen"
            onClick={() => run((c) => c.deleteRow())}
          />
          <Divider />
          <ToolButton
            icon={TbColumnInsertLeft}
            label="Spalte davor einfügen"
            onClick={() => run((c) => c.addColumnBefore())}
          />
          <ToolButton
            icon={TbColumnInsertRight}
            label="Spalte danach einfügen"
            onClick={() => run((c) => c.addColumnAfter())}
          />
          <ToolButton
            icon={TbColumnRemove}
            label="Spalte löschen"
            onClick={() => run((c) => c.deleteColumn())}
          />
          <Divider />
          <ToolButton
            icon={TbLayoutNavbar}
            label="Kopfzeile umschalten"
            onClick={() => run((c) => c.toggleHeaderRow())}
          />
          <ToolButton
            icon={TbTableOff}
            label="Tabelle löschen"
            onClick={() => run((c) => c.deleteTable())}
          />
        </>
      )}
    </div>
  );
}
