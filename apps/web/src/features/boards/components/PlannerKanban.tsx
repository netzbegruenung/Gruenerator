import { memo, useState, useCallback, useMemo } from 'react';
import { FiPlus } from 'react-icons/fi';

import { BoardAwarenessProvider } from '../context/BoardAwarenessContext';
import { useBoardAwareness } from '../hooks/useBoardAwareness';
import { FIELD_IDS } from '../types';
import { COLUMN_COLORS } from '../utils/boardDefaults';

import { AddCardButton } from './AddCardButton';
import { BoardCursorLayer } from './BoardCursorLayer';
import { CardContent } from './CardContent';
import { CardDetailPanel } from './CardDetailPanel';
import { ColumnHeader } from './ColumnHeader';

import type { Field, Row, RowGroup, BoardView, SelectOption, CellValue } from '../types';
import type { DragStartEvent, DragEndEvent, DragOverEvent } from '@dnd-kit/core';
import type { HocuspocusProvider } from '@hocuspocus/provider';

import {
  KanbanProvider,
  KanbanBoard,
  KanbanHeader,
  KanbanCards,
  KanbanCard,
} from '@/components/kibo-ui/kanban';

// Adapter: kibo-ui Kanban expects items with `id`, `name`, `column` + Record<string, unknown>
type KanbanItem = {
  id: string;
  name: string;
  column: string;
  row: Row;
} & Record<string, unknown>;

function rowsToKanbanItems(groups: RowGroup[]): KanbanItem[] {
  const items: KanbanItem[] = [];
  for (const group of groups) {
    for (const row of group.rows) {
      items.push({
        id: row.id,
        name: (row.cells[FIELD_IDS.TITLE] as string) || '',
        column: group.groupId,
        row,
      });
    }
  }
  return items;
}

function groupsToColumns(groups: RowGroup[]) {
  return groups.map((g) => ({
    id: g.groupId,
    name: g.groupName,
    color: g.groupColor,
  }));
}

// ---------------------------------------------------------------------------

interface ColumnBoardProps {
  groupId: string;
  groupName: string;
  groupColor: string;
  cardCount: number;
  statusField: Field | undefined;
  onRenameGroup: (groupId: string, name: string) => void;
  onDeleteGroup: (groupId: string) => void;
  onColorChange: (groupId: string, color: string) => void;
  handleAddCard: (groupId: string, name: string) => void;
  onCardClick: (row: Row) => void;
  fields: Field[];
}

const ColumnBoard = memo(function ColumnBoard({
  groupId,
  groupName,
  groupColor,
  cardCount,
  onRenameGroup,
  onDeleteGroup,
  onColorChange,
  handleAddCard,
  onCardClick,
  fields,
}: ColumnBoardProps) {
  const onRename = useCallback(
    (name: string) => onRenameGroup(groupId, name),
    [onRenameGroup, groupId]
  );
  const onDelete = useCallback(() => onDeleteGroup(groupId), [onDeleteGroup, groupId]);
  const onColor = useCallback(
    (color: string) => onColorChange(groupId, color),
    [onColorChange, groupId]
  );
  const onAdd = useCallback(
    (name: string) => handleAddCard(groupId, name),
    [handleAddCard, groupId]
  );

  const column = useMemo(
    () => ({ id: groupId, name: groupName, color: groupColor }),
    [groupId, groupName, groupColor]
  );

  return (
    <KanbanBoard id={groupId}>
      <KanbanHeader>
        <ColumnHeader
          column={column}
          columnId={groupId}
          cardCount={cardCount}
          onRename={onRename}
          onDelete={onDelete}
          onColorChange={onColor}
        />
      </KanbanHeader>
      <KanbanCards<KanbanItem> id={groupId}>
        {(item) => (
          <KanbanCard<KanbanItem> key={item.id} {...item}>
            <CardContent row={item.row} fields={fields} onCardClick={onCardClick} />
          </KanbanCard>
        )}
      </KanbanCards>
      <AddCardButton onAdd={onAdd} />
    </KanbanBoard>
  );
});

// ---------------------------------------------------------------------------

interface PlannerKanbanProps {
  fields: Field[];
  groups: RowGroup[];
  activeView: BoardView | null;
  onDragReorder: (rows: Row[], groupByFieldId: string) => void;
  addRow: (row: Row) => void;
  updateRow: (rowId: string, updates: Partial<Row>) => void;
  updateRowCell: (rowId: string, fieldId: string, value: CellValue) => void;
  deleteRow: (rowId: string) => void;
  updateField: (fieldId: string, updates: Partial<Field>) => void;
  removeField: (fieldId: string) => void;
  currentUserId: string;
  groupId?: string;
  provider?: HocuspocusProvider | null;
}

export function PlannerKanban({
  fields,
  groups,
  activeView,
  onDragReorder,
  addRow,
  updateRow,
  updateRowCell,
  deleteRow,
  updateField,
  currentUserId,
  groupId,
  provider,
}: PlannerKanbanProps) {
  const [selectedRow, setSelectedRow] = useState<Row | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const {
    remoteCursors,
    remoteActivities,
    containerRef,
    onMouseMove,
    onMouseLeave,
    broadcastActivity,
  } = useBoardAwareness(provider ?? null);

  const groupByFieldId = activeView?.groupByFieldId ?? FIELD_IDS.STATUS;
  const statusField = useMemo(
    () => fields.find((f) => f.id === groupByFieldId),
    [fields, groupByFieldId]
  );

  const kanbanItems = useMemo(() => rowsToKanbanItems(groups), [groups]);
  const kanbanColumns = useMemo(() => groupsToColumns(groups), [groups]);

  const handleCardClick = useCallback(
    (row: Row) => {
      setSelectedRow(row);
      setDetailOpen(true);
      broadcastActivity({ selectedCardId: row.id });
    },
    [broadcastActivity]
  );

  const handleDetailClose = useCallback(
    (open: boolean) => {
      setDetailOpen(open);
      if (!open) broadcastActivity({ selectedCardId: null });
    },
    [broadcastActivity]
  );

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      broadcastActivity({ draggedCardId: String(event.active.id) });
    },
    [broadcastActivity]
  );

  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      if (event.over) broadcastActivity({ dragTargetColumnId: String(event.over.id) });
    },
    [broadcastActivity]
  );

  const handleDragEnd = useCallback(
    (_event: DragEndEvent) => {
      broadcastActivity({ draggedCardId: null, dragTargetColumnId: null });
    },
    [broadcastActivity]
  );

  const handleDataChange = useCallback(
    (newItems: KanbanItem[]) => {
      // Map kanban items back to rows with updated group assignment
      const updatedRows = newItems.map((item) => ({
        ...item.row,
        cells: { ...item.row.cells, [groupByFieldId]: item.column },
      }));
      onDragReorder(updatedRows, groupByFieldId);
    },
    [onDragReorder, groupByFieldId]
  );

  const handleAddCard = useCallback(
    (targetGroupId: string, name: string) => {
      addRow({
        id: `row-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        cells: {
          [FIELD_IDS.TITLE]: name,
          [groupByFieldId]: targetGroupId,
          [FIELD_IDS.DESCRIPTION]: '',
          [FIELD_IDS.DUE_DATE]: null,
          [FIELD_IDS.LABELS]: [],
          [FIELD_IDS.ASSIGNEE]: '',
          [FIELD_IDS.LINKED_DOCS]: '[]',
        },
        createdBy: currentUserId,
        createdAt: new Date().toISOString(),
      });
    },
    [addRow, currentUserId, groupByFieldId]
  );

  const handleAddColumn = useCallback(() => {
    if (!statusField) return;
    const options = (statusField.typeOptions.options ?? []) as SelectOption[];
    const newOptId = `status-${Date.now()}`;
    const newOption: SelectOption = {
      id: newOptId,
      name: 'Neue Spalte',
      color: COLUMN_COLORS[options.length % COLUMN_COLORS.length],
    };
    updateField(statusField.id, {
      typeOptions: { ...statusField.typeOptions, options: [...options, newOption] },
    });
  }, [statusField, updateField]);

  const handleRenameGroup = useCallback(
    (optionId: string, name: string) => {
      if (!statusField) return;
      const options = (statusField.typeOptions.options ?? []) as SelectOption[];
      updateField(statusField.id, {
        typeOptions: {
          ...statusField.typeOptions,
          options: options.map((o) => (o.id === optionId ? { ...o, name } : o)),
        },
      });
    },
    [statusField, updateField]
  );

  const handleDeleteGroup = useCallback(
    (optionId: string) => {
      if (!statusField) return;
      const options = (statusField.typeOptions.options ?? []) as SelectOption[];
      updateField(statusField.id, {
        typeOptions: {
          ...statusField.typeOptions,
          options: options.filter((o) => o.id !== optionId),
        },
      });
    },
    [statusField, updateField]
  );

  const handleColorChange = useCallback(
    (optionId: string, color: string) => {
      if (!statusField) return;
      const options = (statusField.typeOptions.options ?? []) as SelectOption[];
      updateField(statusField.id, {
        typeOptions: {
          ...statusField.typeOptions,
          options: options.map((o) => (o.id === optionId ? { ...o, color } : o)),
        },
      });
    },
    [statusField, updateField]
  );

  const cardCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const group of groups) {
      counts.set(group.groupId, group.rows.length);
    }
    return counts;
  }, [groups]);

  return (
    <BoardAwarenessProvider value={remoteActivities}>
      <div
        ref={containerRef}
        className="relative z-10 flex-1 overflow-x-scroll overflow-y-hidden p-md sm:p-lg"
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
      >
        <BoardCursorLayer cursors={remoteCursors} containerRef={containerRef} />
        <KanbanProvider<KanbanItem, { id: string; name: string; color: string }>
          columns={kanbanColumns}
          data={kanbanItems}
          onDataChange={handleDataChange}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
          className="items-start"
          after={
            <button
              onClick={handleAddColumn}
              className="flex items-center justify-center w-8 h-8 mt-2 shrink-0 rounded-lg bg-transparent text-grey-400 hover:text-foreground hover:bg-grey-200 dark:hover:bg-[#2a2a2a] cursor-pointer transition-colors border-none"
              title="Spalte hinzufügen"
            >
              <FiPlus size={16} />
            </button>
          }
        >
          {(column) => (
            <ColumnBoard
              key={column.id}
              groupId={column.id}
              groupName={column.name}
              groupColor={column.color}
              cardCount={cardCounts.get(column.id) || 0}
              statusField={statusField}
              onRenameGroup={handleRenameGroup}
              onDeleteGroup={handleDeleteGroup}
              onColorChange={handleColorChange}
              handleAddCard={handleAddCard}
              onCardClick={handleCardClick}
              fields={fields}
            />
          )}
        </KanbanProvider>
      </div>

      <CardDetailPanel
        row={selectedRow}
        fields={fields}
        open={detailOpen}
        onOpenChange={handleDetailClose}
        onUpdateCell={updateRowCell}
        onUpdateRow={updateRow}
        onDelete={deleteRow}
        onUpdateField={updateField}
        groupId={groupId}
      />
    </BoardAwarenessProvider>
  );
}
