import AdminUserTable from '../components/AdminUserTable';
import { useInstanceAdminUsers } from '../hooks/useInstanceOverview';

export default function UsersTab() {
  const { data: users, isLoading } = useInstanceAdminUsers();

  return (
    <AdminUserTable
      isLoading={isLoading}
      users={(users ?? []).map((u) => ({
        id: u.id,
        name: u.displayName ?? u.email ?? u.id,
        email: u.email,
        joinedAt: u.createdAt,
        isAdmin: u.isAdmin,
      }))}
    />
  );
}
