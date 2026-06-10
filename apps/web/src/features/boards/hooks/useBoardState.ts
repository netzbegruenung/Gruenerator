import { useState, useEffect, useCallback, useMemo, useRef } from 'react';

import { FIELD_IDS } from '../types';
import {
  DEFAULT_FIELDS,
  DEFAULT_KANBAN_VIEW,
  DEFAULT_ROWS,
  DONE_STATUS_ID,
  TODO_STATUS_ID,
} from '../utils/boardDefaults';
import { computeNextDueDate, isRecurrencePattern } from '../utils/recurrence';

import type { Field, Row, BoardView, CellValue } from '../types';
import type * as Y from 'yjs';

/** A recurring card spawned when its predecessor was moved to "done". */
export interface RecurringSpawn {
  rowId: string;
  dueDate: string;
}

interface BoardState {
  fields: Field[];
  rows: Row[];
  views: BoardView[];
}

export interface BoardInitialStructure {
  fields: Field[];
  rows: Row[];
  views: BoardView[];
}

export const useBoardState = (
  ydoc: Y.Doc,
  isSynced: boolean,
  initialStructure?: BoardInitialStructure | null
) => {
  const [state, setState] = useState<BoardState>({ fields: [], rows: [], views: [] });
  const initializedRef = useRef(false);

  const yFields = useMemo(() => ydoc.getArray<Field>('fields'), [ydoc]);
  const yRows = useMemo(() => ydoc.getArray<Row>('rows'), [ydoc]);
  const yViews = useMemo(() => ydoc.getArray<BoardView>('views'), [ydoc]);

  useEffect(() => {
    if (!isSynced) return;

    if (yFields.length === 0 && !initializedRef.current) {
      initializedRef.current = true;
      const fields = initialStructure?.fields ?? DEFAULT_FIELDS;
      const rows = initialStructure?.rows ?? DEFAULT_ROWS;
      const views = initialStructure?.views ?? [DEFAULT_KANBAN_VIEW];
      ydoc.transact(() => {
        for (const f of fields) yFields.push([f]);
        for (const r of rows) yRows.push([r]);
        for (const v of views) yViews.push([v]);
      });
    }

    const syncState = () => {
      setState({
        fields: yFields.toJSON() as Field[],
        rows: yRows.toJSON() as Row[],
        views: yViews.toJSON() as BoardView[],
      });
    };

    syncState();

    yFields.observeDeep(syncState);
    yRows.observeDeep(syncState);
    yViews.observeDeep(syncState);

    return () => {
      yFields.unobserveDeep(syncState);
      yRows.unobserveDeep(syncState);
      yViews.unobserveDeep(syncState);
    };
  }, [ydoc, isSynced, yFields, yRows, yViews, initialStructure]);

  // --- Row CRUD ---

  const addRow = useCallback(
    (row: Row) => {
      ydoc.transact(() => {
        yRows.push([row]);
      });
    },
    [ydoc, yRows]
  );

  const updateRow = useCallback(
    (rowId: string, updates: Partial<Row>) => {
      ydoc.transact(() => {
        const rows = yRows.toJSON() as Row[];
        const index = rows.findIndex((r) => r.id === rowId);
        if (index !== -1) {
          yRows.delete(index, 1);
          yRows.insert(index, [{ ...rows[index], ...updates }]);
        }
      });
    },
    [ydoc, yRows]
  );

  const updateRowCell = useCallback(
    (rowId: string, fieldId: string, value: CellValue) => {
      ydoc.transact(() => {
        const rows = yRows.toJSON() as Row[];
        const index = rows.findIndex((r) => r.id === rowId);
        if (index !== -1) {
          const row = rows[index];
          yRows.delete(index, 1);
          yRows.insert(index, [{ ...row, cells: { ...row.cells, [fieldId]: value } }]);
        }
      });
    },
    [ydoc, yRows]
  );

  const deleteRow = useCallback(
    (rowId: string) => {
      ydoc.transact(() => {
        const rows = yRows.toJSON() as Row[];
        const index = rows.findIndex((r) => r.id === rowId);
        if (index !== -1) yRows.delete(index, 1);
      });
    },
    [ydoc, yRows]
  );

  /**
   * Clone a card into the same column, right after the source. Copies all Yjs
   * cell data (title gets a " (Kopie)" suffix); intentionally drops `archivedAt`
   * and the relational tail (comments/attachments/activity live in Postgres and
   * are not cloned). Returns the new row id.
   */
  const duplicateRow = useCallback(
    (rowId: string, createdBy: string): string | null => {
      let newId: string | null = null;
      ydoc.transact(() => {
        const rows = yRows.toJSON() as Row[];
        const index = rows.findIndex((r) => r.id === rowId);
        if (index === -1) return;
        const src = rows[index];
        const FIELD_TITLE = 'field-title';
        newId = `row-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const cells = { ...src.cells };
        const title = cells[FIELD_TITLE];
        if (typeof title === 'string') cells[FIELD_TITLE] = `${title} (Kopie)`;
        // Reset comment counter cell so the clone starts with no comments.
        if ('field-comments' in cells) cells['field-comments'] = '[]';
        const clone: Row = {
          id: newId,
          cells,
          createdBy,
          createdAt: new Date().toISOString(),
          ...(src.icon ? { icon: src.icon } : {}),
          ...(src.coverColor ? { coverColor: src.coverColor } : {}),
          ...(src.coverImageUrl ? { coverImageUrl: src.coverImageUrl } : {}),
          // archivedAt intentionally omitted (clone is active).
        };
        yRows.insert(index + 1, [clone]);
      });
      return newId;
    },
    [ydoc, yRows]
  );

  /**
   * Called by kibo-ui Kanban after a drag-and-drop.
   * Receives the full rows array with updated group assignments.
   * We diff against current state and apply column (group) changes.
   */
  const onDragReorder = useCallback(
    (newRows: Row[], groupByFieldId: string): RecurringSpawn[] => {
      const oldRows = yRows.toJSON() as Row[];
      const oldById = new Map(oldRows.map((r, i) => [r.id, { row: r, index: i }]));
      const spawned: RecurringSpawn[] = [];

      ydoc.transact(() => {
        for (const newRow of newRows) {
          const old = oldById.get(newRow.id);
          if (!old) continue;
          const oldGroup = old.row.cells[groupByFieldId];
          const newGroup = newRow.cells[groupByFieldId];
          if (oldGroup === newGroup) continue;

          const currentRows = yRows.toJSON() as Row[];
          const idx = currentRows.findIndex((r) => r.id === newRow.id);
          if (idx !== -1) {
            yRows.delete(idx, 1);
            yRows.insert(Math.min(idx, yRows.length), [newRow]);
          }

          // Recurring card moved into "done" → spawn the next occurrence in todo.
          const recurrence = old.row.cells[FIELD_IDS.RECURRENCE];
          if (
            groupByFieldId === FIELD_IDS.STATUS &&
            newGroup === DONE_STATUS_ID &&
            oldGroup !== DONE_STATUS_ID &&
            isRecurrencePattern(recurrence)
          ) {
            const dueDate = computeNextDueDate(old.row.cells[FIELD_IDS.DUE_DATE], recurrence);
            const newId = `row-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
            const clone: Row = {
              id: newId,
              cells: {
                ...old.row.cells,
                [FIELD_IDS.STATUS]: TODO_STATUS_ID,
                [FIELD_IDS.DUE_DATE]: dueDate,
                ...(FIELD_IDS.COMMENTS in old.row.cells ? { [FIELD_IDS.COMMENTS]: '[]' } : {}),
              },
              createdBy: old.row.createdBy,
              createdAt: new Date().toISOString(),
              ...(old.row.icon ? { icon: old.row.icon } : {}),
              ...(old.row.coverColor ? { coverColor: old.row.coverColor } : {}),
              ...(old.row.coverImageUrl ? { coverImageUrl: old.row.coverImageUrl } : {}),
              // archivedAt intentionally omitted (the new occurrence is active).
            };
            yRows.push([clone]);
            spawned.push({ rowId: newId, dueDate });
          }
        }
      });

      return spawned;
    },
    [ydoc, yRows]
  );

  // --- Field CRUD ---

  const addField = useCallback(
    (field: Field) => {
      ydoc.transact(() => {
        yFields.push([field]);
      });
    },
    [ydoc, yFields]
  );

  const updateField = useCallback(
    (fieldId: string, updates: Partial<Field>) => {
      ydoc.transact(() => {
        const fields = yFields.toJSON() as Field[];
        const index = fields.findIndex((f) => f.id === fieldId);
        if (index !== -1) {
          yFields.delete(index, 1);
          yFields.insert(index, [{ ...fields[index], ...updates }]);
        }
      });
    },
    [ydoc, yFields]
  );

  const removeField = useCallback(
    (fieldId: string) => {
      ydoc.transact(() => {
        const fields = yFields.toJSON() as Field[];
        const index = fields.findIndex((f) => f.id === fieldId);
        if (index !== -1) yFields.delete(index, 1);
      });
    },
    [ydoc, yFields]
  );

  // --- View CRUD ---

  const addView = useCallback(
    (view: BoardView) => {
      ydoc.transact(() => {
        yViews.push([view]);
      });
    },
    [ydoc, yViews]
  );

  const updateView = useCallback(
    (viewId: string, updates: Partial<BoardView>) => {
      ydoc.transact(() => {
        const views = yViews.toJSON() as BoardView[];
        const index = views.findIndex((v) => v.id === viewId);
        if (index !== -1) {
          yViews.delete(index, 1);
          yViews.insert(index, [{ ...views[index], ...updates }]);
        }
      });
    },
    [ydoc, yViews]
  );

  const removeView = useCallback(
    (viewId: string) => {
      ydoc.transact(() => {
        const views = yViews.toJSON() as BoardView[];
        const index = views.findIndex((v) => v.id === viewId);
        if (index !== -1) yViews.delete(index, 1);
      });
    },
    [ydoc, yViews]
  );

  return {
    fields: state.fields,
    rows: state.rows,
    views: state.views,
    addRow,
    updateRow,
    updateRowCell,
    deleteRow,
    duplicateRow,
    onDragReorder,
    addField,
    updateField,
    removeField,
    addView,
    updateView,
    removeView,
  };
};
