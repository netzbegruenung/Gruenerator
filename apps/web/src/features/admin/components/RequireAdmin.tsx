import { Button, Skeleton } from '@gruenerator/ui';
import { type ReactNode } from 'react';
import { FaLock } from 'react-icons/fa';
import { Link } from 'react-router-dom';

import PageContainer from '../../../components/common/PageContainer';
import { useAuthStore } from '../../../stores/authStore';
import { useMyLandesverbandAdminScopes } from '../../landesverband-admin/hooks/useLandesverbandAdmin';

/**
 * Shared "is this user allowed here" gate for admin pages — replaces the
 * copy-pasted `is_admin` check + "Kein Zugriff" fallback that used to live
 * inline in AdminDashboardPage/AdminSkillsPage.
 *
 * `{ type: 'instanceAdmin' }` — today's `user.is_admin === true` check.
 * `{ type: 'lvAdmin', landesverbandId }` — the URL's `landesverbandId` is
 * NEVER trusted directly; it's checked against the backend-verified scope
 * list from `useMyLandesverbandAdminScopes` (which itself always re-derives
 * from the session, see `requireLandesverbandAdmin` server-side). A mismatch
 * renders the exact same "Kein Zugriff" fallback as the `instanceAdmin`
 * case — no different error shape that would hint at whether the LV id
 * exists.
 */
type RequireAdminProps =
  | { type: 'instanceAdmin'; children: ReactNode }
  | { type: 'lvAdmin'; landesverbandId: string; children: ReactNode };

function AccessDenied() {
  const user = useAuthStore((s) => s.user);
  return (
    <PageContainer maxWidth="md">
      <div className="flex flex-col items-center justify-center gap-md py-xl text-center">
        <FaLock aria-hidden className="text-5xl text-grey-400" />
        <h1 className="text-3xl font-semibold">Kein Zugriff</h1>
        <p className="text-grey-600 dark:text-grey-400">
          Du hast keine Berechtigung, den Administrationsbereich zu öffnen. Bitte wende dich an eine
          administrierende Person, falls du Zugriff benötigst.
        </p>
        {user?.email && (
          <p className="text-sm text-grey-500">
            Angemeldet als{' '}
            <span className="font-medium text-grey-700 dark:text-grey-300">{user.email}</span>
          </p>
        )}
        <Button variant="brand" size="brand" asChild>
          <Link to="/workplace">Zurück zum Workplace</Link>
        </Button>
      </div>
    </PageContainer>
  );
}

function InstanceAdminGate({ children }: { children: ReactNode }) {
  const isAdmin = useAuthStore((s) => s.user?.is_admin === true);
  if (!isAdmin) return <AccessDenied />;
  return <>{children}</>;
}

function LvAdminGate({
  landesverbandId,
  children,
}: {
  landesverbandId: string;
  children: ReactNode;
}) {
  const isInstanceAdmin = useAuthStore((s) => s.user?.is_admin === true);
  const { data: scopes, isLoading } = useMyLandesverbandAdminScopes();

  if (isInstanceAdmin) return <>{children}</>;
  if (isLoading) {
    return (
      <PageContainer maxWidth="md">
        <div className="flex flex-col gap-sm py-xl">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      </PageContainer>
    );
  }

  const allowed = (scopes ?? []).some((scope) => scope.id === landesverbandId);
  if (!allowed) return <AccessDenied />;
  return <>{children}</>;
}

export default function RequireAdmin(props: RequireAdminProps) {
  if (props.type === 'lvAdmin') {
    return <LvAdminGate landesverbandId={props.landesverbandId}>{props.children}</LvAdminGate>;
  }
  return <InstanceAdminGate>{props.children}</InstanceAdminGate>;
}
