import { useState, useEffect, useCallback, useMemo, useRef } from 'react';

import { FIELD_IDS } from '../types';
import { DEFAULT_FIELDS, DEFAULT_KANBAN_VIEW, DEFAULT_ROWS } from '../utils/boardDefaults';
import { getDoneStatusId, nextOccurrence, reopenStatusId, withStatus } from '../utils/taskDone';

import type { Field, Row, BoardView, CellValue } from '../types';
import type * as Y from 'yjs';

/** A recurring card spawned when its predecessor was completed. */
export interface RecurringSpawn {
  rowId: string;
  dueDate: string;
}

/** Outcome of setRowStatus/setRowDone, for activity logging. */
export interface StatusChange {
  spawned: RecurringSpawn[];
  completed: boolean;
  reopened: boolean;
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
  initialStructure?: BoardInitialStructure | null,
  isLocked = false
) => {
  const [state, setState] = useState<BoardState>({ fields: [], rows: [], views: [] });
  const initializedRef = useRef(false);
  // Ref (not a callback dep) so a durable collab authError can gate every
  // mutator below without changing their identity — memoized children
  // (PlannerKanban, BoardTableView, ...) keep stable callback props. Synced
  // via effect rather than during render (react-hooks/refs).
  const isLockedRef = useRef(isLocked);
  useEffect(() => {
    isLockedRef.current = isLocked;
  }, [isLocked]);

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
      if (isLockedRef.current) return;
      ydoc.transact(() => {
        yRows.push([row]);
      });
    },
    [ydoc, yRows]
  );

  const updateRow = useCallback(
    (rowId: string, updates: Partial<Row>) => {
      if (isLockedRef.current) return;
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
      if (isLockedRef.current) return;
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
      if (isLockedRef.current) return;
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
      if (isLockedRef.current) return null;
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
   * `newRows` is the dragged view's rows in their new visual order, each carrying
   * its (possibly changed) group assignment. We persist BOTH the new order and any
   * column change: rows outside the dragged view (hidden groups, archived, filtered
   * out) keep their slots, and the dragged slots are refilled in the new order.
   * Only the group cell is written onto each moved row, so a concurrent remote edit
   * to a card's other cells isn't clobbered.
   */
  const onDragReorder = useCallback(
    (newRows: Row[], groupByFieldId: string): RecurringSpawn[] => {
      if (isLockedRef.current) return [];
      const spawned: RecurringSpawn[] = [];

      ydoc.transact(() => {
        const oldRows = yRows.toJSON() as Row[];
        const oldById = new Map(oldRows.map((r) => [r.id, r]));
        // Only ids that actually exist in the doc — a stray/new id would desync the
        // slot-refill below (fewer slots than newRows entries).
        const subsetIds = new Set(newRows.filter((r) => oldById.has(r.id)).map((r) => r.id));

        // Moves into/out of the done column go through withStatus so the card
        // remembers its previous column (the "wieder öffnen" target).
        const fields = yFields.toJSON() as Field[];
        const doneId = groupByFieldId === FIELD_IDS.STATUS ? getDoneStatusId(fields) : null;

        // Refill the dragged slots in their new order; leave every other row in place.
        let ptr = 0;
        const merged = oldRows.map((row) => {
          if (!subsetIds.has(row.id)) return row;
          let next = newRows[ptr++];
          while (next && !subsetIds.has(next.id)) next = newRows[ptr++];
          if (!next) return row;
          const current = oldById.get(next.id) ?? next;
          const newGroup = next.cells[groupByFieldId];
          if (current.cells[groupByFieldId] === newGroup) return current;
          if (groupByFieldId === FIELD_IDS.STATUS && typeof newGroup === 'string') {
            return withStatus(current, newGroup, doneId);
          }
          return { ...current, cells: { ...current.cells, [groupByFieldId]: newGroup } };
        });

        // Recurring cards that just entered "done" spawn the next occurrence.
        const clones: Row[] = [];
        if (doneId) {
          for (const newRow of newRows) {
            const old = oldById.get(newRow.id);
            if (!old) continue;
            const oldGroup = old.cells[groupByFieldId];
            const newGroup = newRow.cells[groupByFieldId];
            if (newGroup !== doneId || oldGroup === doneId) continue;
            const next = nextOccurrence(old, fields, doneId);
            if (!next) continue;
            clones.push(next.row);
            spawned.push({ rowId: next.row.id, dueDate: next.dueDate });
          }
        }

        const finalRows = clones.length ? [...merged, ...clones] : merged;

        // Skip the rewrite when nothing moved (only order + group cell can change here).
        const unchanged =
          finalRows.length === oldRows.length &&
          finalRows.every(
            (r, i) =>
              r.id === oldRows[i].id && r.cells[groupByFieldId] === oldRows[i].cells[groupByFieldId]
          );
        if (unchanged) return;

        yRows.delete(0, yRows.length);
        yRows.insert(0, finalRows);
      });

      return spawned;
    },
    [ydoc, yRows, yFields]
  );

  /**
   * The one door for a card's status change outside a drag (detail panel, list
   * drag, "Karte verschieben"): keeps the done bookkeeping in one place —
   * statusBeforeDone and the recurring follow-up. Returns null when nothing
   * changed, else what happened so the caller can log it.
   */
  const setRowStatus = useCallback(
    (rowId: string, statusId: string): StatusChange | null => {
      if (isLockedRef.current) return null;
      let change: StatusChange | null = null;
      ydoc.transact(() => {
        const fields = yFields.toJSON() as Field[];
        const doneId = getDoneStatusId(fields);
        const rows = yRows.toJSON() as Row[];
        const index = rows.findIndex((r) => r.id === rowId);
        if (index === -1) return;
        const row = rows[index];
        const prev = row.cells[FIELD_IDS.STATUS];
        if (prev === statusId) return;
        yRows.delete(index, 1);
        yRows.insert(index, [withStatus(row, statusId, doneId)]);
        const completed = !!doneId && statusId === doneId;
        const spawned: RecurringSpawn[] = [];
        const next = completed && doneId ? nextOccurrence(row, fields, doneId) : null;
        if (next) {
          yRows.push([next.row]);
          spawned.push({ rowId: next.row.id, dueDate: next.dueDate });
        }
        change = { spawned, completed, reopened: !!doneId && prev === doneId };
      });
      return change;
    },
    [ydoc, yRows, yFields]
  );

  /**
   * Check a card off (move it to the done column) or reopen it (back to the column
   * it came from). Null when nothing changed (no done column, already in that
   * state, locked).
   */
  const setRowDone = useCallback(
    (rowId: string, done: boolean): StatusChange | null => {
      const fields = yFields.toJSON() as Field[];
      const doneId = getDoneStatusId(fields);
      const row = (yRows.toJSON() as Row[]).find((r) => r.id === rowId);
      if (!doneId || !row) return null;
      if ((row.cells[FIELD_IDS.STATUS] === doneId) === done) return null;
      const target = done ? doneId : reopenStatusId(row, fields, doneId);
      return target ? setRowStatus(rowId, target) : null;
    },
    [yRows, yFields, setRowStatus]
  );

  // --- Field CRUD ---

  const addField = useCallback(
    (field: Field) => {
      if (isLockedRef.current) return;
      ydoc.transact(() => {
        yFields.push([field]);
      });
    },
    [ydoc, yFields]
  );

  const updateField = useCallback(
    (fieldId: string, updates: Partial<Field>) => {
      if (isLockedRef.current) return;
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
      if (isLockedRef.current) return;
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
      if (isLockedRef.current) return;
      ydoc.transact(() => {
        yViews.push([view]);
      });
    },
    [ydoc, yViews]
  );

  const updateView = useCallback(
    (viewId: string, updates: Partial<BoardView>) => {
      if (isLockedRef.current) return;
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
      if (isLockedRef.current) return;
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
    setRowStatus,
    setRowDone,
    addField,
    updateField,
    removeField,
    addView,
    updateView,
    removeView,
  };
};
