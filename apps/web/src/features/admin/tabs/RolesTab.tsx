import {
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@gruenerator/ui';

import { useInstanceAdminRoleAssignments } from '../hooks/useInstanceOverview';

/**
 * Selbstauskunft, keine Vergabe: die Rollen stehen als JSON in
 * `profiles.user_defaults.profile.roles` und werden hier nur gelesen.
 */
export default function RolesTab() {
  const { data: roles, isLoading } = useInstanceAdminRoleAssignments();

  if (isLoading) {
    return (
      <div className="flex flex-col gap-sm">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  if (!roles || roles.length === 0) {
    return (
      <p className="text-sm text-grey-500 dark:text-grey-400 py-lg text-center">
        Noch keine Rollen hinterlegt.
      </p>
    );
  }

  return (
    <div className="rounded-lg border border-grey-200 dark:border-grey-700 overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>E-Mail</TableHead>
            <TableHead>Rollen</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {roles.map((entry) => (
            <TableRow key={entry.userId}>
              <TableCell className="font-medium">{entry.displayName ?? '—'}</TableCell>
              <TableCell className="text-sm text-grey-500">{entry.email ?? '—'}</TableCell>
              <TableCell className="text-sm text-grey-500">
                {(entry.roles ?? [])
                  .map((r) => (typeof r.rolle === 'string' ? r.rolle : null))
                  .filter(Boolean)
                  .join(', ') || '—'}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
