import { memo, useMemo } from 'react';

import { FIELD_IDS } from '../types';

import type { Field, Row, BoardView, SelectOption } from '../types';
import type { GanttFeature, GanttStatus } from '@/components/kibo-ui/gantt';

import {
  GanttProvider,
  GanttSidebar,
  GanttSidebarGroup,
  GanttSidebarItem,
  GanttTimeline,
  GanttHeader,
  GanttColumns,
  GanttFeatureList,
  GanttFeatureListGroup,
  GanttFeatureRow,
  GanttToday,
} from '@/components/kibo-ui/gantt';

interface BoardGanttViewProps {
  fields: Field[];
  rows: Row[];
  activeView: BoardView | null;
  onRowClick: (row: Row) => void;
}

export const BoardGanttView = memo(function BoardGanttView({
  fields,
  rows,
  activeView,
  onRowClick,
}: BoardGanttViewProps) {
  const dateFieldId = activeView?.dateFieldId ?? FIELD_IDS.DUE_DATE;
  const statusField = useMemo(() => fields.find((f) => f.id === FIELD_IDS.STATUS), [fields]);
  const statusOptions = useMemo(
    () => (statusField?.typeOptions.options ?? []) as SelectOption[],
    [statusField]
  );

  // Group rows by status for sidebar groups
  const groupedFeatures = useMemo(() => {
    const groups: { status: GanttStatus; features: GanttFeature[]; rows: Row[] }[] = [];
    const groupMap = new Map<
      string,
      { status: GanttStatus; features: GanttFeature[]; rows: Row[] }
    >();

    for (const opt of statusOptions) {
      const g = {
        status: { id: opt.id, name: opt.name, color: opt.color },
        features: [] as GanttFeature[],
        rows: [] as Row[],
      };
      groups.push(g);
      groupMap.set(opt.id, g);
    }

    const ungrouped = {
      status: { id: '_none', name: 'Ohne Status', color: '#999' },
      features: [] as GanttFeature[],
      rows: [] as Row[],
    };

    for (const row of rows) {
      const dateVal = row.cells[dateFieldId] as string | null;
      if (!dateVal) continue;

      const title = (row.cells[FIELD_IDS.TITLE] as string) || '';
      const statusId = row.cells[FIELD_IDS.STATUS] as string | null;
      const date = new Date(dateVal);

      // For gantt, use date as both start and end if no end date field
      const endDateFieldId = activeView?.endDateFieldId;
      const endDateVal = endDateFieldId ? (row.cells[endDateFieldId] as string | null) : null;
      const endDate = endDateVal
        ? new Date(endDateVal)
        : new Date(date.getTime() + 7 * 24 * 60 * 60 * 1000); // default 1 week span

      const group = statusId ? groupMap.get(statusId) : null;
      const target = group ?? ungrouped;

      const feature: GanttFeature = {
        id: row.id,
        name: title,
        startAt: date,
        endAt: endDate,
        status: target.status,
      };

      target.features.push(feature);
      target.rows.push(row);
    }

    if (ungrouped.features.length > 0) groups.push(ungrouped);
    return groups.filter((g) => g.features.length > 0);
  }, [rows, dateFieldId, statusOptions, activeView?.endDateFieldId]);

  const rowById = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);

  return (
    <div className="flex-1 overflow-hidden p-md sm:p-lg">
      <GanttProvider range="monthly" zoom={100}>
        <GanttSidebar>
          {groupedFeatures.map((group) => (
            <GanttSidebarGroup key={group.status.id} name={group.status.name}>
              {group.features.map((f) => (
                <GanttSidebarItem
                  key={f.id}
                  feature={f}
                  onSelectItem={(id) => {
                    const row = rowById.get(id);
                    if (row) onRowClick(row);
                  }}
                />
              ))}
            </GanttSidebarGroup>
          ))}
        </GanttSidebar>
        <GanttTimeline>
          <GanttHeader />
          <GanttColumns />
          <GanttFeatureList>
            {groupedFeatures.map((group) => (
              <GanttFeatureListGroup key={group.status.id}>
                <GanttFeatureRow features={group.features}>
                  {(feature) => (
                    <p className="flex-1 truncate text-xs text-foreground">{feature.name}</p>
                  )}
                </GanttFeatureRow>
              </GanttFeatureListGroup>
            ))}
          </GanttFeatureList>
          <GanttToday />
        </GanttTimeline>
      </GanttProvider>
    </div>
  );
});
