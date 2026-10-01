import AdminUserTable from '../components/AdminUserTable';
import { useInstanceAdminUsers, useSetUserPanda } from '../hooks/useInstanceOverview';

export default function UsersTab() {
  const { data: users, isLoading } = useInstanceAdminUsers();
  const setPanda = useSetUserPanda();

  return (
    <AdminUserTable
      isLoading={isLoading}
      users={(users ?? []).map((u) => ({
        id: u.id,
        name: u.displayName ?? u.email ?? u.id,
        email: u.email,
        joinedAt: u.createdAt,
        isAdmin: u.isAdmin,
        pandaEnabled: u.pandaEnabled,
        pandaEffective: u.pandaEffective,
      }))}
      onPandaChange={(userId, enabled) => setPanda.mutate({ userId, enabled })}
      pandaPendingUserId={setPanda.isPending ? (setPanda.variables?.userId ?? null) : null}
    />
  );
}
