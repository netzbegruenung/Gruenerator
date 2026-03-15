import { useMemo } from 'react';

import type {
  Field,
  Row,
  BoardView,
  RowGroup,
  SelectOption,
  CellValue,
  FilterRule,
  SortRule,
} from '../types';

interface UseViewDataInput {
  fields: Field[];
  rows: Row[];
  views: BoardView[];
  activeViewId: string;
}

interface UseViewDataOutput {
  activeView: BoardView | null;
  fields: Field[];
  filteredRows: Row[];
  groups: RowGroup[];
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
}: UseViewDataInput): UseViewDataOutput {
  const activeView = useMemo(
    () => views.find((v) => v.id === activeViewId) ?? views[0] ?? null,
    [views, activeViewId]
  );

  const filteredRows = useMemo(() => {
    if (!activeView) return rows;
    const filtered = applyFilters(rows, activeView.filters, fields);
    return applySorts(filtered, activeView.sorts);
  }, [rows, activeView, fields]);

  const groups = useMemo(() => {
    if (!activeView?.groupByFieldId) {
      return [
        { groupId: '_all', groupName: 'Alle', groupColor: 'transparent', rows: filteredRows },
      ];
    }
    return applyGroups(filteredRows, activeView.groupByFieldId, fields);
  }, [filteredRows, activeView, fields]);

  return { activeView, fields, filteredRows, groups };
}
