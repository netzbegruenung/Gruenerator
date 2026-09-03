import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@gruenerator/ui';
import { memo, useState, useCallback, useEffect, useMemo } from 'react';
import { FiPlus, FiZap } from 'react-icons/fi';
import { useShallow } from 'zustand/react/shallow';

import { AiColumnDialog } from '../aiColumns/AiColumnDialog';
import { BoardAwarenessProvider } from '../context/BoardAwarenessContext';
import { useBoardAwareness } from '../hooks/useBoardAwareness';
import { FIELD_IDS } from '../types';
import { COLUMN_COLORS } from '../utils/boardDefaults';

import { AddCardButton } from './AddCardButton';
import { BoardCursorLayer } from './BoardCursorLayer';
import { CardContent } from './CardContent';
import { CardDetailPanel } from './CardDetailPanel';
import { ColumnHeader } from './ColumnHeader';

import type {
  Field,
  Row,
  RowGroup,
  SwimlaneGroup,
  BoardView,
  SelectOption,
  CellValue,
} from '../types';
import type { DragStartEvent, DragEndEvent, DragOverEvent } from '@dnd-kit/core';
import type { BoardAiTask } from '@gruenerator/contracts';
import type { HocuspocusProvider } from '@hocuspocus/provider';

import {
  KanbanProvider,
  KanbanBoard,
  KanbanHeader,
  KanbanCards,
  KanbanCard,
} from '@/components/kibo-ui/kanban';
import { useAuthStore } from '@/stores/authStore';

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
  // WIP limit + reorder (only meaningful for real status columns).
  limit?: number;
  isRealColumn: boolean;
  canMoveLeft: boolean;
  canMoveRight: boolean;
  onRenameGroup: (groupId: string, name: string) => void;
  onDeleteGroup: (groupId: string) => void;
  onHideGroup: (groupId: string) => void;
  onColorChange: (groupId: string, color: string) => void;
  onDuplicateGroup: (groupId: string) => void;
  onConfigureColumnAi: (groupId: string) => void;
  onRemoveColumnAi: (groupId: string) => void;
  onSetLimit: (groupId: string, limit: number | null) => void;
  onMoveColumn: (groupId: string, dir: 'left' | 'right') => void;
  handleAddCard: (groupId: string, name: string) => void;
  onCardClick: (row: Row) => void;
  onRenameCard: (rowId: string, title: string) => void;
  fields: Field[];
  // When false, the AI-column menu actions are hidden (expert-only).
  expertMode: boolean;
}

const ColumnBoard = memo(function ColumnBoard({
  groupId,
  groupName,
  groupColor,
  cardCount,
  statusField,
  limit,
  isRealColumn,
  canMoveLeft,
  canMoveRight,
  onRenameGroup,
  onDeleteGroup,
  onHideGroup,
  onColorChange,
  onDuplicateGroup,
  onConfigureColumnAi,
  onRemoveColumnAi,
  onSetLimit,
  onMoveColumn,
  handleAddCard,
  onCardClick,
  onRenameCard,
  fields,
  expertMode,
}: ColumnBoardProps) {
  const onRename = useCallback(
    (name: string) => onRenameGroup(groupId, name),
    [onRenameGroup, groupId]
  );
  const onDelete = useCallback(() => onDeleteGroup(groupId), [onDeleteGroup, groupId]);
  const onHide = useCallback(() => onHideGroup(groupId), [onHideGroup, groupId]);
  const onColor = useCallback(
    (color: string) => onColorChange(groupId, color),
    [onColorChange, groupId]
  );
  const onDuplicate = useCallback(() => onDuplicateGroup(groupId), [onDuplicateGroup, groupId]);
  const onConfigureAi = useCallback(
    () => onConfigureColumnAi(groupId),
    [onConfigureColumnAi, groupId]
  );
  const onRemoveAi = useCallback(() => onRemoveColumnAi(groupId), [onRemoveColumnAi, groupId]);
  const onSetLimitCb = useCallback(
    (next: number | null) => onSetLimit(groupId, next),
    [onSetLimit, groupId]
  );
  const onMoveLeft = useCallback(() => onMoveColumn(groupId, 'left'), [onMoveColumn, groupId]);
  const onMoveRight = useCallback(() => onMoveColumn(groupId, 'right'), [onMoveColumn, groupId]);
  const onAdd = useCallback(
    (name: string) => handleAddCard(groupId, name),
    [handleAddCard, groupId]
  );

  const column = useMemo(
    () => ({
      id: groupId,
      name: groupName,
      color: groupColor,
      ...(limit != null ? { limit } : {}),
    }),
    [groupId, groupName, groupColor, limit]
  );

  const hasAiTask = useMemo(() => {
    const options = (statusField?.typeOptions.options ?? []) as SelectOption[];
    return !!options.find((o) => o.id === groupId)?.aiTask;
  }, [statusField, groupId]);

  return (
    <KanbanBoard id={groupId} draggable={isRealColumn}>
      <KanbanHeader>
        <ColumnHeader
          column={column}
          columnId={groupId}
          cardCount={cardCount}
          onRename={onRename}
          onDelete={onDelete}
          onHide={onHide}
          onColorChange={onColor}
          onDuplicate={onDuplicate}
          hasAiTask={hasAiTask}
          onConfigureAi={expertMode ? onConfigureAi : undefined}
          onRemoveAi={expertMode ? onRemoveAi : undefined}
          onSetLimit={isRealColumn ? onSetLimitCb : undefined}
          onMoveLeft={isRealColumn && canMoveLeft ? onMoveLeft : undefined}
          onMoveRight={isRealColumn && canMoveRight ? onMoveRight : undefined}
        />
      </KanbanHeader>
      <KanbanCards<KanbanItem> id={groupId}>
        {(item) => (
          <KanbanCard<KanbanItem> key={item.id} {...item}>
            <CardContent
              row={item.row}
              fields={fields}
              onCardClick={onCardClick}
              onRenameCard={onRenameCard}
            />
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
  // When set (A12, kanban + swimlaneFieldId), rows render as horizontal lanes,
  // each containing the normal columns. Falls back to `groups` when null.
  swimlanes?: SwimlaneGroup[] | null;
  activeView: BoardView | null;
  onDragReorder: (rows: Row[], groupByFieldId: string) => void;
  addRow: (row: Row) => void;
  updateRow: (rowId: string, updates: Partial<Row>) => void;
  updateRowCell: (rowId: string, fieldId: string, value: CellValue) => void;
  deleteRow: (rowId: string) => void;
  duplicateRow: (rowId: string, createdBy: string) => string | null;
  updateField: (fieldId: string, updates: Partial<Field>) => void;
  removeField: (fieldId: string) => void;
  onUpdateView?: (viewId: string, updates: Partial<BoardView>) => void;
  currentUserId: string;
  boardId?: string;
  /** Board name — passed through to the card detail panel breadcrumb. */
  boardTitle?: string;
  provider?: HocuspocusProvider | null;
  // Grünerator-Spalten (AI columns) are expert-only; gates creation + run buttons.
  expertMode?: boolean;
  // When set (e.g. opened from a notification's `?card=` deep link), open the
  // card detail panel for this row, then call onDeepLinkConsumed to clear it.
  deepLinkRow?: Row | null;
  onDeepLinkConsumed?: () => void;
}

export function PlannerKanban({
  fields,
  groups,
  swimlanes,
  activeView,
  onDragReorder,
  addRow,
  updateRow,
  updateRowCell,
  deleteRow,
  duplicateRow,
  updateField,
  onUpdateView,
  currentUserId,
  boardId,
  boardTitle,
  provider,
  expertMode = false,
  deepLinkRow,
  onDeepLinkConsumed,
}: PlannerKanbanProps) {
  const { userName, userAvatarRobotId } = useAuthStore(
    useShallow((s) => ({
      userName: s.user?.display_name ?? '',
      userAvatarRobotId: Number(s.user?.avatar_robot_id) || 1,
    }))
  );
  const [selectedRow, setSelectedRow] = useState<Row | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [aiDialogOpen, setAiDialogOpen] = useState(false);
  const [aiEditingOptionId, setAiEditingOptionId] = useState<string | null>(null);
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

  const hiddenGroupIds = useMemo(
    () => new Set(activeView?.hiddenGroupIds ?? []),
    [activeView?.hiddenGroupIds]
  );
  const visibleGroups = useMemo(
    () => groups.filter((g) => !hiddenGroupIds.has(g.groupId)),
    [groups, hiddenGroupIds]
  );
  const hiddenGroups = useMemo(
    () => groups.filter((g) => hiddenGroupIds.has(g.groupId)),
    [groups, hiddenGroupIds]
  );

  const handleCardClick = useCallback(
    (row: Row) => {
      setSelectedRow(row);
      setDetailOpen(true);
      broadcastActivity({ selectedCardId: row.id });
    },
    [broadcastActivity]
  );

  // Open the detail panel for a deep-linked card (?card=) once the parent has
  // resolved it, then clear the link so closing the panel won't re-trigger.
  useEffect(() => {
    if (deepLinkRow) {
      // One-shot: open the panel for the deep-linked card, then clear the link.
      // A navigation side effect, not derived render state.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedRow(deepLinkRow);
      setDetailOpen(true);
      broadcastActivity({ selectedCardId: deepLinkRow.id });
      onDeepLinkConsumed?.();
    }
  }, [deepLinkRow, broadcastActivity, onDeepLinkConsumed]);

  const handleRenameCard = useCallback(
    (rowId: string, title: string) => updateRowCell(rowId, FIELD_IDS.TITLE, title),
    [updateRowCell]
  );

  const handleDetailClose = useCallback(
    (open: boolean) => {
      setDetailOpen(open);
      if (!open) broadcastActivity({ selectedCardId: null });
    },
    [broadcastActivity]
  );

  const allRows = useMemo(() => visibleGroups.flatMap((g) => g.rows), [visibleGroups]);

  const handlePrevCard = useCallback(() => {
    if (!selectedRow) return;
    const idx = allRows.findIndex((r) => r.id === selectedRow.id);
    if (idx <= 0) return;
    const prev = allRows[idx - 1];
    setSelectedRow(prev);
    broadcastActivity({ selectedCardId: prev.id });
  }, [selectedRow, allRows, broadcastActivity]);

  const handleNextCard = useCallback(() => {
    if (!selectedRow) return;
    const idx = allRows.findIndex((r) => r.id === selectedRow.id);
    if (idx < 0 || idx >= allRows.length - 1) return;
    const next = allRows[idx + 1];
    setSelectedRow(next);
    broadcastActivity({ selectedCardId: next.id });
  }, [selectedRow, allRows, broadcastActivity]);

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

  const swimlaneFieldId = activeView?.swimlaneFieldId;
  const handleAddCard = useCallback(
    (targetGroupId: string, name: string, laneValue?: string) => {
      const cells: Record<string, CellValue> = {
        [FIELD_IDS.TITLE]: name,
        [groupByFieldId]: targetGroupId,
        [FIELD_IDS.DESCRIPTION]: '',
        [FIELD_IDS.DUE_DATE]: null,
        [FIELD_IDS.LABELS]: [],
        [FIELD_IDS.ASSIGNEE]: '',
        [FIELD_IDS.LINKED_DOCS]: '[]',
        [FIELD_IDS.COMMENTS]: '[]',
      };
      if (swimlaneFieldId && laneValue && !laneValue.startsWith('_')) {
        cells[swimlaneFieldId] = laneValue;
      }
      addRow({
        id: `row-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        cells,
        createdBy: currentUserId,
        createdAt: new Date().toISOString(),
      });
    },
    [addRow, currentUserId, groupByFieldId, swimlaneFieldId]
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

  const openAiDialogForNew = useCallback(() => {
    setAiEditingOptionId(null);
    setAiDialogOpen(true);
  }, []);

  const openAiDialogForColumn = useCallback((optionId: string) => {
    setAiEditingOptionId(optionId);
    setAiDialogOpen(true);
  }, []);

  const handleRemoveColumnAi = useCallback(
    (optionId: string) => {
      if (!statusField) return;
      const options = (statusField.typeOptions.options ?? []) as SelectOption[];
      updateField(statusField.id, {
        typeOptions: {
          ...statusField.typeOptions,
          options: options.map((o) => {
            if (o.id !== optionId) return o;
            const next = { ...o };
            delete next.aiTask;
            return next;
          }),
        },
      });
    },
    [statusField, updateField]
  );

  const handleConfirmAiColumn = useCallback(
    (aiTask: BoardAiTask) => {
      if (!statusField) return;
      const options = (statusField.typeOptions.options ?? []) as SelectOption[];
      if (aiEditingOptionId) {
        updateField(statusField.id, {
          typeOptions: {
            ...statusField.typeOptions,
            options: options.map((o) => (o.id === aiEditingOptionId ? { ...o, aiTask } : o)),
          },
        });
      } else {
        const newOption: SelectOption = {
          id: `status-${Date.now()}`,
          name: '✨ Grünerator-Spalte',
          color: COLUMN_COLORS[options.length % COLUMN_COLORS.length],
          aiTask,
        };
        updateField(statusField.id, {
          typeOptions: { ...statusField.typeOptions, options: [...options, newOption] },
        });
      }
    },
    [statusField, updateField, aiEditingOptionId]
  );

  const aiDialogInitial = useMemo(() => {
    if (!aiEditingOptionId) return null;
    const options = (statusField?.typeOptions.options ?? []) as SelectOption[];
    return options.find((o) => o.id === aiEditingOptionId)?.aiTask ?? null;
  }, [aiEditingOptionId, statusField]);

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

  const handleHideGroup = useCallback(
    (groupId: string) => {
      if (!activeView || !onUpdateView) return;
      const current = activeView.hiddenGroupIds ?? [];
      onUpdateView(activeView.id, { hiddenGroupIds: [...current, groupId] });
    },
    [activeView, onUpdateView]
  );

  const handleShowGroup = useCallback(
    (groupId: string) => {
      if (!activeView || !onUpdateView) return;
      const current = activeView.hiddenGroupIds ?? [];
      onUpdateView(activeView.id, { hiddenGroupIds: current.filter((id) => id !== groupId) });
    },
    [activeView, onUpdateView]
  );

  const handleShowAllGroups = useCallback(() => {
    if (!activeView || !onUpdateView) return;
    onUpdateView(activeView.id, { hiddenGroupIds: [] });
  }, [activeView, onUpdateView]);

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

  // Duplicate a whole column: a new status option right after the source, then
  // clone every (non-archived) card from that column into the new one.
  const handleDuplicateGroup = useCallback(
    (optionId: string) => {
      if (!statusField) return;
      const options = (statusField.typeOptions.options ?? []) as SelectOption[];
      const idx = options.findIndex((o) => o.id === optionId);
      if (idx === -1) return;
      const src = options[idx];
      const newOptId = `status-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const newOption: SelectOption = {
        id: newOptId,
        name: `${src.name} (Kopie)`,
        color: src.color,
      };
      updateField(statusField.id, {
        typeOptions: {
          ...statusField.typeOptions,
          options: [...options.slice(0, idx + 1), newOption, ...options.slice(idx + 1)],
        },
      });

      const group = groups.find((g) => g.groupId === optionId);
      group?.rows.forEach((row, i) => {
        const cells: Record<string, CellValue> = { ...row.cells, [FIELD_IDS.STATUS]: newOptId };
        if (FIELD_IDS.COMMENTS in cells) cells[FIELD_IDS.COMMENTS] = '[]';
        addRow({
          id: `row-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
          cells,
          createdBy: currentUserId,
          createdAt: new Date().toISOString(),
          ...(row.icon ? { icon: row.icon } : {}),
          ...(row.coverColor ? { coverColor: row.coverColor } : {}),
          ...(row.coverImageUrl ? { coverImageUrl: row.coverImageUrl } : {}),
        });
      });
    },
    [statusField, updateField, groups, addRow, currentUserId]
  );

  const handleSetLimit = useCallback(
    (optionId: string, limit: number | null) => {
      if (!statusField) return;
      const options = (statusField.typeOptions.options ?? []) as SelectOption[];
      updateField(statusField.id, {
        typeOptions: {
          ...statusField.typeOptions,
          options: options.map((o) => {
            if (o.id !== optionId) return o;
            // Preserve every other option field (notably aiTask) — only the
            // WIP limit changes. limit == null clears it.
            if (limit == null) {
              const { limit: _drop, ...rest } = o;
              return rest;
            }
            return { ...o, limit };
          }),
        },
      });
    },
    [statusField, updateField]
  );

  // Swap with the nearest *visible* neighbour so hidden columns don't absorb moves.
  const handleMoveColumn = useCallback(
    (optionId: string, dir: 'left' | 'right') => {
      if (!statusField) return;
      const options = [...((statusField.typeOptions.options ?? []) as SelectOption[])];
      const visible = options.filter((o) => !hiddenGroupIds.has(o.id));
      const vIdx = visible.findIndex((o) => o.id === optionId);
      const targetId = visible[dir === 'left' ? vIdx - 1 : vIdx + 1]?.id;
      if (vIdx === -1 || !targetId) return;
      const i = options.findIndex((o) => o.id === optionId);
      const j = options.findIndex((o) => o.id === targetId);
      [options[i], options[j]] = [options[j], options[i]];
      updateField(statusField.id, {
        typeOptions: { ...statusField.typeOptions, options },
      });
    },
    [statusField, updateField, hiddenGroupIds]
  );

  // Drag reorder: `reordered` is the visible columns in their new order. Refill only
  // the visible option slots in the full options array — hidden options keep theirs.
  const handleColumnReorder = useCallback(
    (reordered: { id: string }[]) => {
      if (!statusField) return;
      const options = (statusField.typeOptions.options ?? []) as SelectOption[];
      const optionById = new Map(options.map((o) => [o.id, o]));
      const newOrderIds = reordered.map((c) => c.id).filter((id) => optionById.has(id));
      const visibleIds = new Set(newOrderIds);
      let vptr = 0;
      const newOptions = options.map((o) =>
        visibleIds.has(o.id) ? (optionById.get(newOrderIds[vptr++]) ?? o) : o
      );
      updateField(statusField.id, {
        typeOptions: { ...statusField.typeOptions, options: newOptions },
      });
    },
    [statusField, updateField]
  );

  // index/total are over *visible* columns so can-move flags match what's shown.
  const optionMeta = useMemo(() => {
    const options = (statusField?.typeOptions.options as SelectOption[] | undefined) ?? [];
    const visible = options.filter((o) => !hiddenGroupIds.has(o.id));
    const map = new Map<string, { index: number; total: number; limit?: number }>();
    visible.forEach((o, index) => {
      map.set(o.id, {
        index,
        total: visible.length,
        ...(o.limit != null ? { limit: o.limit } : {}),
      });
    });
    return map;
  }, [statusField, hiddenGroupIds]);

  const renderBoard = (
    laneGroups: RowGroup[],
    laneValue: string | null,
    showColumnTools: boolean,
    laneHiddenGroups: RowGroup[]
  ) => {
    const items = rowsToKanbanItems(laneGroups);
    const columns = groupsToColumns(laneGroups);
    const counts = new Map(laneGroups.map((g) => [g.groupId, g.rows.length]));
    const addCard = (groupId: string, name: string) =>
      handleAddCard(groupId, name, laneValue ?? undefined);

    return (
      <KanbanProvider<KanbanItem, { id: string; name: string; color: string }>
        columns={columns}
        data={items}
        onDataChange={handleDataChange}
        onColumnReorder={handleColumnReorder}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragEnd}
        className="items-start"
        after={
          showColumnTools ? (
            <div className="flex items-start gap-2 shrink-0">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className="flex items-center justify-center w-8 h-8 mt-2 rounded-lg bg-transparent text-grey-400 hover:text-foreground hover:bg-grey-200 dark:hover:bg-[#2a2a2a] cursor-pointer transition-colors border-none"
                    title="Spalte hinzufügen"
                  >
                    <FiPlus size={16} />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem onClick={handleAddColumn}>
                    <FiPlus className="mr-2" size={14} />
                    Neue Spalte
                  </DropdownMenuItem>
                  {expertMode && (
                    <DropdownMenuItem onClick={openAiDialogForNew}>
                      <FiZap className="mr-2" size={14} />
                      Neue Grünerator-Spalte
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
              {laneHiddenGroups.length > 0 && (
                <div className="mt-2 flex flex-col gap-1">
                  <button
                    onClick={handleShowAllGroups}
                    className="px-3 py-1.5 text-xs text-grey-400 hover:text-foreground bg-grey-100 dark:bg-[#1e1e1e] rounded-lg border-none cursor-pointer transition-colors whitespace-nowrap"
                  >
                    {laneHiddenGroups.length} ausgeblendet
                  </button>
                  {laneHiddenGroups.map((g) => (
                    <button
                      key={g.groupId}
                      onClick={() => handleShowGroup(g.groupId)}
                      className="flex items-center gap-1.5 px-2 py-1 text-[10px] text-grey-400 hover:text-foreground bg-transparent border border-dashed border-grey-200 dark:border-grey-700 rounded cursor-pointer transition-colors whitespace-nowrap"
                    >
                      {g.groupColor !== 'transparent' && (
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: g.groupColor }}
                        />
                      )}
                      {g.groupName}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : undefined
        }
      >
        {(column) => {
          const meta = optionMeta.get(column.id);
          return (
            <ColumnBoard
              key={column.id}
              groupId={column.id}
              groupName={column.name}
              groupColor={column.color}
              cardCount={counts.get(column.id) || 0}
              statusField={statusField}
              limit={meta?.limit}
              isRealColumn={meta != null}
              canMoveLeft={meta != null && meta.index > 0}
              canMoveRight={meta != null && meta.index < meta.total - 1}
              onRenameGroup={handleRenameGroup}
              onDeleteGroup={handleDeleteGroup}
              onHideGroup={handleHideGroup}
              onColorChange={handleColorChange}
              onDuplicateGroup={handleDuplicateGroup}
              onConfigureColumnAi={openAiDialogForColumn}
              onRemoveColumnAi={handleRemoveColumnAi}
              onSetLimit={handleSetLimit}
              onMoveColumn={handleMoveColumn}
              handleAddCard={addCard}
              onCardClick={handleCardClick}
              onRenameCard={handleRenameCard}
              fields={fields}
              expertMode={expertMode}
            />
          );
        }}
      </KanbanProvider>
    );
  };

  return (
    <BoardAwarenessProvider value={remoteActivities}>
      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions -- passive cursor-presence tracking, not a control */}
      <div
        ref={containerRef}
        className="relative z-10 flex-1 overflow-auto p-md sm:p-lg"
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
      >
        <BoardCursorLayer cursors={remoteCursors} containerRef={containerRef} />
        {swimlanes ? (
          <div className="flex flex-col gap-5">
            {swimlanes.map((lane, i) => (
              <div key={lane.laneId}>
                <div className="flex items-center gap-2 mb-1.5 px-1">
                  {lane.laneColor !== 'transparent' && (
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: lane.laneColor }}
                    />
                  )}
                  <span className="text-sm font-semibold text-foreground">{lane.laneName}</span>
                  <span className="text-xs text-grey-400">
                    {lane.groups.reduce((n, g) => n + g.rows.length, 0)}
                  </span>
                </div>
                {renderBoard(lane.groups, lane.laneId, i === 0, [])}
              </div>
            ))}
          </div>
        ) : (
          renderBoard(visibleGroups, null, true, hiddenGroups)
        )}
      </div>

      <AiColumnDialog
        open={aiDialogOpen}
        onOpenChange={setAiDialogOpen}
        initial={aiDialogInitial}
        fields={fields}
        onConfirm={handleConfirmAiColumn}
      />

      <CardDetailPanel
        row={selectedRow}
        fields={fields}
        open={detailOpen}
        onOpenChange={handleDetailClose}
        onUpdateCell={updateRowCell}
        onUpdateRow={updateRow}
        onDelete={deleteRow}
        onDuplicate={(rowId) => duplicateRow(rowId, currentUserId)}
        onUpdateField={updateField}
        boardId={boardId}
        boardTitle={boardTitle}
        currentUserId={currentUserId}
        currentUserName={userName}
        currentUserAvatarRobotId={userAvatarRobotId}
        onPrevCard={handlePrevCard}
        onNextCard={handleNextCard}
        expertMode={expertMode}
      />
    </BoardAwarenessProvider>
  );
}
