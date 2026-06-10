import {
  EditableTitle,
  type EditableTitleHandle,
} from '@gruenerator/shared/components/EditableTitle';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@gruenerator/ui';
import { memo, useRef } from 'react';
import {
  FiMoreVertical,
  FiTrash2,
  FiEdit2,
  FiEyeOff,
  FiCopy,
  FiZap,
  FiChevronLeft,
  FiChevronRight,
} from 'react-icons/fi';

import { useColumnActivity } from '../context/BoardAwarenessContext';
import { COLUMN_COLORS } from '../utils/boardDefaults';

interface ColumnData {
  id: string;
  name: string;
  color: string;
  // Optional WIP limit (A6). When set, the count badge shows `count/limit` and
  // turns red on overflow.
  limit?: number;
}

interface ColumnHeaderProps {
  column: ColumnData;
  columnId: string;
  cardCount: number;
  onRename: (name: string) => void;
  onDelete: () => void;
  onHide?: () => void;
  onColorChange: (color: string) => void;
  onDuplicate?: () => void;
  /** True when this column is a Grünerator-Spalte (carries an aiTask). */
  hasAiTask?: boolean;
  /** Open the AI-column config dialog (create on a plain column, or edit). */
  onConfigureAi?: () => void;
  /** Strip the aiTask from this column (only meaningful when hasAiTask). */
  onRemoveAi?: () => void;
  // WIP limit + reorder are only wired for real status columns (not the
  // synthetic "Ohne Status" bucket).
  onSetLimit?: (limit: number | null) => void;
  onMoveLeft?: () => void;
  onMoveRight?: () => void;
}

export const ColumnHeader = memo(function ColumnHeader({
  column,
  columnId,
  cardCount,
  onRename,
  onDelete,
  onHide,
  onColorChange,
  onDuplicate,
  hasAiTask,
  onConfigureAi,
  onRemoveAi,
  onSetLimit,
  onMoveLeft,
  onMoveRight,
}: ColumnHeaderProps) {
  const columnActivity = useColumnActivity(columnId);
  const titleRef = useRef<EditableTitleHandle>(null);
  const overLimit = column.limit != null && cardCount > column.limit;

  return (
    <div className="flex items-center gap-xs px-3 py-2">
      {column.color !== 'transparent' && (
        <div
          className="w-2.5 h-2.5 rounded-full shrink-0"
          style={{ backgroundColor: column.color }}
        />
      )}

      <EditableTitle
        ref={titleRef}
        as="span"
        title={column.name}
        editable
        activateOn="doubleClick"
        onTitleChange={onRename}
        className="flex-1 text-sm font-semibold text-foreground truncate"
        inputClassName="flex-1 text-sm font-semibold bg-transparent border-none outline-none text-foreground"
        editableClassName="cursor-pointer"
      />

      {hasAiTask && (
        <FiZap
          className="shrink-0 text-primary-600 dark:text-primary-400"
          size={13}
          title="Grünerator-Spalte"
        />
      )}

      <span
        className={`text-xs tabular-nums ${overLimit ? 'font-semibold text-red-600 dark:text-red-400' : 'text-grey-400'}`}
        title={column.limit != null ? `${cardCount} von max. ${column.limit}` : undefined}
      >
        {column.limit != null ? `${cardCount}/${column.limit}` : cardCount}
      </span>

      {columnActivity.length > 0 && (
        <div className="flex -space-x-1">
          {columnActivity.slice(0, 3).map((a) => (
            <div
              key={a.clientId}
              className="w-2.5 h-2.5 rounded-full ring-1 ring-background"
              style={{ backgroundColor: a.user.color }}
              title={a.user.name}
            />
          ))}
        </div>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="p-1.5 sm:p-0.5 rounded hover:bg-grey-100 dark:hover:bg-grey-800 bg-transparent border-none cursor-pointer text-grey-400 hover:text-foreground">
            <FiMoreVertical size={14} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onCloseAutoFocus={(e) => e.preventDefault()}>
          <DropdownMenuItem onClick={() => titleRef.current?.startEdit()}>
            <FiEdit2 className="mr-2" size={14} />
            Umbenennen
          </DropdownMenuItem>
          <div className="px-2 py-1.5">
            <span className="text-xs text-grey-500">Farbe</span>
            <div className="flex gap-1 mt-1 flex-wrap">
              {COLUMN_COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => onColorChange(color)}
                  className="w-6 h-6 sm:w-4 sm:h-4 rounded-full border-none cursor-pointer"
                  style={{
                    backgroundColor: color,
                    outline: column.color === color ? '2px solid currentColor' : 'none',
                    outlineOffset: '1px',
                  }}
                />
              ))}
            </div>
          </div>
          {onSetLimit && (
            <div className="px-2 py-1.5">
              <span className="text-xs text-grey-500">WIP-Limit</span>
              <input
                type="number"
                min={1}
                defaultValue={column.limit ?? ''}
                placeholder="kein Limit"
                onClick={(e) => e.stopPropagation()}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  const n = v === '' ? null : Math.max(1, Math.floor(Number(v)));
                  onSetLimit(n != null && Number.isFinite(n) ? n : null);
                }}
                className="mt-1 w-full rounded border border-grey-200 dark:border-grey-700 bg-transparent px-2 py-1 text-xs outline-none focus:border-primary-500"
              />
            </div>
          )}
          {(onMoveLeft || onMoveRight) && (
            <div className="flex gap-1 px-2 py-1.5">
              <button
                onClick={onMoveLeft}
                disabled={!onMoveLeft}
                className="flex flex-1 items-center justify-center gap-1 rounded px-2 py-1 text-xs text-grey-500 hover:bg-grey-100 dark:hover:bg-grey-800 disabled:opacity-30 disabled:cursor-default bg-transparent border-none cursor-pointer"
                title="Nach links"
              >
                <FiChevronLeft size={14} /> Links
              </button>
              <button
                onClick={onMoveRight}
                disabled={!onMoveRight}
                className="flex flex-1 items-center justify-center gap-1 rounded px-2 py-1 text-xs text-grey-500 hover:bg-grey-100 dark:hover:bg-grey-800 disabled:opacity-30 disabled:cursor-default bg-transparent border-none cursor-pointer"
                title="Nach rechts"
              >
                Rechts <FiChevronRight size={14} />
              </button>
            </div>
          )}
          {onDuplicate && (
            <DropdownMenuItem onClick={onDuplicate}>
              <FiCopy className="mr-2" size={14} />
              Spalte duplizieren
            </DropdownMenuItem>
          )}
          {onHide && (
            <DropdownMenuItem onClick={onHide}>
              <FiEyeOff className="mr-2" size={14} />
              Spalte ausblenden
            </DropdownMenuItem>
          )}
          {onConfigureAi && (
            <DropdownMenuItem onClick={onConfigureAi}>
              <FiZap className="mr-2" size={14} />
              {hasAiTask ? 'Grünerator-Aufgabe bearbeiten' : 'In Grünerator-Spalte umwandeln'}
            </DropdownMenuItem>
          )}
          {hasAiTask && onRemoveAi && (
            <DropdownMenuItem onClick={onRemoveAi}>
              <FiZap className="mr-2" size={14} />
              Grünerator-Aufgabe entfernen
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={onDelete} className="text-red-600">
            <FiTrash2 className="mr-2" size={14} />
            Spalte löschen
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
});
