import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@gruenerator/ui';
import { memo, useState } from 'react';
import { FiMoreVertical, FiTrash2, FiEdit2, FiEyeOff } from 'react-icons/fi';

import { useColumnActivity } from '../context/BoardAwarenessContext';
import { COLUMN_COLORS } from '../utils/boardDefaults';

interface ColumnData {
  id: string;
  name: string;
  color: string;
}

interface ColumnHeaderProps {
  column: ColumnData;
  columnId: string;
  cardCount: number;
  onRename: (name: string) => void;
  onDelete: () => void;
  onHide?: () => void;
  onColorChange: (color: string) => void;
}

export const ColumnHeader = memo(function ColumnHeader({
  column,
  columnId,
  cardCount,
  onRename,
  onDelete,
  onHide,
  onColorChange,
}: ColumnHeaderProps) {
  const columnActivity = useColumnActivity(columnId);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(column.name);

  const handleSubmit = () => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== column.name) {
      onRename(trimmed);
    }
    setIsEditing(false);
  };

  return (
    <div className="flex items-center gap-xs px-3 py-2">
      {column.color !== 'transparent' && (
        <div
          className="w-2.5 h-2.5 rounded-full shrink-0"
          style={{ backgroundColor: column.color }}
        />
      )}

      {isEditing ? (
        <input
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleSubmit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSubmit();
            if (e.key === 'Escape') setIsEditing(false);
          }}
          autoFocus
          className="flex-1 text-sm font-semibold bg-transparent border-none outline-none text-foreground"
        />
      ) : (
        <span className="flex-1 text-sm font-semibold text-foreground truncate">{column.name}</span>
      )}

      <span className="text-xs text-grey-400 tabular-nums">{cardCount}</span>

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
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onClick={() => {
              setEditValue(column.name);
              setIsEditing(true);
            }}
          >
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
          {onHide && (
            <DropdownMenuItem onClick={onHide}>
              <FiEyeOff className="mr-2" size={14} />
              Spalte ausblenden
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
