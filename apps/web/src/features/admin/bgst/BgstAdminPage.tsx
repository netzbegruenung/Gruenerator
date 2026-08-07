import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@gruenerator/ui';
import { Link } from 'react-router-dom';

import withAuthRequired from '../../../components/common/LoginRequired/withAuthRequired';
import PageContainer from '../../../components/common/PageContainer';
import ErrorBoundary from '../../../components/ErrorBoundary';
import AdminUserTable from '../components/AdminUserTable';
import RequireAdmin from '../components/RequireAdmin';

import { useBgstRoleAssignments, useBgstUsers } from './hooks/useBgstOverview';

function RolesTab() {
  const { data: roles, isLoading } = useBgstRoleAssignments();

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

const BgstAdminPage = () => {
  const { data: users, isLoading: usersLoading } = useBgstUsers();

  return (
    <RequireAdmin>
      <ErrorBoundary>
        <PageContainer maxWidth="md">
          <div className="mb-lg pt-md">
            <h1 className="text-3xl font-semibold text-foreground-heading mb-xs">
              BGST-Instanz-Admin
            </h1>
            <p className="text-lg text-grey-500 dark:text-grey-400 m-0">
              Nutzende, Rezepte und Rollenzuteilungen dieser Instanz im Überblick.
            </p>
          </div>

          <Tabs defaultValue="users">
            <TabsList>
              <TabsTrigger value="users">Nutzer:innen</TabsTrigger>
              <TabsTrigger value="skills">Rezepte</TabsTrigger>
              <TabsTrigger value="roles">Rollenübersicht</TabsTrigger>
            </TabsList>

            <TabsContent value="users">
              <AdminUserTable
                isLoading={usersLoading}
                users={(users ?? []).map((u) => ({
                  id: u.id,
                  name: u.displayName ?? u.email ?? u.id,
                  email: u.email,
                  joinedAt: u.createdAt,
                  isAdmin: u.isAdmin,
                }))}
              />
            </TabsContent>

            <TabsContent value="skills">
              <Card>
                <CardHeader>
                  <CardTitle>Rezepte-Sichtbarkeit</CardTitle>
                  <CardDescription>
                    Welche Rezepte diese Instanz im Katalog anbietet.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Link to="/admin/skills" className="text-sm text-primary-600 hover:underline">
                    Rezepte-Sichtbarkeit verwalten →
                  </Link>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="roles">
              <RolesTab />
            </TabsContent>
          </Tabs>
        </PageContainer>
      </ErrorBoundary>
    </RequireAdmin>
  );
};

export default withAuthRequired(BgstAdminPage, {
  title: 'BGST-Instanz-Admin',
});
