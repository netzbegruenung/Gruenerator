import { memo, useMemo, useCallback } from 'react';

import { FIELD_IDS } from '../types';

import type { Field, Row, SelectOption, CellValue } from '../types';
import type { ColumnDef } from '@tanstack/react-table';

import {
  TableProvider,
  TableHeader,
  TableHeaderGroup,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableColumnHeader,
} from '@/components/kibo-ui/table';

interface BoardTableViewProps {
  fields: Field[];
  rows: Row[];
  onRowClick: (row: Row) => void;
  onCellUpdate: (rowId: string, fieldId: string, value: CellValue) => void;
}

type TableRowData = {
  _row: Row;
  [key: string]: unknown;
};

function CellRenderer({ field, value }: { field: Field; value: unknown }) {
  if (value === null || value === undefined || value === '') {
    return <span className="text-grey-300">—</span>;
  }

  switch (field.type) {
    case 'singleSelect': {
      const options = (field.typeOptions.options ?? []) as SelectOption[];
      const opt = options.find((o) => o.id === value);
      if (!opt) return <span className="text-grey-300">—</span>;
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ring-grey-200 dark:ring-grey-600 text-foreground">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: opt.color }} />
          {opt.name}
        </span>
      );
    }
    case 'multiSelect': {
      const ids = Array.isArray(value) ? value : [];
      const options = (field.typeOptions.options ?? []) as SelectOption[];
      const selected = options.filter((o) => ids.includes(o.id));
      if (selected.length === 0) return <span className="text-grey-300">—</span>;
      return (
        <div className="flex flex-wrap gap-1">
          {selected.map((opt) => (
            <span
              key={opt.id}
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ring-grey-200 dark:ring-grey-600 text-foreground"
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: opt.color }} />
              {opt.name}
            </span>
          ))}
        </div>
      );
    }
    case 'date': {
      if (typeof value !== 'string') return <span className="text-grey-300">—</span>;
      return (
        <span className="text-xs text-grey-500">
          {new Date(value).toLocaleDateString('de-DE', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
          })}
        </span>
      );
    }
    case 'checkbox':
      return (
        <span className={value ? 'text-primary-600' : 'text-grey-300'}>{value ? '✓' : '○'}</span>
      );
    case 'url':
      return typeof value === 'string' ? (
        <a
          href={value}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-primary-600 dark:text-primary-400 hover:underline truncate max-w-[200px] block"
          onClick={(e) => e.stopPropagation()}
        >
          {value}
        </a>
      ) : (
        <span className="text-grey-300">—</span>
      );
    case 'number':
      return <span className="text-xs tabular-nums">{String(value)}</span>;
    default:
      return <span className="text-sm truncate max-w-[300px] block">{String(value)}</span>;
  }
}

export const BoardTableView = memo(function BoardTableView({
  fields,
  rows,
  onRowClick,
}: BoardTableViewProps) {
  const visibleFields = useMemo(
    () => fields.filter((f) => f.id !== FIELD_IDS.DESCRIPTION).sort((a, b) => a.order - b.order),
    [fields]
  );

  const columns: ColumnDef<TableRowData>[] = useMemo(
    () =>
      visibleFields.map((field) => ({
        id: field.id,
        accessorKey: field.id,
        header: ({ column }) => <TableColumnHeader column={column} title={field.name} />,
        cell: ({ row: tableRow }) => {
          const value = tableRow.original[field.id];
          const rowData = tableRow.original as TableRowData;
          if (field.id === FIELD_IDS.TITLE && rowData._row.icon) {
            return (
              <span className="text-sm truncate max-w-[300px] flex items-center gap-1.5">
                <span>{rowData._row.icon}</span>
                {String(value ?? '')}
              </span>
            );
          }
          return <CellRenderer field={field} value={value} />;
        },
        enableSorting: ['text', 'number', 'date'].includes(field.type),
      })),
    [visibleFields]
  );

  const tableData: TableRowData[] = useMemo(
    () =>
      rows.map((row) => ({
        _row: row,
        ...row.cells,
      })),
    [rows]
  );

  const handleRowClick = useCallback(
    (tableRow: TableRowData) => onRowClick(tableRow._row),
    [onRowClick]
  );

  return (
    <div className="flex-1 overflow-auto p-md sm:p-lg">
      <div className="rounded-lg border border-grey-200 dark:border-grey-700 overflow-hidden">
        <TableProvider columns={columns} data={tableData}>
          <TableHeader>
            {({ headerGroup }) => (
              <TableHeaderGroup key={headerGroup.id} headerGroup={headerGroup}>
                {({ header }) => (
                  <TableHead
                    key={header.id}
                    header={header}
                    className="text-xs font-medium text-grey-400 bg-grey-50 dark:bg-[#1e1e1e]"
                  />
                )}
              </TableHeaderGroup>
            )}
          </TableHeader>
          <TableBody>
            {({ row: tableRow }) => (
              <TableRow
                key={tableRow.id}
                row={tableRow}
                className="cursor-pointer hover:bg-grey-50 dark:hover:bg-grey-800/50 transition-colors [&>td]:py-2.5 [&>td]:px-3"
                onClick={() => handleRowClick(tableRow.original as TableRowData)}
              >
                {({ cell }) => {
                  const isTitle = cell.column.id === FIELD_IDS.TITLE;
                  return (
                    <TableCell key={cell.id} cell={cell} className={isTitle ? 'font-medium' : ''} />
                  );
                }}
              </TableRow>
            )}
          </TableBody>
        </TableProvider>
      </div>
    </div>
  );
});
