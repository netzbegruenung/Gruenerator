import { EditableTitle } from '@gruenerator/shared/components/EditableTitle';
import { Badge } from '@gruenerator/ui';
import { memo, useCallback, useMemo } from 'react';
import { FiCheckSquare, FiFileText, FiMessageSquare } from 'react-icons/fi';

import { useCardActivity } from '../context/BoardAwarenessContext';
import { checklistProgress, FIELD_IDS, parseAssignees, parseChecklists } from '../types';

import type { Row, Field, SelectOption } from '../types';

import { RobotAvatar } from '@/components/common/RobotAvatar';
import { cn } from '@/utils/cn';

interface CardContentProps {
  row: Row;
  fields: Field[];
  onCardClick: (row: Row) => void;
  onRenameCard: (rowId: string, title: string) => void;
}

export const CardContent = memo(function CardContent({
  row,
  fields,
  onCardClick,
  onRenameCard,
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
  const assignees = useMemo(() => parseAssignees(row.cells[FIELD_IDS.ASSIGNEE]), [row.cells]);

  const checklist = useMemo(
    () => checklistProgress(parseChecklists(row.cells[FIELD_IDS.CHECKLIST])),
    [row.cells]
  );

  const linkedDocsCount = useMemo(() => {
    try {
      const raw = row.cells[FIELD_IDS.LINKED_DOCS];
      const docs: unknown = typeof raw === 'string' ? JSON.parse(raw) : [];
      return Array.isArray(docs) ? docs.length : 0;
    } catch {
      return 0;
    }
  }, [row.cells]);

  const commentCount = useMemo(() => {
    const raw = row.cells[FIELD_IDS.COMMENTS];
    if (!raw || typeof raw !== 'string') return 0;
    try {
      const arr: unknown = JSON.parse(raw);
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
        opacity: isBeingDragged ? 0.4 : row.archivedAt ? 0.6 : undefined,
      }}
    >
      {row.coverImageUrl ? (
        <img
          src={row.coverImageUrl}
          alt=""
          className="mb-1.5 -mx-3 -mt-2.5 h-20 w-[calc(100%+1.5rem)] rounded-t-[5px] object-cover"
        />
      ) : (
        row.coverColor && (
          <div
            className="absolute inset-x-0 top-0 h-1.5 rounded-t-[5px]"
            style={{ backgroundColor: row.coverColor }}
          />
        )
      )}

      {isBeingEdited && activeUser && (
        <div
          className="absolute -top-1.5 -right-1.5 flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-medium text-white shadow-sm z-10"
          style={{ backgroundColor: activeUser.user.color }}
          title={`${activeUser.user.name} bearbeitet`}
        >
          <RobotAvatar
            robotId={activeUser.user.avatarRobotId ?? 1}
            displayName={activeUser.user.name}
            sizePx={14}
            className="w-3.5 h-3.5"
            alt=""
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

      {row.archivedAt && (
        <Badge
          variant="outline"
          className="mb-1 text-[10px] py-0.5 px-1.5 font-normal text-grey-500"
        >
          Archiviert
        </Badge>
      )}

      <p className="text-sm text-foreground m-0 leading-snug font-medium">
        {row.icon && <span className="mr-1">{row.icon}</span>}
        <EditableTitle
          as="span"
          title={title}
          editable
          activateOn="doubleClick"
          onTitleChange={(newTitle) => onRenameCard(row.id, newTitle)}
          className="text-sm text-foreground font-medium"
          inputClassName="w-full p-0 text-sm text-foreground font-medium bg-transparent border-none outline-none"
          editableClassName="cursor-pointer"
        />
      </p>

      {description && (
        <p className="text-xs text-grey-500 m-0 mt-1 line-clamp-2 leading-relaxed">{description}</p>
      )}

      {(formattedDate ||
        linkedDocsCount > 0 ||
        commentCount > 0 ||
        checklist.total > 0 ||
        assignees.length > 0) && (
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
          {checklist.total > 0 && (
            <span
              className={cn(
                'inline-flex items-center gap-0.5 text-[10px]',
                checklist.done === checklist.total ? 'text-primary-600' : 'text-grey-400'
              )}
            >
              <FiCheckSquare size={10} />
              {checklist.done}/{checklist.total}
            </span>
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
          {assignees.length > 0 && (
            <span className="inline-flex items-center ml-auto pl-1">
              {assignees.slice(0, 3).map((a, i) => (
                <RobotAvatar
                  key={`${a.id}-${a.name}`}
                  robotId={a.avatarRobotId ?? 1}
                  displayName={a.name}
                  sizePx={16}
                  className={cn(
                    'w-4 h-4 rounded-full ring-1 ring-white dark:ring-grey-900',
                    i > 0 && '-ml-1.5'
                  )}
                  alt={a.name}
                />
              ))}
              {assignees.length > 3 && (
                <span className="-ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-grey-200 dark:bg-grey-700 px-1 text-[9px] text-grey-500 ring-1 ring-white dark:ring-grey-900">
                  +{assignees.length - 3}
                </span>
              )}
            </span>
          )}
        </div>
      )}
    </div>
  );
});
