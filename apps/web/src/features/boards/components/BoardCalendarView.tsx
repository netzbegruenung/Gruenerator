import { memo, useMemo } from 'react';

import { useScheduledAgentRuns } from '../hooks/useScheduledAgentRuns';
import { FIELD_IDS } from '../types';

import type { Field, Row, BoardView, SelectOption } from '../types';
import type { Feature, Status } from '@/components/kibo-ui/calendar';

// Read-only overlay statuses for scheduled/past agent runs (OpenWebUI-style virtual
// "Scheduled Tasks" calendar). Distinct colours so they don't read as card due dates.
const RUN_STATUS: Record<'scheduled' | 'completed' | 'failed' | 'awaiting_review', Status> = {
  scheduled: { id: '_run_scheduled', name: 'Geplanter Lauf', color: '#d97706' },
  completed: { id: '_run_completed', name: 'Lauf fertig', color: '#16a34a' },
  failed: { id: '_run_failed', name: 'Lauf fehlgeschlagen', color: '#dc2626' },
  awaiting_review: { id: '_run_review', name: 'Lauf zur Prüfung', color: '#d97706' },
};

import {
  CalendarProvider,
  CalendarDate,
  CalendarDatePagination,
  CalendarDatePicker,
  CalendarMonthPicker,
  CalendarYearPicker,
  CalendarHeader,
  CalendarBody,
  CalendarItem,
} from '@/components/kibo-ui/calendar';

interface BoardCalendarViewProps {
  fields: Field[];
  rows: Row[];
  activeView: BoardView | null;
  onRowClick: (row: Row) => void;
  /** When set, upcoming scheduled runs + past runs are overlaid as virtual events. */
  boardId?: string;
}

export const BoardCalendarView = memo(function BoardCalendarView({
  fields,
  rows,
  activeView,
  onRowClick,
  boardId,
}: BoardCalendarViewProps) {
  const dateFieldId = activeView?.dateFieldId ?? FIELD_IDS.DUE_DATE;
  const statusField = useMemo(() => fields.find((f) => f.id === FIELD_IDS.STATUS), [fields]);
  const statusOptions = useMemo(
    () => (statusField?.typeOptions.options ?? []) as SelectOption[],
    [statusField]
  );

  // Map rows to kibo-ui Calendar Feature objects
  const features: Feature[] = useMemo(() => {
    const rowMap: { feature: Feature; row: Row }[] = [];
    for (const row of rows) {
      const dateVal = row.cells[dateFieldId] as string | null;
      if (!dateVal) continue;

      const title = (row.cells[FIELD_IDS.TITLE] as string) || '';
      const statusId = row.cells[FIELD_IDS.STATUS] as string | null;
      const statusOpt = statusId ? statusOptions.find((o) => o.id === statusId) : null;

      const status: Status = statusOpt
        ? { id: statusOpt.id, name: statusOpt.name, color: statusOpt.color }
        : { id: '_none', name: 'Ohne Status', color: '#999' };

      const date = new Date(dateVal);

      rowMap.push({
        feature: {
          id: row.id,
          name: title,
          startAt: date,
          endAt: date,
          status,
        },
        row,
      });
    }
    return rowMap.map((r) => r.feature);
  }, [rows, dateFieldId, statusOptions]);

  // Virtual overlay: upcoming scheduled runs (schedule.nextRunAt) + past runs
  // (agent_tasks.completedAt). Read-only; clicking one opens its card if present.
  const { schedulesQuery, runsQuery } = useScheduledAgentRuns(boardId);
  const runFeatures: Feature[] = useMemo(() => {
    if (!boardId) return [];
    const out: Feature[] = [];
    for (const s of schedulesQuery.data ?? []) {
      if (!s.enabled) continue;
      const date = new Date(s.nextRunAt);
      out.push({
        id: `sched-${s.id}`,
        name: 'Geplanter Lauf',
        startAt: date,
        endAt: date,
        status: RUN_STATUS.scheduled,
      });
    }
    for (const r of runsQuery.data ?? []) {
      if (!r.completedAt) continue;
      const date = new Date(r.completedAt);
      const status =
        r.status === 'failed'
          ? RUN_STATUS.failed
          : r.status === 'awaiting_review'
            ? RUN_STATUS.awaiting_review
            : RUN_STATUS.completed;
      out.push({ id: `run-${r.id}`, name: status.name, startAt: date, endAt: date, status });
    }
    return out;
  }, [boardId, schedulesQuery.data, runsQuery.data]);

  const allFeatures = useMemo(() => [...features, ...runFeatures], [features, runFeatures]);

  // Keep a lookup for row click
  const rowById = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);

  const currentYear = new Date().getFullYear();

  return (
    <div className="flex-1 overflow-auto p-md sm:p-lg">
      <CalendarProvider locale="de-DE" startDay={1}>
        <CalendarDate>
          <CalendarDatePicker>
            <CalendarMonthPicker />
            <CalendarYearPicker start={currentYear - 2} end={currentYear + 3} />
          </CalendarDatePicker>
          <CalendarDatePagination />
        </CalendarDate>
        <CalendarHeader className="border-b border-grey-200 dark:border-grey-700" />
        <CalendarBody features={allFeatures}>
          {({ feature }) => {
            const row = rowById.get(feature.id);
            return (
              <div
                key={feature.id}
                onClick={() => row && onRowClick(row)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && row) onRowClick(row);
                }}
                role="button"
                tabIndex={0}
                className="cursor-pointer hover:bg-grey-100 dark:hover:bg-grey-800 rounded px-1 transition-colors"
              >
                <CalendarItem feature={feature} className="text-[10px]" />
              </div>
            );
          }}
        </CalendarBody>
      </CalendarProvider>
    </div>
  );
});
