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
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@gruenerator/ui';
import { useState } from 'react';

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
      />
      {query.trim().length >= 2 && (
        <ul className="absolute left-0 top-full z-10 mt-1 w-full max-h-64 overflow-auto rounded-md border border-grey-200 bg-background shadow-lg dark:border-grey-700">
          {isFetching && <li className="px-md py-sm text-sm text-grey-500">Suche…</li>}
          {!isFetching && (results?.length ?? 0) === 0 && (
            <li className="px-md py-sm text-sm text-grey-500">Keine Person gefunden.</li>
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
                {user.email && <span className="text-xs text-grey-500">{user.email}</span>}
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
    <div className="flex flex-col gap-lg">
      <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,240px)_1fr_auto] gap-sm items-start">
        <Select value={selectedLvId ?? undefined} onValueChange={setSelectedLvId}>
          <SelectTrigger>
            <SelectValue placeholder="Landesverband wählen" />
          </SelectTrigger>
          <SelectContent>
            {(landesverbaende ?? []).map((lv) => (
              <SelectItem key={lv.id} value={lv.id}>
                {lv.name} ({lv.country})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <UserSearchPicker
          onSelect={setSelectedUser}
          selectedLabel={
            selectedUser
              ? (selectedUser.displayName ?? selectedUser.email ?? selectedUser.id)
              : null
          }
        />

        <Button
          onClick={handleAssign}
          disabled={!selectedLvId || !selectedUser || assignMutation.isPending}
        >
          {assignMutation.isPending ? 'Wird zugewiesen...' : 'Zuweisen'}
        </Button>
      </div>
      {assignMutation.isError && (
        <p className="text-sm text-red-600">{(assignMutation.error as Error).message}</p>
      )}

      {selectedLvId && (
        <div className="rounded-lg border border-grey-200 dark:border-grey-700 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>E-Mail</TableHead>
                <TableHead>Seit</TableHead>
                <TableHead className="text-right">Aktion</TableHead>
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
                  <TableCell colSpan={4} className="text-center text-sm text-grey-500 py-lg">
                    Noch keine Admins für diesen Landesverband.
                  </TableCell>
                </TableRow>
              ) : (
                admins!.map((admin) => (
                  <TableRow key={admin.userId}>
                    <TableCell className="font-medium">{admin.displayName ?? '—'}</TableCell>
                    <TableCell className="text-sm text-grey-500">{admin.email ?? '—'}</TableCell>
                    <TableCell className="text-sm text-grey-500">
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
      )}
    </div>
  );
}
