import { useDebouncedSearch } from '@gruenerator/shared/studio-assets';
import { ConfirmDialogProvider, Input, toast, useConfirm } from '@gruenerator/ui';
import { useState } from 'react';

import { useAuthStore } from '../../../stores/authStore';
import { AdminPanel } from '../components/adminUi';
import AdminUserTable, { type AdminUserRow } from '../components/AdminUserTable';
import {
  useInstanceAdminUsers,
  useSetUserAdmin,
  useSetUserPanda,
  useSetUserSites,
} from '../hooks/useInstanceOverview';

function UsersList() {
  const [search, setSearch] = useState('');
  const q = useDebouncedSearch(search);
  const { data: users, isLoading } = useInstanceAdminUsers(q);
  const setPanda = useSetUserPanda();
  const setSites = useSetUserSites();
  const setAdmin = useSetUserAdmin();
  const currentUserId = useAuthStore((s) => s.user?.id ?? null);
  const confirm = useConfirm();

  const handleAdminChange = async (user: AdminUserRow, isAdmin: boolean) => {
    if (isAdmin) {
      const ok = await confirm({
        title: `${user.name} zur Admin machen?`,
        description:
          'Admins sehen alle Nutzer:innen dieser Instanz, moderieren Inhalte und können weitere Admins ernennen.',
        confirmLabel: 'Admin machen',
      });
      if (!ok) return;
    }
    setAdmin.mutate(
      { userId: user.id, isAdmin },
      {
        onSuccess: () =>
          toast.success(isAdmin ? `${user.name} ist jetzt Admin.` : 'Admin-Rechte entzogen.'),
        onError: () => toast.error('Die Änderung ist fehlgeschlagen. Bitte versuche es erneut.'),
      }
    );
  };

  return (
    <div className="flex flex-col gap-md">
      <div className="flex flex-wrap items-center justify-between gap-sm">
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Nach E-Mail oder Name suchen, z. B. bundestag.de"
          aria-label="Nutzer:innen suchen"
          className="max-w-md flex-1 basis-64"
        />
        {!isLoading && (
          <span className="text-sm text-grey-600 tabular-nums dark:text-grey-400">
            {users?.length ?? 0} {users?.length === 1 ? 'Person' : 'Personen'}
          </span>
        )}
      </div>
      <AdminPanel flush>
        <AdminUserTable
          isLoading={isLoading}
          emptyLabel={q ? `Keine Treffer für „${q}".` : 'Keine Nutzer:innen gefunden.'}
          users={(users ?? []).map((u) => ({
            id: u.id,
            name: u.displayName ?? u.email ?? u.id,
            email: u.email,
            joinedAt: u.createdAt,
            isAdmin: u.isAdmin,
            pandaEnabled: u.pandaEnabled,
            pandaEffective: u.pandaEffective,
            sitesUnlocked: u.sitesUnlocked,
          }))}
          onPandaChange={(userId, enabled) => setPanda.mutate({ userId, enabled })}
          pandaPendingUserId={setPanda.isPending ? (setPanda.variables?.userId ?? null) : null}
          onSitesChange={(userId, enabled) => setSites.mutate({ userId, enabled })}
          sitesPendingUserId={setSites.isPending ? (setSites.variables?.userId ?? null) : null}
          onAdminChange={(user, isAdmin) => void handleAdminChange(user, isAdmin)}
          adminPendingUserId={setAdmin.isPending ? (setAdmin.variables?.userId ?? null) : null}
          currentUserId={currentUserId}
        />
      </AdminPanel>
    </div>
  );
}

export default function UsersTab() {
  return (
    <ConfirmDialogProvider>
      <UsersList />
    </ConfirmDialogProvider>
  );
}
