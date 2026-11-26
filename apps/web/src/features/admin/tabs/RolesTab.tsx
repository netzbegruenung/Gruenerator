import {
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@gruenerator/ui';

import { AdminEmptyState, AdminPanel } from '../components/adminUi';
import { useInstanceAdminRoleAssignments } from '../hooks/useInstanceOverview';

/**
 * Selbstauskunft, keine Vergabe: die Rollen stehen als JSON in
 * `profiles.user_defaults.profile.roles` und werden hier nur gelesen.
 */
export default function RolesTab() {
  const { data: roles, isLoading } = useInstanceAdminRoleAssignments();

  if (isLoading) {
    return (
      <AdminPanel flush>
        <div className="flex flex-col gap-sm p-md">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </AdminPanel>
    );
  }

  if (!roles || roles.length === 0) {
    return <AdminEmptyState>Noch keine Rollen hinterlegt.</AdminEmptyState>;
  }

  return (
    <AdminPanel flush>
      <div className="overflow-x-auto border-t border-grey-200 dark:border-grey-800">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs font-semibold text-grey-600 dark:text-grey-400">
                Name
              </TableHead>
              <TableHead className="text-xs font-semibold text-grey-600 dark:text-grey-400">
                E-Mail
              </TableHead>
              <TableHead className="text-xs font-semibold text-grey-600 dark:text-grey-400">
                Rollen
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {roles.map((entry) => (
              <TableRow key={entry.userId}>
                <TableCell className="font-medium">{entry.displayName ?? '—'}</TableCell>
                <TableCell className="text-sm text-grey-600 dark:text-grey-400">
                  {entry.email ?? '—'}
                </TableCell>
                <TableCell className="text-sm text-grey-600 dark:text-grey-400">
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
    </AdminPanel>
  );
}
