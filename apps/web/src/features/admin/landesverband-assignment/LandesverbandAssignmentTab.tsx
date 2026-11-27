import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Badge,
  Button,
  Input,
  Skeleton,
  cn,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@gruenerator/ui';
import { useState } from 'react';

import { AdminEmptyState, AdminPanel } from '../components/adminUi';

import {
  useLandesverbaende,
  useLandesverbandAdmins,
  useAssignLandesverbandAdmin,
  useRevokeLandesverbandAdmin,
  useAdminUserSearch,
} from './hooks/useLvAdminAssignment';

function UserSearchPicker({
  onSelect,
  selectedLabel,
}: {
  onSelect: (user: { id: string; email: string | null; displayName: string | null }) => void;
  selectedLabel: string | null;
}) {
  const [query, setQuery] = useState('');
  const { data: results, isFetching } = useAdminUserSearch(query);

  return (
    <div className="relative">
      <Input
        value={selectedLabel ?? query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Nach Name oder E-Mail suchen..."
        aria-label="Person suchen"
      />
      {query.trim().length >= 2 && (
        <ul className="absolute left-0 top-full z-10 mt-1 w-full max-h-64 overflow-auto rounded-md border border-grey-200 bg-background shadow-lg dark:border-grey-700">
          {isFetching && (
            <li className="px-md py-sm text-sm text-grey-600 dark:text-grey-400">Suche…</li>
          )}
          {!isFetching && (results?.length ?? 0) === 0 && (
            <li className="px-md py-sm text-sm text-grey-600 dark:text-grey-400">
              Keine Person gefunden.
            </li>
          )}
          {results?.map((user) => (
            <li key={user.id}>
              <button
                type="button"
                className="flex w-full flex-col items-start gap-0 px-md py-sm text-left hover:bg-background-alt transition-colors"
                onClick={() => {
                  onSelect(user);
                  setQuery('');
                }}
              >
                <span className="font-medium text-foreground">
                  {user.displayName ?? user.email ?? user.id}
                </span>
                {user.email ? (
                  <span className="text-xs text-grey-600 dark:text-grey-400">{user.email}</span>
                ) : (
                  <span className="text-xs text-red-600">
                    Keine E-Mail hinterlegt — kann nicht zugewiesen werden
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function LandesverbandAssignmentTab() {
  const { data: landesverbaende, isLoading: lvLoading } = useLandesverbaende();
  const [selectedLvId, setSelectedLvId] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<{
    id: string;
    email: string | null;
    displayName: string | null;
  } | null>(null);

  const { data: admins, isLoading: adminsLoading } = useLandesverbandAdmins(selectedLvId);
  const assignMutation = useAssignLandesverbandAdmin();
  const revokeMutation = useRevokeLandesverbandAdmin();

  const handleAssign = () => {
    if (!selectedLvId || !selectedUser?.email) return;
    assignMutation.mutate(
      { landesverbandId: selectedLvId, email: selectedUser.email },
      { onSuccess: () => setSelectedUser(null) }
    );
  };

  const selectedLv = (landesverbaende ?? []).find((lv) => lv.id === selectedLvId) ?? null;

  if (lvLoading) {
    return (
      <div className="flex flex-col gap-sm">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 items-start gap-md lg:grid-cols-[minmax(0,320px)_1fr]">
      <AdminPanel flush title="Landesverbände" aside={`${landesverbaende?.length ?? 0}`}>
        <ul className="m-0 flex list-none flex-col divide-y divide-grey-200 border-t border-grey-200 p-0 dark:divide-grey-800 dark:border-grey-800">
          {(landesverbaende ?? []).map((lv) => (
            <li key={lv.id}>
              <button
                type="button"
                aria-pressed={lv.id === selectedLvId}
                onClick={() => {
                  setSelectedLvId(lv.id);
                  setSelectedUser(null);
                }}
                className={cn(
                  'flex min-h-11 w-full items-center gap-sm px-md py-sm text-left text-sm transition-colors hover:bg-hover-alt',
                  lv.id === selectedLvId &&
                    'bg-grey-100 font-semibold text-foreground-heading dark:bg-grey-800'
                )}
              >
                <span className="min-w-0 flex-1 truncate">
                  {lv.name} <span className="text-grey-600 dark:text-grey-400">({lv.country})</span>
                </span>
                {lv.adminCount === 0 ? (
                  <Badge variant="outline" className="shrink-0 text-xs">
                    ohne Admin
                  </Badge>
                ) : (
                  <span className="shrink-0 text-xs text-grey-600 tabular-nums dark:text-grey-400">
                    {lv.adminCount} {lv.adminCount === 1 ? 'Admin' : 'Admins'}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </AdminPanel>

      {!selectedLv || !selectedLvId ? (
        <AdminEmptyState>
          Wähle links einen Landesverband, um seine Admins zu verwalten.
        </AdminEmptyState>
      ) : (
        <AdminPanel flush title={`Admins · ${selectedLv.name}`}>
          <div className="flex flex-col gap-sm px-md pb-md">
            <div className="grid grid-cols-1 items-start gap-sm sm:grid-cols-[1fr_auto]">
              <UserSearchPicker
                onSelect={setSelectedUser}
                selectedLabel={
                  selectedUser
                    ? (selectedUser.displayName ?? selectedUser.email ?? selectedUser.id)
                    : null
                }
              />
              <Button
                variant="brand"
                onClick={handleAssign}
                disabled={!selectedUser?.email || assignMutation.isPending}
              >
                {assignMutation.isPending ? 'Wird zugewiesen...' : 'Zuweisen'}
              </Button>
            </div>
            {assignMutation.isError && (
              <p className="m-0 text-sm text-red-600 dark:text-red-400">
                {(assignMutation.error as Error).message}
              </p>
            )}
          </div>
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
                    Seit
                  </TableHead>
                  <TableHead className="text-right text-xs font-semibold text-grey-600 dark:text-grey-400">
                    Aktion
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {adminsLoading ? (
                  <TableRow>
                    <TableCell colSpan={4}>
                      <Skeleton className="h-6 w-full" />
                    </TableCell>
                  </TableRow>
                ) : (admins?.length ?? 0) === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="py-lg text-center text-sm text-grey-600 dark:text-grey-400"
                    >
                      Noch keine Admins für diesen Landesverband.
                    </TableCell>
                  </TableRow>
                ) : (
                  admins!.map((admin) => (
                    <TableRow key={admin.userId}>
                      <TableCell className="font-medium">{admin.displayName ?? '—'}</TableCell>
                      <TableCell className="text-sm text-grey-600 dark:text-grey-400">
                        {admin.email ?? '—'}
                      </TableCell>
                      <TableCell className="text-sm text-grey-600 dark:text-grey-400">
                        {new Date(admin.assignedAt).toLocaleDateString('de-DE')}
                      </TableCell>
                      <TableCell className="text-right">
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="sm">
                              Entfernen
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Admin-Rechte entfernen?</AlertDialogTitle>
                              <AlertDialogDescription>
                                {admin.displayName ?? admin.email} verliert die Admin-Rechte für
                                diesen Landesverband.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() =>
                                  revokeMutation.mutate({
                                    landesverbandId: selectedLvId,
                                    userId: admin.userId,
                                  })
                                }
                              >
                                Entfernen
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </AdminPanel>
      )}
    </div>
  );
}
