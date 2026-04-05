import { memo } from 'react';
import { PiArrowUp, PiArrowDown, PiCopy, PiTrash } from 'react-icons/pi';

const iconBtn =
  'size-7 rounded-full border-none bg-transparent cursor-pointer flex items-center justify-center text-grey-400 transition-[background-color,color] duration-150 hover:bg-grey-700 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-grey-400';

interface PageToolbarProps {
  pageIndex: number;
  pageCount: number;
  isActive: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDuplicate: () => void;
  onDelete?: () => void;
}

export const PageToolbar = memo(function PageToolbar({
  pageIndex,
  pageCount,
  isActive,
  onMoveUp,
  onMoveDown,
  onDuplicate,
  onDelete,
}: PageToolbarProps) {
  if (pageCount <= 1) return null;

  const canMoveUp = pageIndex > 0;
  const canMoveDown = pageIndex < pageCount - 1;

  return (
    <div
      className={`flex items-center gap-0.5 px-1 py-0.5 rounded-lg transition-opacity duration-200 ${
        isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
      }`}
      onClick={(e) => e.stopPropagation()}
    >
      <span className="text-xs font-medium text-grey-400 mr-1 select-none">
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

      <div className="w-px h-4 bg-grey-700 mx-0.5" />

      <button className={iconBtn} onClick={onDuplicate} title="Seite duplizieren" type="button">
        <PiCopy size={14} />
      </button>

      {onDelete && (
        <button
          className="size-7 rounded-full border-none bg-transparent cursor-pointer flex items-center justify-center text-grey-400 transition-[background-color,color] duration-150 hover:bg-red-900/50 hover:text-red-400"
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
