import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  TableBody as TableBodyRaw,
  TableCell as TableCellRaw,
  TableHeader as TableHeaderRaw,
  TableHead as TableHeadRaw,
  Table as TableRaw,
  TableRow as TableRowRaw,
} from '@gruenerator/ui';
import {
  createSortedRowModel,
  flexRender,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_datetime,
  sortFn_text,
  tableFeatures,
  useTable,
} from '@tanstack/react-table';
import { atom, Provider, useAtom } from 'jotai';
import { ArrowDownIcon, ArrowUpIcon, ChevronsUpDownIcon } from 'lucide-react';
import { createContext, memo, useCallback, useContext } from 'react';

import type {
  Cell as CellBase,
  Column as ColumnBase,
  ColumnDef as ColumnDefBase,
  Header as HeaderBase,
  HeaderGroup as HeaderGroupBase,
  Row as RowBase,
  RowData,
  SortingState,
  Table as TableBase,
} from '@tanstack/react-table';
import type { HTMLAttributes, ReactNode } from 'react';

import { cn } from '@/utils/cn';

// The column auto-sort resolves 'datetime' / 'alphanumeric' / 'text' by name.
const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric, datetime: sortFn_datetime, text: sortFn_text },
});

type Features = typeof features;

export type ColumnDef<TData extends RowData, TValue = unknown> = ColumnDefBase<
  Features,
  TData,
  TValue
>;
type Cell<TData extends RowData, TValue> = CellBase<Features, TData, TValue>;
type Column<TData extends RowData, TValue> = ColumnBase<Features, TData, TValue>;
type Header<TData extends RowData, TValue> = HeaderBase<Features, TData, TValue>;
type HeaderGroup<TData extends RowData> = HeaderGroupBase<Features, TData>;
type Row<TData extends RowData> = RowBase<Features, TData>;
type Table<TData extends RowData> = TableBase<Features, TData>;

// Local change: view state is scoped per provider instance via a jotai <Provider>
// (upstream uses module-global atoms shared by all instances). Re-pulling from the
// kibo-ui registry would reintroduce the globals.
const sortingAtom = atom<SortingState>([]);

export const TableContext = createContext<{
  data: RowData[];
  columns: ColumnDef<RowData, unknown>[];
  table: Table<RowData> | null;
}>({
  data: [],
  columns: [],
  table: null,
});

export type TableProviderProps<TData extends RowData> = {
  columns: ColumnDef<TData>[];
  data: TData[];
  children: ReactNode;
  className?: string;
};

function TableProviderInner<TData extends RowData>({
  columns,
  data,
  children,
  className,
}: TableProviderProps<TData>) {
  const [sorting, setSorting] = useAtom(sortingAtom);
  const table = useTable({
    features,
    data,
    columns,
    onSortingChange: (updater) => {
      const newSorting = typeof updater === 'function' ? updater(sorting) : updater;
      setSorting(newSorting);
    },
    state: {
      sorting,
    },
  });

  return (
    <TableContext.Provider
      value={{
        data,
        columns: columns as never,
        table: table as never,
      }}
    >
      <TableRaw className={className}>{children}</TableRaw>
    </TableContext.Provider>
  );
}

export function TableProvider<TData extends RowData>(props: TableProviderProps<TData>) {
  return (
    <Provider>
      <TableProviderInner {...props} />
    </Provider>
  );
}

export type TableHeadProps = {
  header: Header<RowData, unknown>;
  className?: string;
};

export const TableHead = memo(({ header, className }: TableHeadProps) => (
  <TableHeadRaw className={className} key={header.id}>
    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
  </TableHeadRaw>
));

TableHead.displayName = 'TableHead';

export type TableHeaderGroupProps = {
  headerGroup: HeaderGroup<RowData>;
  children: (props: { header: Header<RowData, unknown> }) => ReactNode;
};

export const TableHeaderGroup = ({ headerGroup, children }: TableHeaderGroupProps) => (
  <TableRowRaw key={headerGroup.id}>
    {headerGroup.headers.map((header) => children({ header }))}
  </TableRowRaw>
);

export type TableHeaderProps = {
  className?: string;
  children: (props: { headerGroup: HeaderGroup<RowData> }) => ReactNode;
};

export const TableHeader = ({ className, children }: TableHeaderProps) => {
  const { table } = useContext(TableContext);

  return (
    <TableHeaderRaw className={className}>
      {table?.getHeaderGroups().map((headerGroup) => children({ headerGroup }))}
    </TableHeaderRaw>
  );
};

export interface TableColumnHeaderProps<
  TData extends RowData,
  TValue,
> extends HTMLAttributes<HTMLDivElement> {
  column: Column<TData, TValue>;
  title: string;
}

export function TableColumnHeader<TData extends RowData, TValue>({
  column,
  title,
  className,
}: TableColumnHeaderProps<TData, TValue>) {
  // Extract inline event handlers to prevent unnecessary re-renders
  const handleSortAsc = useCallback(() => {
    column.toggleSorting(false);
  }, [column]);

  const handleSortDesc = useCallback(() => {
    column.toggleSorting(true);
  }, [column]);

  if (!column.getCanSort()) {
    return <div className={cn(className)}>{title}</div>;
  }

  return (
    <div className={cn('flex items-center space-x-2', className)}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button className="-ml-3 h-8 data-[state=open]:bg-accent" size="sm" variant="ghost">
            <span>{title}</span>
            {column.getIsSorted() === 'desc' ? (
              <ArrowDownIcon className="ml-2 h-4 w-4" />
            ) : column.getIsSorted() === 'asc' ? (
              <ArrowUpIcon className="ml-2 h-4 w-4" />
            ) : (
              <ChevronsUpDownIcon className="ml-2 h-4 w-4" />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onClick={handleSortAsc}>
            <ArrowUpIcon className="mr-2 h-3.5 w-3.5 text-grey-400" />
            Asc
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleSortDesc}>
            <ArrowDownIcon className="mr-2 h-3.5 w-3.5 text-grey-400" />
            Desc
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export type TableCellProps = {
  cell: Cell<RowData, unknown>;
  className?: string;
};

export const TableCell = ({ cell, className }: TableCellProps) => (
  <TableCellRaw className={className}>
    {flexRender(cell.column.columnDef.cell, cell.getContext())}
  </TableCellRaw>
);

export type TableRowProps = {
  row: Row<RowData>;
  children: (props: { cell: Cell<RowData, unknown> }) => ReactNode;
  className?: string;
  onClick?: () => void;
};

export const TableRow = ({ row, children, className, onClick }: TableRowProps) => (
  <TableRowRaw className={className} key={row.id} onClick={onClick}>
    {row.getAllCells().map((cell) => children({ cell }))}
  </TableRowRaw>
);

export type TableBodyProps = {
  children: (props: { row: Row<RowData> }) => ReactNode;
  className?: string;
};

export const TableBody = ({ children, className }: TableBodyProps) => {
  const { columns, table } = useContext(TableContext);
  const rows = table?.getRowModel().rows;

  return (
    <TableBodyRaw className={className}>
      {rows?.length ? (
        rows.map((row) => children({ row }))
      ) : (
        <TableRowRaw>
          <TableCellRaw className="h-24 text-center" colSpan={columns.length}>
            No results.
          </TableCellRaw>
        </TableRowRaw>
      )}
    </TableBodyRaw>
  );
};
