import {
  Badge,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  Skeleton,
} from '@gruenerator/ui';
import { useMemo, useState } from 'react';
import { FaUsers } from 'react-icons/fa';

import type { ColumnDef } from '@tanstack/react-table';

import {
  TableProvider,
  TableHeader,
  TableHeaderGroup,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from '@/components/kibo-ui/table';

/**
 * Shared minimal-fields user table for admin surfaces (BGST overview, LV
 * user list, LV-admin assignment picker). Columns are fixed on purpose —
 * name, email, a role/status badge, joined date — no prop for arbitrary
 * extra columns, which is the enforcement point for data minimalism: adding
 * a PII field here requires a conscious code change, not a prop.
 */
export interface AdminUserRow {
  id: string;
  name: string;
  email: string | null;
  joinedAt: string | null;
  isAdmin?: boolean;
  /** Undefined = not applicable to this surface (no badge shown). */
  emailVerified?: boolean;
}

interface AdminUserTableProps {
  users: AdminUserRow[];
  isLoading: boolean;
  emptyLabel?: string;
  pageSize?: number;
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export default function AdminUserTable({
  users,
  isLoading,
  emptyLabel = 'Keine Nutzer:innen gefunden.',
  pageSize = 25,
}: AdminUserTableProps) {
  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(users.length / pageSize));
  const pageUsers = useMemo(
    () => users.slice(page * pageSize, page * pageSize + pageSize),
    [users, page, pageSize]
  );

  const columns: ColumnDef<AdminUserRow>[] = useMemo(
    () => [
      {
        accessorKey: 'name',
        header: 'Name',
        cell: ({ row }) => (
          <div className="flex items-center gap-sm">
            <span className="font-medium text-foreground-heading">{row.original.name}</span>
            {row.original.isAdmin && (
              <Badge variant="secondary" className="text-xs">
                Admin
              </Badge>
            )}
            {row.original.emailVerified === false && (
              <Badge variant="outline" className="text-xs">
                E-Mail nicht verifiziert
              </Badge>
            )}
          </div>
        ),
      },
      {
        accessorKey: 'email',
        header: 'E-Mail',
        cell: ({ row }) => (
          <span className="text-sm text-grey-500">{row.original.email ?? '—'}</span>
        ),
      },
      {
        accessorKey: 'joinedAt',
        header: 'Beitritt',
        cell: ({ row }) => (
          <span className="text-sm text-grey-500">{formatDate(row.original.joinedAt)}</span>
        ),
      },
    ],
    []
  );

  if (isLoading) {
    return (
      <div className="flex flex-col gap-sm">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  if (users.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FaUsers aria-hidden />
          </EmptyMedia>
          <EmptyTitle>{emptyLabel}</EmptyTitle>
          <EmptyDescription />
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="flex flex-col gap-md">
      <div className="rounded-lg border border-grey-200 dark:border-grey-700 overflow-hidden">
        <TableProvider columns={columns} data={pageUsers}>
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
            {({ row }) => (
              <TableRow key={row.id} row={row}>
                {({ cell }) => <TableCell key={cell.id} cell={cell} />}
              </TableRow>
            )}
          </TableBody>
        </TableProvider>
      </div>

      {pageCount > 1 && (
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationLink
                aria-label="Zur vorherigen Seite"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
              >
                ‹
              </PaginationLink>
            </PaginationItem>
            <PaginationItem>
              <span className="px-sm text-sm text-grey-500">
                Seite {page + 1} / {pageCount}
              </span>
            </PaginationItem>
            <PaginationItem>
              <PaginationLink
                aria-label="Zur nächsten Seite"
                onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                disabled={page >= pageCount - 1}
              >
                ›
              </PaginationLink>
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}
    </div>
  );
}
