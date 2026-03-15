import { memo, useCallback, useMemo } from 'react';
import { FiCalendar } from 'react-icons/fi';

import { FIELD_IDS } from '../types';

import type { Field, Row, RowGroup, SelectOption, CellValue } from '../types';
import type { DragEndEvent } from '@dnd-kit/core';

import {
  ListProvider,
  ListGroup,
  ListHeader,
  ListItems,
  ListItem,
} from '@/components/kibo-ui/list';
import { Badge } from '@/components/ui/badge';

interface BoardListViewProps {
  fields: Field[];
  groups: RowGroup[];
  onRowClick: (row: Row) => void;
  onCellUpdate: (rowId: string, fieldId: string, value: CellValue) => void;
}

export const BoardListView = memo(function BoardListView({
  fields,
  groups,
  onRowClick,
  onCellUpdate,
}: BoardListViewProps) {
  const labelsField = useMemo(() => fields.find((f) => f.id === FIELD_IDS.LABELS), [fields]);
  const labelOptions = useMemo(
    () => (labelsField?.typeOptions.options ?? []) as SelectOption[],
    [labelsField]
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over) return;
      const rowId = String(active.id);
      const targetGroupId = String(over.id);
      const parentGroupId = (active.data.current as { parent?: string })?.parent;
      if (parentGroupId !== targetGroupId) {
        onCellUpdate(rowId, FIELD_IDS.STATUS, targetGroupId);
      }
    },
    [onCellUpdate]
  );

  return (
    <div className="flex-1 overflow-auto p-md sm:p-lg">
      <ListProvider
        onDragEnd={handleDragEnd}
        className="gap-0 rounded-lg border border-grey-200 dark:border-grey-700 overflow-hidden"
      >
        {groups.map((group) => (
          <ListGroup key={group.groupId} id={group.groupId}>
            <ListHeader name={group.groupName} color={group.groupColor} />
            <ListItems>
              {group.rows.map((row, index) => {
                const title = (row.cells[FIELD_IDS.TITLE] as string) || '';
                const description = (row.cells[FIELD_IDS.DESCRIPTION] as string) || '';
                const dueDate = row.cells[FIELD_IDS.DUE_DATE] as string | null;
                const rowLabelIds = (row.cells[FIELD_IDS.LABELS] ?? []) as string[];
                const rowLabels = labelOptions.filter((o) => rowLabelIds.includes(o.id));

                return (
                  <ListItem
                    key={row.id}
                    id={row.id}
                    name={title}
                    index={index}
                    parent={group.groupId}
                    className="border-grey-200 dark:border-[#333] bg-background-pure dark:bg-[#282828] shadow-[0_1px_3px_rgba(0,0,0,0.04)] dark:shadow-none"
                  >
                    <div
                      className="flex-1 cursor-pointer min-w-0"
                      onClick={() => onRowClick(row)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') onRowClick(row);
                      }}
                      role="button"
                      tabIndex={0}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground truncate">
                          {title}
                        </span>
                        {rowLabels.length > 0 && (
                          <div className="flex gap-1 shrink-0">
                            {rowLabels.slice(0, 2).map((l) => (
                              <span
                                key={l.id}
                                className="inline-block w-2 h-2 rounded-full"
                                style={{ backgroundColor: l.color }}
                                title={l.name}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                      {(description || dueDate) && (
                        <div className="flex items-center gap-2 mt-0.5">
                          {description && (
                            <span className="text-xs text-grey-400 truncate max-w-[300px]">
                              {description}
                            </span>
                          )}
                          {dueDate && (
                            <Badge
                              variant="outline"
                              className="text-[10px] py-0 px-1.5 font-normal shrink-0"
                            >
                              <FiCalendar size={9} className="mr-1" />
                              {new Date(dueDate).toLocaleDateString('de-DE', {
                                day: '2-digit',
                                month: 'short',
                              })}
                            </Badge>
                          )}
                        </div>
                      )}
                    </div>
                  </ListItem>
                );
              })}
            </ListItems>
          </ListGroup>
        ))}
      </ListProvider>
    </div>
  );
});
