import { type ActivityType } from '@gruenerator/contracts';
import { getContractsClient } from '@gruenerator/shared/api';
import { useConfirm } from '@gruenerator/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

import { useTaskDone } from '../context/TaskDoneContext';
import { FIELD_IDS } from '../types';

import type { CellValue, Field, Row, SelectOption } from '../types';

interface CardActionDeps {
  boardId?: string;
  fields: Field[];
  onUpdateCell: (rowId: string, fieldId: string, value: CellValue) => void;
  onUpdateRow: (rowId: string, updates: Partial<Row>) => void;
  onDelete: (rowId: string) => void;
  onDuplicate?: (rowId: string) => void;
}

function linkedDocCount(row: Row): number {
  try {
    const raw = row.cells[FIELD_IDS.LINKED_DOCS];
    const docs: unknown = typeof raw === 'string' ? JSON.parse(raw) : [];
    return Array.isArray(docs) ? docs.length : 0;
  } catch {
    return 0;
  }
}

/**
 * The card actions shared by the detail panel's ⋯ menu and the right-click
 * menu, so both write the same cells and log the same activity. Each action
 * takes the row, which lets one instance serve every card on the board.
 */
export function useCardActions({
  boardId,
  fields,
  onUpdateCell,
  onUpdateRow,
  onDelete,
  onDuplicate,
}: CardActionDeps) {
  const confirm = useConfirm();
  const taskDone = useTaskDone();
  const queryClient = useQueryClient();

  const statusOptions = useMemo(
    () =>
      (fields.find((f) => f.id === FIELD_IDS.STATUS)?.typeOptions.options ?? []) as SelectOption[],
    [fields]
  );

  const record = useCallback(
    (rowId: string, type: ActivityType) => {
      if (!boardId) return;
      void getContractsClient()
        .boardActivity.recordActivity({ params: { boardId, cardId: rowId }, body: { type } })
        .then(() => queryClient.invalidateQueries({ queryKey: ['board-activity', boardId, rowId] }))
        .catch(() => {});
    },
    [boardId, queryClient]
  );

  const archive = useCallback(
    (row: Row) => {
      onUpdateRow(row.id, { archivedAt: new Date().toISOString() });
      record(row.id, 'card_archived');
    },
    [onUpdateRow, record]
  );

  const restore = useCallback(
    (row: Row) => {
      onUpdateRow(row.id, { archivedAt: undefined });
      record(row.id, 'card_restored');
    },
    [onUpdateRow, record]
  );

  // Moving = writing the STATUS cell.
  const moveTo = useCallback(
    (row: Row, statusId: string) => {
      const currentStatusId = row.cells[FIELD_IDS.STATUS];
      onUpdateCell(row.id, FIELD_IDS.STATUS, statusId);
      // Entering/leaving the done column is logged as completed/reopened upstream.
      const touchesDone =
        !!taskDone &&
        (statusId === taskDone.doneStatusId || currentStatusId === taskDone.doneStatusId);
      if (!touchesDone) record(row.id, 'card_moved');
    },
    [onUpdateCell, record, taskDone]
  );

  const duplicate = useMemo(
    () => (onDuplicate ? (row: Row) => onDuplicate(row.id) : null),
    [onDuplicate]
  );

  /** Resolves true when the card was deleted or archived instead. */
  const remove = useCallback(
    async (row: Row) => {
      const docCount = linkedDocCount(row);
      let archived = false;
      const ok = await confirm(
        docCount > 0
          ? {
              title: 'Aufgabe löschen?',
              description: `Diese Aufgabe hat ${docCount} verknüpfte${
                docCount === 1 ? 's' : ''
              } Dokument${
                docCount === 1 ? '' : 'e'
              }. Die Dokumente bleiben erhalten – du findest sie weiterhin unter „Dokumente". Nur die Verknüpfung zur Aufgabe geht verloren.`,
              confirmLabel: 'Trotzdem löschen',
              alternateAction: {
                label: 'Archivieren',
                onSelect: () => {
                  archived = true;
                  archive(row);
                },
              },
            }
          : {
              title: 'Karte löschen?',
              description: 'Diese Karte und ihr gesamter Inhalt werden unwiderruflich gelöscht.',
            }
      );
      if (ok) onDelete(row.id);
      return ok || archived;
    },
    [confirm, archive, onDelete]
  );

  return { statusOptions, taskDone, moveTo, duplicate, archive, restore, remove };
}
