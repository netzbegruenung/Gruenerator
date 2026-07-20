import { memo } from 'react';
import { PiArrowUp, PiArrowDown, PiCopy, PiSwap, PiTrash } from 'react-icons/pi';

const iconBtn =
  'size-[30px] rounded-lg border-none bg-transparent cursor-pointer flex items-center justify-center text-[var(--editor-text-muted)] transition-[background-color,color] duration-150 hover:bg-[var(--editor-canvas-hover)] hover:text-[var(--editor-text)] disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-[var(--editor-text-muted)]';

interface PageToolbarProps {
  pageIndex: number;
  pageCount: number;
  isActive: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDuplicate: () => void;
  onChangeTemplate?: () => void;
  onDelete?: () => void;
}

export const PageToolbar = memo(function PageToolbar({
  pageIndex,
  pageCount,
  isActive,
  onMoveUp,
  onMoveDown,
  onDuplicate,
  onChangeTemplate,
  onDelete,
}: PageToolbarProps) {
  if (pageCount <= 1) return null;

  const canMoveUp = pageIndex > 0;
  const canMoveDown = pageIndex < pageCount - 1;

  return (
    <div
      className={`flex items-center justify-end gap-1 px-1 py-0.5 rounded-lg transition-opacity duration-200 ${
        isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
      }`}
      onClick={(e) => e.stopPropagation()}
    >
      <span className="text-xs font-medium text-[var(--editor-text-muted)] mr-1 select-none">
        Seite {pageIndex + 1}
      </span>

      <button
        className={iconBtn}
        onClick={onMoveUp}
        disabled={!canMoveUp}
        title="Nach oben verschieben"
        type="button"
      >
        <PiArrowUp size={14} />
      </button>

      <button
        className={iconBtn}
        onClick={onMoveDown}
        disabled={!canMoveDown}
        title="Nach unten verschieben"
        type="button"
      >
        <PiArrowDown size={14} />
      </button>

      <div className="w-px h-4 bg-[var(--editor-border-soft)] mx-0.5" />

      <button className={iconBtn} onClick={onDuplicate} title="Seite duplizieren" type="button">
        <PiCopy size={14} />
      </button>

      {onChangeTemplate && (
        <button className={iconBtn} onClick={onChangeTemplate} title="Vorlage ändern" type="button">
          <PiSwap size={14} />
        </button>
      )}

      {onDelete && (
        <button
          className="size-[30px] rounded-lg border-none bg-transparent cursor-pointer flex items-center justify-center text-[var(--editor-text-muted)] transition-[background-color,color] duration-150 hover:bg-red-500/10 hover:text-red-600"
          onClick={onDelete}
          title="Seite löschen"
          type="button"
        >
          <PiTrash size={14} />
        </button>
      )}
    </div>
  );
});
