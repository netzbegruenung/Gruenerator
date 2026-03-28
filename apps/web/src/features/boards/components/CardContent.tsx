import { getRobotAvatarPath } from '@gruenerator/shared/avatar';
import { Badge } from '@gruenerator/ui';
import { memo, useCallback, useMemo } from 'react';
import { FiFileText, FiMessageSquare } from 'react-icons/fi';

import { useCardActivity } from '../context/BoardAwarenessContext';
import { FIELD_IDS } from '../types';

import type { Row, Field, SelectOption, CardAssignee } from '../types';

import { cn } from '@/utils/cn';

interface CardContentProps {
  row: Row;
  fields: Field[];
  onCardClick: (row: Row) => void;
}

export const CardContent = memo(function CardContent({
  row,
  fields,
  onCardClick,
}: CardContentProps) {
  const handleClick = useCallback(() => onCardClick(row), [onCardClick, row]);
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') onCardClick(row);
    },
    [onCardClick, row]
  );

  const cardActivity = useCardActivity(row.id);
  const activeUser = cardActivity[0] ?? null;
  const isBeingEdited = activeUser?.selectedCardId === row.id;
  const isBeingDragged = activeUser?.draggedCardId === row.id;

  const title = (row.cells[FIELD_IDS.TITLE] as string) || '';
  const description = (row.cells[FIELD_IDS.DESCRIPTION] as string) || '';
  const dueDate = row.cells[FIELD_IDS.DUE_DATE] as string | null;
  const labelIds = (row.cells[FIELD_IDS.LABELS] ?? []) as string[];
  const assigneeRaw = row.cells[FIELD_IDS.ASSIGNEE] as string | null;
  const assignee: CardAssignee | null = useMemo(() => {
    if (!assigneeRaw) return null;
    try {
      return JSON.parse(assigneeRaw) as CardAssignee;
    } catch {
      return assigneeRaw ? { id: '', name: assigneeRaw, avatarRobotId: 1 } : null;
    }
  }, [assigneeRaw]);

  const linkedDocsCount = useMemo(() => {
    try {
      const raw = row.cells[FIELD_IDS.LINKED_DOCS];
      const docs = typeof raw === 'string' ? JSON.parse(raw) : [];
      return Array.isArray(docs) ? docs.length : 0;
    } catch {
      return 0;
    }
  }, [row.cells]);

  const commentCount = useMemo(() => {
    const raw = row.cells[FIELD_IDS.COMMENTS];
    if (!raw || typeof raw !== 'string') return 0;
    try {
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr.length : 0;
    } catch {
      return 0;
    }
  }, [row.cells]);

  const labelsField = useMemo(() => fields.find((f) => f.id === FIELD_IDS.LABELS), [fields]);
  const labelOptions = useMemo(() => {
    if (!labelsField) return [];
    const options = (labelsField.typeOptions.options ?? []) as SelectOption[];
    return options.filter((o) => labelIds.includes(o.id));
  }, [labelsField, labelIds]);

  const formattedDate = useMemo(
    () =>
      dueDate
        ? new Date(dueDate).toLocaleDateString('de-DE', { day: '2-digit', month: 'short' })
        : null,
    [dueDate]
  );

  const isOverdue = useMemo(
    () => (dueDate ? new Date(dueDate) < new Date(new Date().toDateString()) : false),
    [dueDate]
  );
  const isDueSoon = useMemo(
    () => (dueDate && !isOverdue ? new Date(dueDate) <= new Date(Date.now() + 86_400_000) : false),
    [dueDate, isOverdue]
  );

  return (
    <div
      className="relative px-3 py-2.5 cursor-pointer transition-all"
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      style={{
        borderLeft: activeUser ? `3px solid ${activeUser.user.color}` : undefined,
        opacity: isBeingDragged ? 0.4 : undefined,
      }}
    >
      {row.coverColor && (
        <div
          className="absolute inset-x-0 top-0 h-1.5 rounded-t-[5px]"
          style={{ backgroundColor: row.coverColor }}
        />
      )}

      {isBeingEdited && activeUser && (
        <div
          className="absolute -top-1.5 -right-1.5 flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-medium text-white shadow-sm z-10"
          style={{ backgroundColor: activeUser.user.color }}
          title={`${activeUser.user.name} bearbeitet`}
        >
          <img
            src={getRobotAvatarPath(activeUser.user.avatarRobotId ?? 1)}
            alt=""
            className="w-3.5 h-3.5 rounded-full"
          />
        </div>
      )}

      {labelOptions.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-1.5">
          {labelOptions.map((label) => (
            <span
              key={label.id}
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ring-grey-200 dark:ring-grey-600 text-foreground"
            >
              <span
                className="inline-block w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: label.color }}
              />
              {label.name}
            </span>
          ))}
        </div>
      )}

      <p className="text-sm text-foreground m-0 leading-snug font-medium">
        {row.icon && <span className="mr-1">{row.icon}</span>}
        {title}
      </p>

      {description && (
        <p className="text-xs text-grey-500 m-0 mt-1 line-clamp-2 leading-relaxed">{description}</p>
      )}

      {(formattedDate || linkedDocsCount > 0 || commentCount > 0 || assignee) && (
        <div className="mt-1.5 flex items-center gap-1.5">
          {formattedDate && (
            <Badge
              variant="outline"
              className={cn(
                'text-[10px] py-0.5 px-1.5 font-normal',
                isOverdue &&
                  'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800',
                isDueSoon &&
                  'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800'
              )}
            >
              {formattedDate}
            </Badge>
          )}
          {linkedDocsCount > 0 && (
            <span className="inline-flex items-center gap-0.5 text-[10px] text-grey-400">
              <FiFileText size={10} />
              {linkedDocsCount}
            </span>
          )}
          {commentCount > 0 && (
            <span className="inline-flex items-center gap-0.5 text-[10px] text-grey-400">
              <FiMessageSquare size={10} />
              {commentCount}
            </span>
          )}
          {assignee && (
            <span className="inline-flex items-center gap-1 ml-auto">
              <img
                src={getRobotAvatarPath(assignee.avatarRobotId ?? 1)}
                alt=""
                className="w-4 h-4 rounded-full"
              />
              <span className="text-[10px] text-grey-400 truncate max-w-[60px]">
                {assignee.name}
              </span>
            </span>
          )}
        </div>
      )}
    </div>
  );
});
