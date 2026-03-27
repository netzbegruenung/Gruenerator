import { memo, useMemo } from 'react';

import { FIELD_IDS } from '../types';

import type { Field, Row, BoardView, SelectOption } from '../types';
import type { Feature, Status } from '@/components/kibo-ui/calendar';

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
}

export const BoardCalendarView = memo(function BoardCalendarView({
  fields,
  rows,
  activeView,
  onRowClick,
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
        <CalendarBody features={features}>
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
