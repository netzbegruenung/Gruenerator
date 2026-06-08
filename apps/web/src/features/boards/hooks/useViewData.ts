import { useMemo } from 'react';

import { FIELD_IDS, parseAssignees } from '../types';

import type {
  Field,
  Row,
  BoardView,
  RowGroup,
  SwimlaneGroup,
  SelectOption,
  CellValue,
  FilterRule,
  SortRule,
} from '../types';

/** Always-on lightweight presets shown in the BoardQuickBar (A4). */
export type QuickFilter = 'mine' | 'overdue' | 'unassigned';

interface UseViewDataInput {
  fields: Field[];
  rows: Row[];
  views: BoardView[];
  activeViewId: string;
  /** When false (default) archived cards are filtered out of every layout. */
  includeArchived?: boolean;
  /** Transient full-text query (title + description), not persisted to the view. */
  searchQuery?: string;
  /** Transient quick-filter chips (AND-combined), not persisted to the view. */
  quickFilters?: QuickFilter[];
  /** Current user, for the "Meine Aufgaben" quick filter. */
  currentUserId?: string;
  currentUserName?: string;
}

interface UseViewDataOutput {
  activeView: BoardView | null;
  fields: Field[];
  filteredRows: Row[];
  groups: RowGroup[];
  /** Present only when the active view has a swimlaneFieldId set (A12, kanban). */
  swimlanes: SwimlaneGroup[] | null;
}

/** Local YYYY-MM-DD for "overdue" comparison (cells store ISO date strings). */
function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Status options whose name reads as "done"; used only to exclude completed cards
// from the overdue filter. No positional fallback — a non-done last column must
// not be silently treated as done (it would hide genuinely overdue cards).
function doneStatusIds(fields: Field[]): Set<string> {
  const status = fields.find((f) => f.id === FIELD_IDS.STATUS);
  const options = ((status?.typeOptions.options as SelectOption[] | undefined) ?? []).filter(Boolean);
  const ids = new Set<string>();
  for (const opt of options) {
    if (/erledigt|fertig|abgeschlossen|done|completed|closed/i.test(opt.name)) ids.add(opt.id);
  }
  return ids;
}

function matchesSearch(row: Row, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const title = row.cells[FIELD_IDS.TITLE];
  const desc = row.cells[FIELD_IDS.DESCRIPTION];
  return (
    (typeof title === 'string' && title.toLowerCase().includes(needle)) ||
    (typeof desc === 'string' && desc.toLowerCase().includes(needle))
  );
}

function matchesQuickFilter(
  row: Row,
  qf: QuickFilter,
  ctx: { userId?: string; userName?: string; today: string; doneIds: Set<string> }
): boolean {
  switch (qf) {
    case 'mine': {
      const assignees = parseAssignees(row.cells[FIELD_IDS.ASSIGNEE]);
      return assignees.some(
        (a) => (ctx.userId && a.id === ctx.userId) || (ctx.userName && a.name === ctx.userName)
      );
    }
    case 'unassigned':
      return parseAssignees(row.cells[FIELD_IDS.ASSIGNEE]).length === 0;
    case 'overdue': {
      const due = row.cells[FIELD_IDS.DUE_DATE];
      if (typeof due !== 'string' || !due || due >= ctx.today) return false;
      const status = row.cells[FIELD_IDS.STATUS];
      return !(typeof status === 'string' && ctx.doneIds.has(status));
    }
    default:
      return true;
  }
}

function matchesFilter(row: Row, rule: FilterRule, fields: Field[]): boolean {
  const value = row.cells[rule.fieldId];
  const field = fields.find((f) => f.id === rule.fieldId);
  if (!field) return true;

  switch (rule.operator) {
    case 'equals':
      return value === rule.value;
    case 'notEquals':
      return value !== rule.value;
    case 'contains':
      return (
        typeof value === 'string' && value.toLowerCase().includes(String(rule.value).toLowerCase())
      );
    case 'isEmpty':
      return value === null || value === '' || (Array.isArray(value) && value.length === 0);
    case 'isNotEmpty':
      return value !== null && value !== '' && !(Array.isArray(value) && value.length === 0);
    case 'before':
      return typeof value === 'string' && typeof rule.value === 'string' && value < rule.value;
    case 'after':
      return typeof value === 'string' && typeof rule.value === 'string' && value > rule.value;
    case 'greaterThan':
      return typeof value === 'number' && value > Number(rule.value);
    case 'lessThan':
      return typeof value === 'number' && value < Number(rule.value);
    case 'includes':
      return Array.isArray(value) && value.includes(rule.value as string);
    default:
      return true;
  }
}

function compareValues(a: CellValue, b: CellValue, direction: 'asc' | 'desc'): number {
  const mult = direction === 'asc' ? 1 : -1;
  if (a === null && b === null) return 0;
  if (a === null) return mult;
  if (b === null) return -mult;
  if (typeof a === 'string' && typeof b === 'string') return mult * a.localeCompare(b, 'de');
  if (typeof a === 'number' && typeof b === 'number') return mult * (a - b);
  if (typeof a === 'boolean' && typeof b === 'boolean') return mult * (Number(a) - Number(b));
  return 0;
}

function applyFilters(rows: Row[], filters: FilterRule[], fields: Field[]): Row[] {
  if (filters.length === 0) return rows;
  return rows.filter((row) => filters.every((f) => matchesFilter(row, f, fields)));
}

function applySorts(rows: Row[], sorts: SortRule[]): Row[] {
  if (sorts.length === 0) return rows;
  return [...rows].sort((a, b) => {
    for (const sort of sorts) {
      const cmp = compareValues(a.cells[sort.fieldId], b.cells[sort.fieldId], sort.direction);
      if (cmp !== 0) return cmp;
    }
    return 0;
  });
}

function applyGroups(rows: Row[], groupByFieldId: string, fields: Field[]): RowGroup[] {
  const field = fields.find((f) => f.id === groupByFieldId);
  if (!field) return [{ groupId: '_all', groupName: 'Alle', groupColor: 'transparent', rows }];

  if (field.type === 'singleSelect') {
    const options = (field.typeOptions.options ?? []) as SelectOption[];
    const groups: RowGroup[] = options.map((opt) => ({
      groupId: opt.id,
      groupName: opt.name,
      groupColor: opt.color,
      rows: [],
    }));

    const groupMap = new Map(groups.map((g) => [g.groupId, g]));

    // Ungrouped bucket for rows with unknown/empty status
    const ungrouped: RowGroup = {
      groupId: '_ungrouped',
      groupName: 'Ohne Status',
      groupColor: 'transparent',
      rows: [],
    };

    for (const row of rows) {
      const val = row.cells[groupByFieldId] as string | null;
      const group = val ? groupMap.get(val) : null;
      if (group) {
        group.rows.push(row);
      } else {
        ungrouped.rows.push(row);
      }
    }

    if (ungrouped.rows.length > 0) groups.push(ungrouped);
    return groups;
  }

  if (field.type === 'checkbox') {
    const checked: RowGroup = {
      groupId: '_checked',
      groupName: 'Erledigt',
      groupColor: '#7c9885',
      rows: [],
    };
    const unchecked: RowGroup = {
      groupId: '_unchecked',
      groupName: 'Offen',
      groupColor: 'transparent',
      rows: [],
    };
    for (const row of rows) {
      if (row.cells[groupByFieldId]) checked.rows.push(row);
      else unchecked.rows.push(row);
    }
    return [unchecked, checked];
  }

  return [{ groupId: '_all', groupName: 'Alle', groupColor: 'transparent', rows }];
}

export function useViewData({
  fields,
  rows,
  views,
  activeViewId,
  includeArchived = false,
  searchQuery = '',
  quickFilters = [],
  currentUserId,
  currentUserName,
}: UseViewDataInput): UseViewDataOutput {
  const activeView = useMemo(
    () => views.find((v) => v.id === activeViewId) ?? views[0] ?? null,
    [views, activeViewId]
  );

  // Hide archived (soft-deleted) cards from every view unless explicitly included.
  const visibleRows = useMemo(
    () => (includeArchived ? rows : rows.filter((r) => !r.archivedAt)),
    [rows, includeArchived]
  );

  // Transient layer: search + quick-filter chips, AND-combined on top of the
  // view's own filters. Not persisted — these are ephemeral board-overview tools.
  const quickFiltered = useMemo(() => {
    const q = searchQuery.trim();
    if (!q && quickFilters.length === 0) return visibleRows;
    const ctx = {
      userId: currentUserId,
      userName: currentUserName,
      today: todayIso(),
      doneIds: doneStatusIds(fields),
    };
    return visibleRows.filter(
      (row) =>
        (!q || matchesSearch(row, q)) &&
        quickFilters.every((qf) => matchesQuickFilter(row, qf, ctx))
    );
  }, [visibleRows, searchQuery, quickFilters, currentUserId, currentUserName, fields]);

  const filteredRows = useMemo(() => {
    if (!activeView) return quickFiltered;
    const filtered = applyFilters(quickFiltered, activeView.filters, fields);
    return applySorts(filtered, activeView.sorts);
  }, [quickFiltered, activeView, fields]);

  const groups = useMemo(() => {
    if (!activeView?.groupByFieldId) {
      return [
        { groupId: '_all', groupName: 'Alle', groupColor: 'transparent', rows: filteredRows },
      ];
    }
    return applyGroups(filteredRows, activeView.groupByFieldId, fields);
  }, [filteredRows, activeView, fields]);

  // Second axis (A12): split rows into lanes by swimlaneFieldId, then group each
  // lane into the normal columns. Only for kanban with a swimlane field set.
  // A12 2D-Swimlanes vorerst deaktiviert — auf true setzen zum Reaktivieren.
  const SWIMLANES_ENABLED: boolean = false;
  const swimlanes = useMemo<SwimlaneGroup[] | null>(() => {
    const swimlaneFieldId = activeView?.swimlaneFieldId;
    const groupByFieldId = activeView?.groupByFieldId;
    if (!SWIMLANES_ENABLED || !swimlaneFieldId || !groupByFieldId || activeView?.layout !== 'kanban')
      return null;
    const lanes = applyGroups(filteredRows, swimlaneFieldId, fields);
    return lanes.map((lane) => ({
      laneId: lane.groupId,
      laneName: lane.groupName,
      laneColor: lane.groupColor,
      groups: applyGroups(lane.rows, groupByFieldId, fields),
    }));
  }, [filteredRows, activeView, fields]);

  return { activeView, fields, filteredRows, groups, swimlanes };
}
